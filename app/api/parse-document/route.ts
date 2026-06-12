import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse");
  const data = await pdfParse(buffer);
  return data.text;
}

async function extractTextFromHwp(buffer: Buffer, filename: string): Promise<string> {
  const { extractTextFromHwp: extract } = await import("@/lib/parseHwp");
  return extract(buffer, filename);
}

async function parseAnswerKeyWithClaude(text: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `아래는 시험 답안지(정답표)에서 추출한 텍스트입니다.
각 문제의 정답과 배점을 추출해서 JSON 배열로 반환해주세요.

반환 형식 (JSON 배열만, 설명 없이):
[
  { "number": 1, "answer": "3", "points": 5 },
  { "number": 2, "answer": "O", "points": 5 },
  { "number": 3, "answer": "서울", "points": 5 }
]

규칙:
- number: 문제 번호 (숫자)
- answer: 정답 문자열 (객관식이면 번호만, 예: "1","2","3","4" / OX면 "O" 또는 "X" / 주관식이면 텍스트)
- points: 배점 (숫자, 없으면 5)
- 정답 표시가 ①②③④⑤이면 각각 "1","2","3","4","5"로 변환
- 응답은 반드시 JSON 배열만

텍스트:
${text}`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") return null;

  try {
    const jsonMatch = content.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const filename = file.name.toLowerCase();

    let text = "";
    if (filename.endsWith(".pdf")) {
      text = await extractTextFromPdf(buffer);
    } else if (filename.endsWith(".hwp") || filename.endsWith(".hwpx")) {
      text = await extractTextFromHwp(buffer, filename);
    } else {
      return NextResponse.json({ error: "PDF 또는 HWP/HWPX 파일만 지원합니다." }, { status: 400 });
    }

    if (!text || text.trim().length < 5) {
      return NextResponse.json({ error: "파일에서 텍스트를 추출할 수 없습니다." }, { status: 422 });
    }

    const answers = await parseAnswerKeyWithClaude(text);

    return NextResponse.json({ text: text.slice(0, 2000), answers });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "파일 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
