"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getExam, submitAnswers } from "@/lib/firestore";
import { Exam } from "@/lib/types";

export default function TakeExamPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [exam, setExam] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);
  const [studentName, setStudentName] = useState("");
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getExam(id).then((e) => { setExam(e); setLoading(false); });
  }, [id]);

  function setAnswer(number: number, value: string) {
    setAnswers((prev) => ({ ...prev, [number]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!studentName.trim()) return setError("이름을 입력해주세요.");
    if (!exam) return;

    setSubmitting(true);
    try {
      const answerList = exam.answerKeys.map((k) => ({
        number: k.number,
        answer: answers[k.number] ?? "",
      }));
      const submission = await submitAnswers(id, studentName, answerList);
      router.push(`/exam/${id}/result/${submission.id}`);
    } catch {
      setError("제출 중 오류가 발생했습니다.");
      setSubmitting(false);
    }
  }

  if (loading) return <div className="text-center py-20 text-gray-400">불러오는 중...</div>;
  if (!exam) return <div className="text-center py-20 text-red-500">시험을 찾을 수 없습니다.</div>;

  const filledCount = exam.answerKeys.filter((k) => answers[k.number]?.trim()).length;

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-5">
      {/* 시험 정보 */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h1 className="text-2xl font-bold text-gray-800">{exam.title}</h1>
        {exam.description && <p className="text-gray-500 mt-1 text-sm">{exam.description}</p>}
        <div className="flex gap-5 mt-3 text-sm text-gray-500">
          <span>총 <strong>{exam.answerKeys.length}</strong>문제</span>
          <span>총 <strong>{exam.totalPoints}</strong>점</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* 이름 입력 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <label className="block text-sm font-medium text-gray-600 mb-1">이름 *</label>
          <input
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="이름을 입력하세요"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
          />
        </div>

        {/* 답안 입력 그리드 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-700">답안 입력</h2>
            <span className="text-sm text-gray-400">{filledCount}/{exam.answerKeys.length}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {exam.answerKeys.map((key) => {
              const val = answers[key.number] ?? "";
              const filled = val.trim() !== "";
              return (
                <div key={key.number}
                  className={`flex items-center gap-2 border-2 rounded-xl px-3 py-2.5 transition ${
                    filled ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <span className="text-xs font-bold text-gray-400 w-5 shrink-0 text-center">
                    {key.number}
                  </span>
                  <input
                    className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-gray-800 focus:outline-none placeholder-gray-300 text-center"
                    placeholder="답"
                    value={val}
                    onChange={(e) => setAnswer(key.number, e.target.value)}
                    onKeyDown={(e) => {
                      // Enter / Tab으로 다음 칸으로 이동
                      if (e.key === "Enter" || e.key === "Tab") {
                        e.preventDefault();
                        const next = document.querySelector<HTMLInputElement>(
                          `[data-q="${key.number + 1}"]`
                        );
                        next?.focus();
                      }
                    }}
                    data-q={key.number}
                  />
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Enter 또는 Tab으로 다음 칸으로 이동할 수 있습니다.
            빈칸이 여러 개인 문제는 <code className="bg-gray-100 px-1 rounded">6,9,12,15</code>처럼 쉼표로 구분해 입력하세요.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* 제출 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center justify-between">
          <span className="text-sm text-gray-500">
            <span className={filledCount === exam.answerKeys.length ? "text-green-600 font-semibold" : ""}>
              {filledCount}
            </span>/{exam.answerKeys.length} 입력 완료
            {filledCount < exam.answerKeys.length && (
              <span className="text-orange-400 ml-1">
                (미입력 {exam.answerKeys.length - filledCount}문제)
              </span>
            )}
          </span>
          <button
            type="submit" disabled={submitting}
            className="bg-blue-600 text-white px-8 py-2.5 rounded-xl font-semibold hover:bg-blue-700 transition disabled:opacity-50"
          >
            {submitting ? "채점 중..." : "제출하기"}
          </button>
        </div>
      </form>
    </div>
  );
}
