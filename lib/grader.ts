import { AnswerKey, StudentAnswer, GradedResult } from "./types";

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "");
}

function isCorrect(key: AnswerKey, studentAnswer: string): boolean {
  const correct = normalize(key.answer);
  const given = normalize(studentAnswer);
  if (!given) return false;

  // OX 정규화
  const toOX = (v: string) =>
    v === "o" || v === "0" || v === "맞다" || v === "맞음" || v === "true" ? "o" : "x";

  if (correct === "o" || correct === "x") {
    return toOX(correct) === toOX(given);
  }

  return correct === given;
}

export function gradeExam(
  answerKeys: AnswerKey[],
  answers: StudentAnswer[]
): GradedResult[] {
  const answerMap = new Map(answers.map((a) => [a.number, a.answer]));

  return answerKeys.map((key) => {
    const studentAnswer = answerMap.get(key.number) ?? "";
    const correct = isCorrect(key, studentAnswer);
    return {
      number: key.number,
      correct,
      studentAnswer,
      correctAnswer: key.answer,
      points: key.points,
      earnedPoints: correct ? key.points : 0,
    };
  });
}
