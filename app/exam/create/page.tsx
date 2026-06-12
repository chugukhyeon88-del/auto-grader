"use client";
import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createExam } from "@/lib/firestore";
import { AnswerKey } from "@/lib/types";

const ANSWER_TYPES = [
  { label: "객관식", hint: "1, 2, 3, 4, 5" },
  { label: "OX", hint: "O 또는 X" },
  { label: "주관식", hint: "직접 입력" },
];

function makeRows(count: number, prev: AnswerKey[]): AnswerKey[] {
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    answer: prev[i]?.answer ?? "",
    points: prev[i]?.points ?? 5,
  }));
}

export default function CreateExamPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [count, setCount] = useState(20);
  const [rows, setRows] = useState<AnswerKey[]>(() => makeRows(20, []));
  const [defaultPoints, setDefaultPoints] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [uploadState, setUploadState] = useState<"idle" | "parsing" | "done" | "error">("idle");
  const [uploadMsg, setUploadMsg] = useState("");
  const [rawText, setRawText] = useState("");
  const [showRaw, setShowRaw] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function changeCount(n: number) {
    const c = Math.max(1, Math.min(200, n));
    setCount(c);
    setRows((prev) => makeRows(c, prev));
  }

  function applyDefaultPoints(pts: number) {
    setDefaultPoints(pts);
    setRows((prev) => prev.map((r) => ({ ...r, points: pts })));
  }

  function updateRow(idx: number, patch: Partial<AnswerKey>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  // 일괄 정답 붙여넣기: "1 3 2 4 3 O 4 서울..." 또는 줄바꿈
  function handleBulkPaste(text: string) {
    const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
    // 각 줄이 "번호 정답" 또는 "정답"만인 경우 처리
    const parsed: { number: number; answer: string }[] = [];
    lines.forEach((line) => {
      const m = line.match(/^(\d+)[.\s\)]+(.+)/);
      if (m) {
        parsed.push({ number: parseInt(m[1]), answer: m[2].trim() });
      } else if (/^[①②③④⑤OXox\d가-힣a-zA-Z]+$/.test(line)) {
        parsed.push({ number: parsed.length + 1, answer: line });
      }
    });
    if (parsed.length > 0) {
      const newCount = Math.max(count, parsed[parsed.length - 1].number);
      const newRows = makeRows(newCount, rows);
      parsed.forEach(({ number, answer }) => {
        const idx = number - 1;
        if (idx >= 0 && idx < newRows.length) {
          // 원문자 변환
          const ans = answer
            .replace("①", "1").replace("②", "2").replace("③", "3")
            .replace("④", "4").replace("⑤", "5");
          newRows[idx] = { ...newRows[idx], answer: ans };
        }
      });
      setCount(newCount);
      setRows(newRows);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const filename = file.name.toLowerCase();
    setUploadState("parsing");
    setUploadMsg(`"${file.name}" 분석 중...`);
    setRawText("");
    setShowRaw(false);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/parse-document", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setUploadState("error");
        setUploadMsg(data.error ?? "파일 처리 오류");
        return;
      }

      if (data.text) setRawText(data.text);

      if (data.answers && data.answers.length > 0) {
        const parsed: { number: number; answer: string; points: number }[] = data.answers;
        const newCount = Math.max(count, parsed[parsed.length - 1]?.number ?? count);
        const newRows = makeRows(newCount, rows);
        parsed.forEach(({ number, answer, points }) => {
          const idx = number - 1;
          if (idx >= 0 && idx < newRows.length) {
            newRows[idx] = { number, answer: String(answer), points: points ?? defaultPoints };
          }
        });
        setCount(newCount);
        setRows(newRows);
        setUploadState("done");
        setUploadMsg(`${parsed.length}개 문제의 정답을 불러왔습니다. 확인 후 수정하세요.`);
      } else {
        setUploadState("error");
        setUploadMsg(
          "정답을 자동 인식하지 못했습니다. " +
          (filename.endsWith(".hwp")
            ? "HWP 파일은 한글에서 [다른 이름으로 저장 → PDF]로 변환 후 다시 업로드해보세요."
            : "추출된 원문 텍스트를 보고 아래 '정답 일괄 입력' 칸에 직접 입력해주세요.")
        );
        setShowRaw(true);
      }
    } catch {
      setUploadState("error");
      setUploadMsg("네트워크 오류가 발생했습니다.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!title.trim()) return setError("시험 제목을 입력해주세요.");
    const empty = rows.find((r) => !r.answer.trim());
    if (empty) return setError(`${empty.number}번 정답을 입력해주세요.`);

    setLoading(true);
    try {
      const totalPoints = rows.reduce((s, r) => s + r.points, 0);
      const examId = await createExam({
        title,
        description,
        answerKeys: rows,
        totalPoints,
        isPublic: true,
      });
      router.push(`/exam/${examId}/manage`);
    } catch {
      setError("시험 생성 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  const filledCount = rows.filter((r) => r.answer.trim()).length;

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">답안지 만들기</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">

        {/* 기본 정보 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col gap-4">
          <h2 className="font-semibold text-gray-700">시험 정보</h2>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">시험 제목 *</label>
            <input
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="예) 2024년 1학기 중간고사"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">설명 (선택)</label>
            <input
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="예) 3학년 1반 수학 시험"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-600 mb-1">문제 수</label>
              <input
                type="number" min={1} max={200}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={count}
                onChange={(e) => changeCount(Number(e.target.value))}
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-600 mb-1">기본 배점</label>
              <input
                type="number" min={1} max={100}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={defaultPoints}
                onChange={(e) => applyDefaultPoints(Number(e.target.value) || 1)}
              />
            </div>
          </div>
        </div>

        {/* 파일 업로드 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-700 mb-1">
            답안지 파일 업로드
            <span className="text-xs font-normal text-gray-400 ml-2">(선택)</span>
          </h2>
          <div className="flex gap-2 mb-4">
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">PDF 권장</span>
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">HWP / HWPX</span>
          </div>
          <p className="text-xs text-gray-400 mb-4">
            정답이 적힌 파일을 올리면 자동으로 정답을 채워줍니다.<br/>
            <strong className="text-gray-500">HWP는 PDF로 저장 후 업로드하면 인식률이 훨씬 높아집니다.</strong>
          </p>
          <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl py-7 cursor-pointer transition ${
            uploadState === "parsing"
              ? "border-blue-300 bg-blue-50"
              : "border-gray-300 hover:border-blue-400 hover:bg-gray-50"
          }`}>
            <input
              ref={fileRef} type="file" accept=".pdf,.hwp,.hwpx"
              className="hidden" onChange={handleFileUpload}
              disabled={uploadState === "parsing"}
            />
            {uploadState === "parsing" ? (
              <div className="flex items-center gap-2 text-blue-600">
                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                <span className="text-sm font-medium">{uploadMsg}</span>
              </div>
            ) : (
              <>
                <span className="text-3xl">📄</span>
                <span className="text-sm text-gray-500">클릭하거나 파일을 드래그하세요</span>
              </>
            )}
          </label>

          {uploadState === "done" && (
            <div className="mt-3 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm">
              ✅ {uploadMsg}
              {rawText && (
                <button type="button" onClick={() => setShowRaw((v) => !v)}
                  className="ml-2 underline text-xs text-green-600">
                  {showRaw ? "원문 숨기기" : "원문 보기"}
                </button>
              )}
            </div>
          )}
          {uploadState === "error" && (
            <div className="mt-3 bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">
              ❌ {uploadMsg}
            </div>
          )}
          {showRaw && rawText && (
            <div className="mt-3 bg-gray-50 border border-gray-200 rounded-xl p-4 max-h-40 overflow-y-auto">
              <p className="text-xs font-medium text-gray-500 mb-1">추출된 원문</p>
              <pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans">{rawText}</pre>
            </div>
          )}
        </div>

        {/* 일괄 붙여넣기 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-700 mb-1">
            정답 일괄 입력
            <span className="text-xs font-normal text-gray-400 ml-2">(선택)</span>
          </h2>
          <p className="text-xs text-gray-400 mb-3">
            아래 형식으로 붙여넣으면 한번에 입력됩니다.
            <br/>예) <code className="bg-gray-100 px-1 rounded">1. 3</code>&nbsp;
            <code className="bg-gray-100 px-1 rounded">2. O</code>&nbsp;
            <code className="bg-gray-100 px-1 rounded">3. 서울</code>
          </p>
          <textarea
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none font-mono"
            rows={4}
            placeholder={"1. 3\n2. O\n3. 서울\n4. 2\n..."}
            onBlur={(e) => { if (e.target.value.trim()) handleBulkPaste(e.target.value); }}
          />
        </div>

        {/* 정답 테이블 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-700">정답 입력</h2>
            <span className="text-sm text-gray-400">{filledCount}/{count} 입력 완료</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {rows.map((row, idx) => (
              <div key={row.number}
                className={`flex items-center gap-2 border rounded-xl px-3 py-2 ${
                  row.answer.trim() ? "border-blue-200 bg-blue-50" : "border-gray-200"
                }`}
              >
                <span className="text-xs font-bold text-gray-400 w-5 shrink-0">{row.number}</span>
                <input
                  className="flex-1 min-w-0 bg-transparent text-sm font-medium text-gray-800 focus:outline-none placeholder-gray-300"
                  placeholder="정답"
                  value={row.answer}
                  onChange={(e) => updateRow(idx, { answer: e.target.value })}
                />
                <input
                  type="number" min={1} max={100}
                  className="w-8 bg-transparent text-xs text-gray-400 focus:outline-none text-right"
                  value={row.points}
                  onChange={(e) => updateRow(idx, { points: Number(e.target.value) || 1 })}
                  title="배점"
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3">* 오른쪽 숫자는 배점입니다. 클릭해서 수정할 수 있습니다.</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit" disabled={loading}
          className="bg-blue-600 text-white rounded-xl py-3.5 font-semibold hover:bg-blue-700 transition disabled:opacity-50 text-base"
        >
          {loading ? "생성 중..." : `답안지 생성하기 (총 ${rows.reduce((s, r) => s + r.points, 0)}점)`}
        </button>
      </form>
    </div>
  );
}
