"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createExam } from "@/lib/firestore";
import { Question, QuestionType } from "@/lib/types";

const defaultQuestion = (): Omit<Question, "id"> => ({
  number: 1,
  type: "multiple",
  content: "",
  options: ["", "", "", ""],
  answer: "",
  explanation: "",
  points: 5,
});

export default function CreateExamPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<Omit<Question, "id">[]>([defaultQuestion()]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function addQuestion() {
    setQuestions((prev) => [
      ...prev,
      { ...defaultQuestion(), number: prev.length + 1 },
    ]);
  }

  function removeQuestion(idx: number) {
    setQuestions((prev) =>
      prev.filter((_, i) => i !== idx).map((q, i) => ({ ...q, number: i + 1 }))
    );
  }

  function updateQuestion(idx: number, patch: Partial<Omit<Question, "id">>) {
    setQuestions((prev) =>
      prev.map((q, i) => (i === idx ? { ...q, ...patch } : q))
    );
  }

  function updateOption(qIdx: number, oIdx: number, value: string) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx) return q;
        const options = [...(q.options ?? [])];
        options[oIdx] = value;
        return { ...q, options };
      })
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!title.trim()) return setError("시험 제목을 입력해주세요.");
    for (const q of questions) {
      if (!q.content.trim()) return setError(`${q.number}번 문제 내용을 입력해주세요.`);
      if (!q.answer.trim()) return setError(`${q.number}번 정답을 입력해주세요.`);
      if (!q.explanation.trim()) return setError(`${q.number}번 해설을 입력해주세요.`);
    }

    setLoading(true);
    try {
      const qs: Question[] = questions.map((q, i) => ({
        ...q,
        id: `q${i + 1}`,
      }));
      const totalPoints = qs.reduce((s, q) => s + q.points, 0);
      const examId = await createExam({
        title,
        description,
        questions: qs,
        totalPoints,
        creatorId: "anonymous",
        isPublic: true,
      });
      router.push(`/exam/${examId}/manage`);
    } catch {
      setError("시험 생성 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">새 시험 만들기</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* 시험 기본 정보 */}
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
            <textarea
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
              rows={2}
              placeholder="시험에 대한 간단한 설명"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        {/* 문제 목록 */}
        {questions.map((q, idx) => (
          <QuestionEditor
            key={idx}
            question={q}
            index={idx}
            onUpdate={(patch) => updateQuestion(idx, patch)}
            onUpdateOption={(oIdx, val) => updateOption(idx, oIdx, val)}
            onRemove={() => removeQuestion(idx)}
            canRemove={questions.length > 1}
          />
        ))}

        <button
          type="button"
          onClick={addQuestion}
          className="border-2 border-dashed border-gray-300 rounded-2xl py-4 text-gray-500 hover:border-blue-400 hover:text-blue-500 transition font-medium"
        >
          + 문제 추가
        </button>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 text-white rounded-xl py-3 font-semibold hover:bg-blue-700 transition disabled:opacity-50"
        >
          {loading ? "생성 중..." : "시험 생성하기"}
        </button>
      </form>
    </div>
  );
}

function QuestionEditor({
  question,
  index,
  onUpdate,
  onUpdateOption,
  onRemove,
  canRemove,
}: {
  question: Omit<Question, "id">;
  index: number;
  onUpdate: (patch: Partial<Omit<Question, "id">>) => void;
  onUpdateOption: (oIdx: number, val: string) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const typeLabels: Record<QuestionType, string> = {
    multiple: "객관식",
    short: "주관식",
    ox: "O/X",
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-700">{question.number}번 문제</h3>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {(["multiple", "short", "ox"] as QuestionType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onUpdate({ type: t, options: t === "multiple" ? ["", "", "", ""] : undefined })}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                  question.type === t
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {typeLabels[t]}
              </button>
            ))}
          </div>
          {canRemove && (
            <button type="button" onClick={onRemove} className="text-red-400 hover:text-red-600 text-sm">
              삭제
            </button>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-600 mb-1">문제 내용 *</label>
        <textarea
          className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          rows={3}
          placeholder="문제를 입력하세요"
          value={question.content}
          onChange={(e) => onUpdate({ content: e.target.value })}
        />
      </div>

      {question.type === "multiple" && (
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-2">보기</label>
          <div className="flex flex-col gap-2">
            {(question.options ?? ["", "", "", ""]).map((opt, oi) => (
              <div key={oi} className="flex items-center gap-2">
                <span className="w-6 text-gray-500 text-sm font-medium shrink-0">
                  {["①", "②", "③", "④", "⑤"][oi]}
                </span>
                <input
                  className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder={`보기 ${oi + 1}`}
                  value={opt}
                  onChange={(e) => onUpdateOption(oi, e.target.value)}
                />
              </div>
            ))}
            {(question.options ?? []).length < 5 && (
              <button
                type="button"
                onClick={() => onUpdate({ options: [...(question.options ?? []), ""] })}
                className="text-xs text-blue-500 hover:underline self-start"
              >
                + 보기 추가
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">정답 *</label>
          {question.type === "ox" ? (
            <select
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={question.answer}
              onChange={(e) => onUpdate({ answer: e.target.value })}
            >
              <option value="">선택</option>
              <option value="O">O (맞다)</option>
              <option value="X">X (틀리다)</option>
            </select>
          ) : (
            <input
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder={question.type === "multiple" ? "예) 1 또는 ①" : "정답 입력"}
              value={question.answer}
              onChange={(e) => onUpdate({ answer: e.target.value })}
            />
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">배점</label>
          <input
            type="number"
            min={1}
            max={100}
            className="w-full border border-gray-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
            value={question.points}
            onChange={(e) => onUpdate({ points: Number(e.target.value) || 1 })}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-600 mb-1">해설 *</label>
        <textarea
          className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          rows={3}
          placeholder="왜 이 답이 맞는지 설명해주세요"
          value={question.explanation}
          onChange={(e) => onUpdate({ explanation: e.target.value })}
        />
      </div>
    </div>
  );
}
