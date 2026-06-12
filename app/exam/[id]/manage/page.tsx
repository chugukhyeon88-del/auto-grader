"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getExam, getExamSubmissions, updateExamAnswerKeys } from "@/lib/firestore";
import { Exam, AnswerKey, Submission } from "@/lib/types";

export default function ManagePage() {
  const { id } = useParams<{ id: string }>();
  const [exam, setExam] = useState<Exam | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<AnswerKey[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const examUrl = typeof window !== "undefined" ? `${window.location.origin}/exam/${id}` : "";

  useEffect(() => {
    Promise.all([getExam(id), getExamSubmissions(id)]).then(([e, s]) => {
      setExam(e);
      setSubmissions(s.sort((a, b) => b.percentage - a.percentage));
      setLoading(false);
    });
  }, [id]);

  function copyUrl() {
    navigator.clipboard.writeText(examUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function startEdit() {
    if (!exam) return;
    setDraft(exam.answerKeys.map((k) => ({ ...k })));
    setEditing(true);
    setSaveMsg("");
  }

  function updateDraft(idx: number, patch: Partial<AnswerKey>) {
    setDraft((prev) => prev.map((k, i) => (i === idx ? { ...k, ...patch } : k)));
  }

  async function saveEdit() {
    const empty = draft.find((k) => !k.answer.trim());
    if (empty) { setSaveMsg(`${empty.number}번 정답을 입력해주세요.`); return; }
    setSaving(true);
    try {
      await updateExamAnswerKeys(id, draft);
      const updated = await getExam(id);
      setExam(updated);
      setEditing(false);
      setSaveMsg("");
    } catch {
      setSaveMsg("저장 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-center py-20 text-gray-400">불러오는 중...</div>;
  if (!exam) return <div className="text-center py-20 text-red-500">시험을 찾을 수 없습니다.</div>;

  const avg = submissions.length
    ? Math.round(submissions.reduce((s, r) => s + r.percentage, 0) / submissions.length)
    : null;

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-5">
      {/* 공유 링크 */}
      <div className="bg-green-50 border border-green-200 rounded-2xl p-6">
        <p className="text-green-700 font-semibold text-lg mb-1">✅ 답안지가 생성되었습니다!</p>
        <p className="text-green-600 text-sm mb-4">아래 링크를 학생들에게 공유하세요.</p>
        <div className="flex gap-2">
          <input readOnly value={examUrl}
            className="flex-1 border border-green-300 rounded-xl px-4 py-2 bg-white text-sm"
          />
          <button onClick={copyUrl}
            className="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-green-700 transition shrink-0 min-w-[60px]">
            {copied ? "복사됨!" : "복사"}
          </button>
        </div>
        <p className="text-xs text-green-600 mt-2">시험 코드: <strong>{id}</strong></p>
      </div>

      {/* 시험 요약 */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h1 className="text-xl font-bold text-gray-800">{exam.title}</h1>
        {exam.description && <p className="text-gray-500 text-sm mt-1">{exam.description}</p>}
        <div className="flex flex-wrap gap-5 mt-4 text-sm text-gray-600">
          <span>문제 수: <strong>{exam.answerKeys.length}문제</strong></span>
          <span>총점: <strong>{exam.totalPoints}점</strong></span>
          <span>응시자: <strong>{submissions.length}명</strong></span>
          {avg !== null && <span>평균 점수: <strong>{avg}%</strong></span>}
        </div>
      </div>

      {/* 정답 확인 / 편집 */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-700">정답 {editing ? "편집" : "확인"}</h2>
          {!editing ? (
            <button onClick={startEdit}
              className="text-sm text-blue-600 hover:text-blue-700 border border-blue-200 rounded-lg px-3 py-1 hover:bg-blue-50 transition">
              ✏️ 정답 수정
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setEditing(false)} disabled={saving}
                className="text-sm text-gray-500 border border-gray-200 rounded-lg px-3 py-1 hover:bg-gray-50 transition disabled:opacity-50">
                취소
              </button>
              <button onClick={saveEdit} disabled={saving}
                className="text-sm text-white bg-blue-600 rounded-lg px-3 py-1 hover:bg-blue-700 transition disabled:opacity-50">
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          )}
        </div>

        {editing && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-4 text-xs text-blue-700 leading-relaxed">
            <p className="font-semibold mb-1">정답 입력 팁</p>
            <p>· 여러 답을 모두 인정하려면 <code className="bg-white px-1 rounded">/</code>로 구분: <code className="bg-white px-1 rounded">서울/서울특별시</code></p>
            <p>· 빈칸이 여러 개인 문제는 <code className="bg-white px-1 rounded">,</code>로 구분(순서 무관): <code className="bg-white px-1 rounded">6,9,12,15</code></p>
            <p>· &quot;3개&quot;와 &quot;3&quot;처럼 단위·띄어쓰기 차이는 자동으로 정답 처리됩니다.</p>
          </div>
        )}

        {!editing ? (
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
            {exam.answerKeys.map((k) => (
              <div key={k.number}
                className="flex flex-col items-center bg-gray-50 border border-gray-200 rounded-xl py-2 px-1">
                <span className="text-xs text-gray-400">{k.number}번</span>
                <span className="font-bold text-gray-800 text-sm break-all text-center">{k.answer}</span>
                <span className="text-xs text-gray-400">{k.points}점</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {draft.map((k, idx) => (
              <div key={k.number}
                className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2">
                <span className="text-xs font-bold text-gray-400 w-7 shrink-0">{k.number}번</span>
                <input
                  className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  value={k.answer}
                  onChange={(e) => updateDraft(idx, { answer: e.target.value })}
                  placeholder="정답"
                />
                <input
                  type="number" min={1} max={100}
                  className="w-12 border border-gray-200 rounded-lg px-1.5 py-1.5 text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-400"
                  value={k.points}
                  onChange={(e) => updateDraft(idx, { points: Number(e.target.value) || 1 })}
                  title="배점"
                />
              </div>
            ))}
          </div>
        )}

        {saveMsg && (
          <div className="mt-3 bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-2.5 text-sm">
            {saveMsg}
          </div>
        )}
      </div>

      {/* 응시 결과 */}
      {submissions.length > 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-700 mb-4">응시 결과 ({submissions.length}명)</h2>

          {/* 평균 점수 바 */}
          {avg !== null && (
            <div className="mb-5">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>평균 점수</span>
                <span>{avg}%</span>
              </div>
              <div className="bg-gray-100 rounded-full h-2.5 overflow-hidden">
                <div className="bg-blue-500 h-full rounded-full" style={{ width: `${avg}%` }} />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {submissions.map((s, rank) => (
              <div key={s.id}
                className="flex items-center justify-between px-4 py-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-gray-400 w-5">{rank + 1}</span>
                  <span className="font-medium text-gray-800">{s.studentName}</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-500">{s.score}/{s.totalPoints}점</span>
                  <span className={`font-bold min-w-[3rem] text-right ${
                    s.percentage >= 80 ? "text-green-600"
                    : s.percentage >= 60 ? "text-yellow-600"
                    : "text-red-500"
                  }`}>{s.percentage}%</span>
                  <Link href={`/exam/${id}/result/${s.id}`}
                    className="text-blue-500 hover:underline text-xs">
                    상세
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-gray-50 rounded-2xl border border-dashed border-gray-300 p-10 text-center text-gray-400">
          아직 응시한 학생이 없습니다.
        </div>
      )}

      <div className="flex gap-3">
        <Link href="/"
          className="flex-1 text-center border border-gray-300 rounded-xl py-2.5 text-gray-600 hover:bg-gray-50 transition">
          홈으로
        </Link>
        <Link href={`/exam/${id}`}
          className="flex-1 text-center bg-blue-600 text-white rounded-xl py-2.5 font-medium hover:bg-blue-700 transition">
          응시 페이지 열기
        </Link>
      </div>
    </div>
  );
}
