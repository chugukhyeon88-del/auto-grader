"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getExam } from "@/lib/firestore";
import { Submission, Exam } from "@/lib/types";

export default function ResultPage() {
  const { id, submissionId } = useParams<{ id: string; submissionId: string }>();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);
  const [openExplanations, setOpenExplanations] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([
      getDoc(doc(db, "submissions", submissionId)),
      getExam(id),
    ]).then(([snap, e]) => {
      if (snap.exists()) setSubmission({ ...snap.data(), id: snap.id } as Submission);
      setExam(e);
      setLoading(false);
    });
  }, [id, submissionId]);

  function toggleExplanation(questionId: string) {
    setOpenExplanations((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  }

  function openAllWrong() {
    if (!submission) return;
    const wrongIds = submission.results.filter((r) => !r.correct).map((r) => r.questionId);
    setOpenExplanations(new Set(wrongIds));
  }

  if (loading) return <div className="text-center py-20 text-gray-400">불러오는 중...</div>;
  if (!submission || !exam) return <div className="text-center py-20 text-red-500">결과를 찾을 수 없습니다.</div>;

  const wrongCount = submission.results.filter((r) => !r.correct).length;
  const correctCount = submission.results.filter((r) => r.correct).length;

  const grade =
    submission.percentage >= 90 ? { label: "A", color: "text-green-600" }
    : submission.percentage >= 80 ? { label: "B", color: "text-blue-600" }
    : submission.percentage >= 70 ? { label: "C", color: "text-yellow-600" }
    : submission.percentage >= 60 ? { label: "D", color: "text-orange-500" }
    : { label: "F", color: "text-red-600" };

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6">
      {/* 점수 카드 */}
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
        <p className="text-gray-500 mb-1">{submission.studentName}님의 채점 결과</p>
        <h1 className="text-2xl font-bold text-gray-800 mb-6">{exam.title}</h1>

        <div className="flex items-center justify-center gap-8">
          <div>
            <div className={`text-6xl font-bold ${grade.color}`}>{grade.label}</div>
            <div className="text-gray-400 text-sm mt-1">등급</div>
          </div>
          <div className="text-left">
            <div className="text-4xl font-bold text-gray-800">
              {submission.score}
              <span className="text-xl text-gray-400">/{submission.totalPoints}</span>
            </div>
            <div className="text-2xl font-semibold text-gray-500">{submission.percentage}점</div>
          </div>
        </div>

        <div className="flex justify-center gap-8 mt-6 text-sm">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{correctCount}</div>
            <div className="text-gray-500">정답</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-500">{wrongCount}</div>
            <div className="text-gray-500">오답</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-800">{exam.questions.length}</div>
            <div className="text-gray-500">전체</div>
          </div>
        </div>

        {/* 진행바 */}
        <div className="mt-6 bg-gray-100 rounded-full h-3 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              submission.percentage >= 80 ? "bg-green-500" : submission.percentage >= 60 ? "bg-yellow-500" : "bg-red-500"
            }`}
            style={{ width: `${submission.percentage}%` }}
          />
        </div>
      </div>

      {/* 오답 해설 버튼 */}
      {wrongCount > 0 && (
        <div className="flex gap-3">
          <button
            onClick={openAllWrong}
            className="flex-1 bg-orange-50 border border-orange-200 text-orange-700 rounded-xl py-3 font-medium hover:bg-orange-100 transition"
          >
            틀린 문제 해설 모두 열기 ({wrongCount}개)
          </button>
        </div>
      )}

      {/* 문제별 결과 */}
      <div className="flex flex-col gap-3">
        <h2 className="font-semibold text-gray-700">문제별 결과</h2>
        {submission.results.map((result) => {
          const question = exam.questions.find((q) => q.id === result.questionId);
          const isOpen = openExplanations.has(result.questionId);
          return (
            <div
              key={result.questionId}
              className={`bg-white rounded-2xl border p-5 transition ${
                result.correct ? "border-green-200" : "border-red-200"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1">
                  <span
                    className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      result.correct
                        ? "bg-green-100 text-green-600"
                        : "bg-red-100 text-red-600"
                    }`}
                  >
                    {result.correct ? "✓" : "✗"}
                  </span>
                  <div className="flex-1">
                    <div className="font-medium text-gray-800">
                      {result.questionNumber}번. {question?.content}
                    </div>
                    <div className="flex gap-4 mt-2 text-sm">
                      <span className="text-gray-500">
                        내 답: <strong className={result.correct ? "text-green-600" : "text-red-500"}>
                          {result.studentAnswer || "(미응답)"}
                        </strong>
                      </span>
                      {!result.correct && (
                        <span className="text-gray-500">
                          정답: <strong className="text-green-600">{result.correctAnswer}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-sm font-semibold ${result.correct ? "text-green-600" : "text-gray-400"}`}>
                    {result.earnedPoints}/{result.points}점
                  </span>
                  <button
                    onClick={() => toggleExplanation(result.questionId)}
                    className="text-xs text-blue-500 hover:text-blue-700 border border-blue-200 rounded-lg px-2.5 py-1 hover:bg-blue-50 transition"
                  >
                    {isOpen ? "해설 닫기" : "해설 보기"}
                  </button>
                </div>
              </div>

              {/* 해설 */}
              {isOpen && (
                <div className="mt-4 bg-blue-50 rounded-xl p-4 border border-blue-100">
                  <p className="text-xs font-semibold text-blue-600 mb-1.5">📚 해설</p>
                  <p className="text-sm text-blue-800 leading-relaxed">{result.explanation}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex gap-3 pb-4">
        <Link href="/" className="flex-1 text-center border border-gray-300 rounded-xl py-2.5 text-gray-600 hover:bg-gray-50 transition">
          홈으로
        </Link>
        <Link href={`/exam/${id}`} className="flex-1 text-center bg-blue-600 text-white rounded-xl py-2.5 font-medium hover:bg-blue-700 transition">
          다시 응시하기
        </Link>
      </div>
    </div>
  );
}
