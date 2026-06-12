import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { Exam, Submission, StudentAnswer } from "./types";
import { gradeExam } from "./grader";

export async function createExam(exam: Omit<Exam, "id" | "createdAt">): Promise<string> {
  const ref = await addDoc(collection(db, "exams"), {
    ...exam,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getExam(examId: string): Promise<Exam | null> {
  const snap = await getDoc(doc(db, "exams", examId));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    ...data,
    id: snap.id,
    createdAt: (data.createdAt as Timestamp)?.toDate() ?? new Date(),
  } as Exam;
}

export async function submitAnswers(
  examId: string,
  studentName: string,
  answers: StudentAnswer[]
): Promise<Submission> {
  const exam = await getExam(examId);
  if (!exam) throw new Error("시험을 찾을 수 없습니다.");

  const results = gradeExam(exam.answerKeys, answers);
  const score = results.reduce((sum, r) => sum + r.earnedPoints, 0);
  const percentage = Math.round((score / exam.totalPoints) * 100);

  const submission: Omit<Submission, "id"> = {
    examId,
    studentName,
    answers,
    results,
    score,
    totalPoints: exam.totalPoints,
    percentage,
    submittedAt: new Date(),
  };

  const ref = await addDoc(collection(db, "submissions"), {
    ...submission,
    submittedAt: serverTimestamp(),
  });

  return { ...submission, id: ref.id };
}

export async function getExamSubmissions(examId: string): Promise<Submission[]> {
  const q = query(collection(db, "submissions"), where("examId", "==", examId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      ...data,
      id: d.id,
      submittedAt: (data.submittedAt as Timestamp)?.toDate() ?? new Date(),
    } as Submission;
  });
}
