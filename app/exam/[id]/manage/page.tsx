"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getExam, getExamSubmissions } from "@/lib/firestore";
import { Exam, Submission } from "@/lib/types";

export default function ManagePage() {
  const { id } = useParams<{ id: string }>();
  const [exam, setExam] = useState<Exam | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const examUrl = typeof window !== "undefined" ? `${window.location.origin}/exam/${id}` : "";

  useEffect(() => {
    Promise.all([getExam(id), getExamSubmissions(id)]).then(([e, s]) => {
      setExam(e);
      setSubmissions(s);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <div className="text-center py-20 text-gray-400">불러오는 중...</div>;
  if (!exam) return <div className="text-center py-20 text-red-500">시험을 찾을 수 없습니다.</div>;

  const avg = submissions.length
    ? Math.round(submissions.reduce((s, r) => s + r.percentage, 0) / submissions.length)
    : null;

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6">
      <div className="bg-green-50 border border-green-200 rounded-2xl p-6">
        <p className="text-green-700 font-semibold text-lg mb-1">✅ 시험이 생성되었습니다!</p>
        <p className="text-green-600 text-sm mb-4">아래 링크를 학생들에게 공유하세요.</p>
        <div className="flex gap-2 items-center">
          <input
            readOnly
            value={examUrl}
            className="flex-1 border border-green-300 rounded-xl px-4 py-2 bg-white text-sm"
          />
          <button
            onClick={() => navigator.clipboard.writeText(examUrl)}
            className="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-green-700 transition shrink-0"
          >
            복사
          </button>
        </div>
        <p className="text-xs text-green-600 mt-2">시험 코드: <strong>{id}</strong></p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h1 className="text-xl font-bold text-gray-800">{exam.title}</h1>
        {exam.description && <p className="text-gray-500 text-sm mt-1">{exam.description}</p>}
        <div className="flex gap-6 mt-4 text-sm text-gray-600">
          <span>문제 수: <strong>{exam.questions.length}문제</strong></span>
          <span>총점: <strong>{exam.totalPoints}점</strong></span>
          <span>응시자: <strong>{submissions.length}명</strong></span>
          {avg !== null && <span>평균: <strong>{avg}점</strong></span>}
        </div>
      </div>

      {submissions.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-700 mb-4">응시 결과</h2>
          <div className="flex flex-col gap-2">
            {submissions
              .sort((a, b) => b.percentage - a.percentage)
              .map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between px-4 py-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition"
                >
                  <span className="font-medium text-gray-800">{s.studentName}</span>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-gray-500">
                      {s.score}/{s.totalPoints}점
                    </span>
                    <span
                      className={`font-bold ${
                        s.percentage >= 80
                          ? "text-green-600"
                          : s.percentage >= 60
                          ? "text-yellow-600"
                          : "text-red-500"
                      }`}
                    >
                      {s.percentage}%
                    </span>
                    <Link
                      href={`/exam/${id}/result/${s.id}`}
                      className="text-blue-500 hover:underline text-xs"
                    >
                      상세보기
                    </Link>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Link href="/" className="flex-1 text-center border border-gray-300 rounded-xl py-2.5 text-gray-600 hover:bg-gray-50 transition">
          홈으로
        </Link>
        <Link href={`/exam/${id}`} className="flex-1 text-center bg-blue-600 text-white rounded-xl py-2.5 font-medium hover:bg-blue-700 transition">
          시험 응시 페이지
        </Link>
      </div>
    </div>
  );
}
