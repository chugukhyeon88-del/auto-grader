import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center gap-12 py-16">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-800 mb-4">자동 채점 시스템</h1>
        <p className="text-gray-500 text-lg max-w-md">
          답안지를 입력하고 학생들과 공유하세요. 답을 제출하면 즉시 채점됩니다.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 flex flex-col gap-4 shadow-sm hover:shadow-md transition">
          <div className="text-4xl">📋</div>
          <h2 className="text-xl font-semibold text-gray-800">답안지 만들기</h2>
          <p className="text-gray-500 text-sm flex-1">
            정답과 배점을 입력하거나 PDF/HWP 파일을 업로드하세요. 링크로 학생들과 공유할 수 있습니다.
          </p>
          <Link href="/exam/create"
            className="mt-2 block text-center bg-blue-600 text-white rounded-xl py-2.5 font-medium hover:bg-blue-700 transition">
            답안지 만들기 →
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-8 flex flex-col gap-4 shadow-sm hover:shadow-md transition">
          <div className="text-4xl">✏️</div>
          <h2 className="text-xl font-semibold text-gray-800">시험 응시하기</h2>
          <p className="text-gray-500 text-sm flex-1">
            시험 코드를 입력하고 답안을 제출하면 즉시 점수와 오답을 확인할 수 있습니다.
          </p>
          <Link href="/exam/take"
            className="mt-2 block text-center bg-green-600 text-white rounded-xl py-2.5 font-medium hover:bg-green-700 transition">
            시험 응시하기 →
          </Link>
        </div>
      </div>

      <div className="bg-blue-50 rounded-2xl p-6 w-full max-w-2xl">
        <h3 className="font-semibold text-blue-800 mb-3">사용 방법</h3>
        <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
          <li>선생님이 <strong>답안지 만들기</strong>에서 정답과 배점을 입력합니다. (PDF/HWP 업로드 가능)</li>
          <li>생성된 <strong>링크 또는 코드</strong>를 학생들에게 공유합니다.</li>
          <li>학생이 문제 번호별 답을 입력하고 제출합니다.</li>
          <li>제출 즉시 점수, 등급, 오답 목록을 확인할 수 있습니다.</li>
        </ol>
      </div>
    </div>
  );
}
