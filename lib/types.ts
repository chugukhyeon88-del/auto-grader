export type QuestionType = "multiple" | "short" | "ox";

export interface Question {
  id: string;
  number: number;
  type: QuestionType;
  content: string;
  options?: string[];       // 객관식 보기 (multiple)
  answer: string;           // 정답
  explanation: string;      // 해설
  points: number;           // 배점
}

export interface Exam {
  id: string;
  title: string;
  description: string;
  questions: Question[];
  totalPoints: number;
  createdAt: Date;
  creatorId: string;
  isPublic: boolean;
}

export interface StudentAnswer {
  questionId: string;
  answer: string;
}

export interface GradedResult {
  questionId: string;
  questionNumber: number;
  correct: boolean;
  studentAnswer: string;
  correctAnswer: string;
  explanation: string;
  points: number;
  earnedPoints: number;
}

export interface Submission {
  id: string;
  examId: string;
  studentName: string;
  answers: StudentAnswer[];
  results: GradedResult[];
  score: number;
  totalPoints: number;
  percentage: number;
  submittedAt: Date;
}
