import { Question, StudentAnswer, GradedResult } from "./types";

function normalizeAnswer(answer: string): string {
  return answer.trim().toLowerCase().replace(/\s+/g, " ");
}

function isCorrect(question: Question, studentAnswer: string): boolean {
  const correct = normalizeAnswer(question.answer);
  const given = normalizeAnswer(studentAnswer);

  if (question.type === "multiple") {
    return correct === given;
  }
  if (question.type === "ox") {
    const correctNorm = correct === "o" || correct === "0" || correct === "true" || correct === "맞다" ? "o" : "x";
    const givenNorm = given === "o" || given === "0" || given === "true" || given === "맞다" ? "o" : "x";
    return correctNorm === givenNorm;
  }
  // 주관식: 공백 무시 완전 일치
  return correct === given;
}

export function gradeExam(
  questions: Question[],
  answers: StudentAnswer[]
): GradedResult[] {
  const answerMap = new Map(answers.map((a) => [a.questionId, a.answer]));

  return questions.map((q) => {
    const studentAnswer = answerMap.get(q.id) ?? "";
    const correct = studentAnswer !== "" && isCorrect(q, studentAnswer);
    return {
      questionId: q.id,
      questionNumber: q.number,
      correct,
      studentAnswer,
      correctAnswer: q.answer,
      explanation: q.explanation,
      points: q.points,
      earnedPoints: correct ? q.points : 0,
    };
  });
}
