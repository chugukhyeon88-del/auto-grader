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

async function parseQuestionsWithClaude(text: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `아래는 시험 문제지에서 추출한 텍스트입니다. 이 텍스트를 분석해서 JSON 배열로 변환해주세요.

각 문제에 대해 다음 형식의 JSON 객체를 만드세요:
{
  "number": 문제번호(숫자),
  "type": "multiple" | "short" | "ox",
  "content": "문제 내용",
  "options": ["보기1", "보기2", "보기3", "보기4"],  // 객관식일 때만
  "answer": "정답",
  "explanation": "해설 (있으면 포함, 없으면 빈 문자열)",
  "points": 배점(숫자, 모르면 5)
}

규칙:
- 객관식(multiple): 번호 보기가 있는 문제 (①②③④ 또는 1.2.3.4. 형식)
- O/X(ox): O 또는 X로 답하는 문제
- 주관식(short): 나머지
- 정답이 명시되어 있으면 포함, 없으면 빈 문자열("")
- 객관식 정답은 번호만 (예: "1", "2", "3", "4")
- 응답은 JSON 배열만, 설명 없이

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

    if (!text || text.trim().length < 10) {
      return NextResponse.json({ error: "파일에서 텍스트를 추출할 수 없습니다." }, { status: 422 });
    }

    const questions = await parseQuestionsWithClaude(text);

    return NextResponse.json({ text: text.slice(0, 3000), questions });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "파일 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
