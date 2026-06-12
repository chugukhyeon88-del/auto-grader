"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getExam } from "@/lib/firestore";

export default function TakePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const examId = code.trim();
    if (!examId) return setError("시험 코드를 입력해주세요.");
    setLoading(true);
    try {
      const exam = await getExam(examId);
      if (!exam) return setError("해당 시험 코드를 찾을 수 없습니다.");
      router.push(`/exam/${examId}`);
    } catch {
      setError("오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto mt-16">
      <div className="bg-white rounded-2xl border border-gray-200 p-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">시험 응시하기</h1>
        <p className="text-gray-500 text-sm mb-6">선생님께 받은 시험 코드를 입력하세요.</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="시험 코드 입력"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm text-center">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="bg-green-600 text-white rounded-xl py-3 font-semibold hover:bg-green-700 transition disabled:opacity-50"
          >
            {loading ? "확인 중..." : "시험 시작하기"}
          </button>
        </form>
      </div>
    </div>
  );
}
