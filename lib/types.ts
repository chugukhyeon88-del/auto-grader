export interface AnswerKey {
  number: number;   // 문제 번호
  answer: string;   // 정답
  points: number;   // 배점
}

export interface Exam {
  id: string;
  title: string;
  description: string;
  answerKeys: AnswerKey[];
  totalPoints: number;
  createdAt: Date;
  isPublic: boolean;
}

export interface StudentAnswer {
  number: number;
  answer: string;
}

export interface GradedResult {
  number: number;
  correct: boolean;
  studentAnswer: string;
  correctAnswer: string;
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
