import { AnswerKey, StudentAnswer, GradedResult } from "./types";

/**
 * 정답 표기 규칙
 * - "/" : 복수 허용답 (OR). 하나라도 맞으면 정답.  예) "서울/서울특별시/서울시"
 * - "," : 복수 빈칸 (AND, 순서 무관). 모두 맞아야 정답.  예) "6,9,12,15"
 * - 두 규칙은 조합 가능. 예) "6,9,12,15 / 육,구,십이,십오"
 *
 * 유사 인정(느슨한 비교):
 * - 앞뒤 공백, 모든 공백, 대소문자 무시
 * - 흔한 단위/조사(개·명·대·원·권·장·번·점 등) 및 문장부호 제거 후 비교
 *   → "3개" == "3", "서울시" == "서울 시"
 */

const UNIT_SUFFIX = /(개|명|대|원|권|장|번|점|마리|살|세|시간|분|초|미터|센티미터|킬로그램|그램|미만|이상|이하|cm|mm|km|kg|g|m|l|°)+$/;

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[\s ]+/g, "")          // 모든 공백 제거
    .replace(/[.,!?;:'"`~()[\]{}<>·•∙\-–—_]/g, ""); // 문장부호/구분기호 제거
}

// 단위 접미사까지 제거한 더 느슨한 형태
function normalizeLoose(s: string): string {
  let v = normalize(s);
  v = v.replace(UNIT_SUFFIX, "");
  return v;
}

function toOX(v: string): string {
  const n = normalize(v);
  if (n === "o" || n === "0" || n === "맞다" || n === "맞음" || n === "true" || n === "정답" || n === "예")
    return "o";
  if (n === "x" || n === "틀리다" || n === "틀림" || n === "false" || n === "아니오" || n === "아니요")
    return "x";
  return n;
}

// 두 단일 답이 같은지 (유사 인정 포함)
function singleMatch(correct: string, given: string): boolean {
  // OX 처리
  const c = normalize(correct);
  if (c === "o" || c === "x") {
    return toOX(correct) === toOX(given);
  }
  // 일반 비교: 엄격 → 느슨 순으로
  if (normalize(correct) === normalize(given)) return true;
  if (normalizeLoose(correct) === normalizeLoose(given) && normalizeLoose(correct) !== "")
    return true;
  return false;
}

// 정답 문자열을 허용답(OR) 목록으로 분리
function splitAlternatives(answer: string): string[] {
  return answer.split("/").map((s) => s.trim()).filter(Boolean);
}

// 복수 빈칸(AND) 집합으로 분리
function splitBlanks(answer: string): string[] {
  return answer.split(",").map((s) => s.trim()).filter(Boolean);
}

function isCorrect(key: AnswerKey, studentAnswer: string): boolean {
  const given = studentAnswer.trim();
  if (!given) return false;

  const alternatives = splitAlternatives(key.answer);

  // 각 허용답(OR)에 대해 검사 — 하나라도 통과하면 정답
  return alternatives.some((alt) => {
    const correctBlanks = splitBlanks(alt);

    if (correctBlanks.length <= 1) {
      // 단일 정답
      return singleMatch(alt, given);
    }

    // 복수 빈칸: 학생 답도 분해 (콤마/공백/슬래시 모두 구분자로 허용)
    const givenParts = given
      .split(/[,/\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (givenParts.length !== correctBlanks.length) return false;

    // 순서 무관 매칭: 각 정답 빈칸이 학생 답 중 하나와 매칭되어야 함
    const used = new Array(givenParts.length).fill(false);
    return correctBlanks.every((cb) => {
      const idx = givenParts.findIndex((gp, i) => !used[i] && singleMatch(cb, gp));
      if (idx === -1) return false;
      used[idx] = true;
      return true;
    });
  });
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
