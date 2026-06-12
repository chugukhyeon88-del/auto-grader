"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Submission } from "@/lib/types";

export default function ResultPage() {
  const { id, submissionId } = useParams<{ id: string; submissionId: string }>();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDoc(doc(db, "submissions", submissionId)).then((snap) => {
      if (snap.exists()) setSubmission({ ...snap.data(), id: snap.id } as Submission);
      setLoading(false);
    });
  }, [submissionId]);

  if (loading) return <div className="text-center py-20 text-gray-400">불러오는 중...</div>;
  if (!submission) return <div className="text-center py-20 text-red-500">결과를 찾을 수 없습니다.</div>;

  const wrongList = submission.results.filter((r) => !r.correct);
  const correctList = submission.results.filter((r) => r.correct);

  const grade =
    submission.percentage >= 90 ? { label: "A", color: "text-green-600", bg: "bg-green-50" }
    : submission.percentage >= 80 ? { label: "B", color: "text-blue-600", bg: "bg-blue-50" }
    : submission.percentage >= 70 ? { label: "C", color: "text-yellow-600", bg: "bg-yellow-50" }
    : submission.percentage >= 60 ? { label: "D", color: "text-orange-500", bg: "bg-orange-50" }
    : { label: "F", color: "text-red-600", bg: "bg-red-50" };

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-5 pb-8">
      {/* 점수 카드 */}
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
        <p className="text-gray-400 text-sm mb-1">{submission.studentName}님의 채점 결과</p>

        <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full text-4xl font-black mt-3 mb-4 ${grade.bg} ${grade.color}`}>
          {grade.label}
        </div>

        <div className="text-5xl font-black text-gray-800">
          {submission.score}
          <span className="text-2xl font-normal text-gray-400">/{submission.totalPoints}점</span>
        </div>
        <div className="text-xl text-gray-500 mt-1">{submission.percentage}%</div>

        <div className="flex justify-center gap-8 mt-5 text-sm">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{correctList.length}</div>
            <div className="text-gray-400">정답</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-500">{wrongList.length}</div>
            <div className="text-gray-400">오답</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-700">{submission.results.length}</div>
            <div className="text-gray-400">전체</div>
          </div>
        </div>

        <div className="mt-5 bg-gray-100 rounded-full h-3 overflow-hidden">
          <div
            className={`h-full rounded-full ${
              submission.percentage >= 80 ? "bg-green-500"
              : submission.percentage >= 60 ? "bg-yellow-500"
              : "bg-red-500"
            }`}
            style={{ width: `${submission.percentage}%` }}
          />
        </div>
      </div>

      {/* 오답 목록 */}
      {wrongList.length > 0 && (
        <div className="bg-white rounded-2xl border border-red-100 p-6">
          <h2 className="font-semibold text-red-600 mb-4">
            ❌ 틀린 문제 ({wrongList.length}개)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {wrongList.map((r) => (
              <div key={r.number}
                className="flex items-center justify-between bg-red-50 rounded-xl px-4 py-3"
              >
                <span className="font-semibold text-gray-700">{r.number}번</span>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-red-500 line-through">
                    {r.studentAnswer || "(미입력)"}
                  </span>
                  <span className="text-gray-400">→</span>
                  <span className="text-green-600 font-semibold">{r.correctAnswer}</span>
                  <span className="text-gray-400 text-xs">-{r.points}점</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 전체 결과 테이블 */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-700 mb-4">전체 답안 확인</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {submission.results.map((r) => (
            <div key={r.number}
              className={`flex items-center gap-2 rounded-xl px-3 py-2.5 border-2 ${
                r.correct
                  ? "border-green-200 bg-green-50"
                  : "border-red-200 bg-red-50"
              }`}
            >
              <span className={`text-xs font-bold w-5 shrink-0 text-center ${
                r.correct ? "text-green-500" : "text-red-400"
              }`}>
                {r.correct ? "✓" : "✗"}
              </span>
              <span className="text-xs text-gray-400 shrink-0">{r.number}번</span>
              <span className={`flex-1 text-sm font-semibold text-center truncate ${
                r.correct ? "text-green-700" : "text-red-500 line-through"
              }`}>
                {r.studentAnswer || "-"}
              </span>
              {!r.correct && (
                <span className="text-xs text-green-600 font-bold shrink-0">
                  {r.correctAnswer}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <Link href="/"
          className="flex-1 text-center border border-gray-300 rounded-xl py-3 text-gray-600 hover:bg-gray-50 transition font-medium">
          홈으로
        </Link>
        <Link href={`/exam/${id}`}
          className="flex-1 text-center bg-blue-600 text-white rounded-xl py-3 font-semibold hover:bg-blue-700 transition">
          다시 응시하기
        </Link>
      </div>
    </div>
  );
}
