"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getExam, submitAnswers } from "@/lib/firestore";
import { Exam, StudentAnswer } from "@/lib/types";

export default function TakeExamPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [exam, setExam] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);
  const [studentName, setStudentName] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getExam(id).then((e) => {
      setExam(e);
      setLoading(false);
    });
  }, [id]);

  function setAnswer(questionId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!studentName.trim()) return setError("이름을 입력해주세요.");
    if (!exam) return;

    const unanswered = exam.questions.filter((q) => !answers[q.id]?.trim());
    if (unanswered.length > 0) {
      return setError(`${unanswered.map((q) => `${q.number}번`).join(", ")} 문제에 답을 입력해주세요.`);
    }

    setSubmitting(true);
    try {
      const answerList: StudentAnswer[] = exam.questions.map((q) => ({
        questionId: q.id,
        answer: answers[q.id] ?? "",
      }));
      const submission = await submitAnswers(id, studentName, answerList);
      router.push(`/exam/${id}/result/${submission.id}`);
    } catch {
      setError("제출 중 오류가 발생했습니다. 다시 시도해주세요.");
      setSubmitting(false);
    }
  }

  if (loading) return <div className="text-center py-20 text-gray-400">불러오는 중...</div>;
  if (!exam) return <div className="text-center py-20 text-red-500">시험을 찾을 수 없습니다.</div>;

  const answeredCount = exam.questions.filter((q) => answers[q.id]?.trim()).length;

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6">
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h1 className="text-2xl font-bold text-gray-800">{exam.title}</h1>
        {exam.description && <p className="text-gray-500 mt-1">{exam.description}</p>}
        <div className="flex gap-6 mt-3 text-sm text-gray-500">
          <span>{exam.questions.length}문제</span>
          <span>총 {exam.totalPoints}점</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <label className="block text-sm font-medium text-gray-600 mb-1">이름 *</label>
          <input
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="이름을 입력하세요"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
          />
        </div>

        {exam.questions.map((q) => (
          <div key={q.id} className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-semibold text-gray-800">
                <span className="text-blue-600 mr-2">{q.number}.</span>
                {q.content}
              </h3>
              <span className="text-xs text-gray-400 shrink-0 ml-2">{q.points}점</span>
            </div>

            {q.type === "multiple" && q.options && (
              <div className="flex flex-col gap-2 mb-3">
                {q.options.map((opt, oi) => (
                  <label
                    key={oi}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border cursor-pointer transition ${
                      answers[q.id] === String(oi + 1)
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name={q.id}
                      value={String(oi + 1)}
                      checked={answers[q.id] === String(oi + 1)}
                      onChange={() => setAnswer(q.id, String(oi + 1))}
                      className="accent-blue-600"
                    />
                    <span className="text-gray-500 text-sm font-medium">
                      {["①", "②", "③", "④", "⑤"][oi]}
                    </span>
                    <span className="text-gray-700">{opt}</span>
                  </label>
                ))}
              </div>
            )}

            {q.type === "ox" && (
              <div className="flex gap-3 mb-3">
                {["O", "X"].map((val) => (
                  <label
                    key={val}
                    className={`flex-1 flex items-center justify-center py-3 rounded-xl border cursor-pointer text-xl font-bold transition ${
                      answers[q.id] === val
                        ? val === "O"
                          ? "border-blue-500 bg-blue-50 text-blue-600"
                          : "border-red-500 bg-red-50 text-red-600"
                        : "border-gray-200 hover:border-gray-300 text-gray-600"
                    }`}
                  >
                    <input
                      type="radio"
                      name={q.id}
                      value={val}
                      checked={answers[q.id] === val}
                      onChange={() => setAnswer(q.id, val)}
                      className="hidden"
                    />
                    {val}
                  </label>
                ))}
              </div>
            )}

            {q.type === "short" && (
              <input
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="답을 입력하세요"
                value={answers[q.id] ?? ""}
                onChange={(e) => setAnswer(q.id, e.target.value)}
              />
            )}
          </div>
        ))}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center justify-between">
          <span className="text-sm text-gray-500">
            {answeredCount}/{exam.questions.length} 문제 답변 완료
          </span>
          <button
            type="submit"
            disabled={submitting}
            className="bg-blue-600 text-white px-8 py-2.5 rounded-xl font-semibold hover:bg-blue-700 transition disabled:opacity-50"
          >
            {submitting ? "채점 중..." : "제출하기"}
          </button>
        </div>
      </form>
    </div>
  );
}
