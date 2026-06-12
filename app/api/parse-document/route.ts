import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import cfb from "cfb";

export const maxDuration = 60;

// ── PDF 텍스트 추출 (unpdf, 서버리스 호환) ───────────────────
async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

// ── HWP 레코드 파싱 ──────────────────────────────────────────
function parseHwpRecords(data: Buffer): string {
  const texts: string[] = [];
  let i = 0;

  while (i + 4 <= data.length) {
    const header = data.readUInt32LE(i);
    const tagId = header & 0x3ff;
    let size = (header >> 20) & 0xfff;
    i += 4;

    if (size === 0xfff) {
      if (i + 4 > data.length) break;
      size = data.readUInt32LE(i);
      i += 4;
    }

    if (i + size > data.length) break;

    if (tagId === 67 && size > 0) {
      const chunk = data.slice(i, i + size);
      let text = "";
      for (let j = 0; j + 1 < chunk.length; j += 2) {
        const code = chunk.readUInt16LE(j);
        if (code === 13 || code === 10) text += "\n";
        else if (code >= 0x20 && code < 0xfffe) text += String.fromCharCode(code);
      }
      const t = text.trim();
      if (t) texts.push(t);
    }

    i += size;
  }

  return texts.join("\n");
}

// ── 깨진 문자 필터링 ─────────────────────────────────────────
function filterReadable(raw: string): string {
  return raw
    .split("\n")
    .map((line) => {
      const chars = [...line];
      const good = chars.filter((c) => {
        const code = c.charCodeAt(0);
        return (
          (code >= 0x30 && code <= 0x39) ||
          (code >= 0x41 && code <= 0x7a) ||
          (code >= 0xac00 && code <= 0xd7a3) ||
          (code >= 0x3131 && code <= 0x318e) ||
          "①②③④⑤ .,:()\n".includes(c)
        );
      });
      const ratio = chars.length > 0 ? good.length / chars.length : 0;
      return ratio >= 0.5 ? good.join("").trim() : "";
    })
    .filter(Boolean)
    .join("\n");
}

// ── HWP 바이너리 텍스트 추출 ─────────────────────────────────
async function extractTextFromHwp(buffer: Buffer, filename: string): Promise<string> {
  const zlib = await import("zlib");

  // HWPX (ZIP)
  if (filename.endsWith(".hwpx") || (buffer[0] === 0x50 && buffer[1] === 0x4b)) {
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(buffer);
    const texts: string[] = [];
    const sections = Object.keys(zip.files)
      .filter((n) => /Contents\/section\d+\.xml$/i.test(n))
      .sort();
    for (const name of sections) {
      const xml = await zip.files[name].async("text");
      const parts: string[] = [];
      xml.replace(/<hp:t[^>]*>([\s\S]*?)<\/hp:t>/g, (_: string, t: string) => {
        if (t.trim()) parts.push(t.trim());
        return "";
      });
      if (parts.length) texts.push(parts.join(" "));
      else texts.push(xml.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, "\n").trim());
    }
    return texts.join("\n");
  }

  // HWP 바이너리 (OLE/CFB)
  const allTexts: string[] = [];
  try {
    const parsed = cfb.read(buffer, { type: "buffer" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sections = (parsed.FileIndex as any[]).filter(
      (e: { name: string; content?: Uint8Array }) =>
        e.name && /^Section\d*$/i.test(e.name) && e.content?.length
    ).sort((a: { name: string }, b: { name: string }) =>
      parseInt(a.name.replace(/\D/g, "") || "0") -
      parseInt(b.name.replace(/\D/g, "") || "0")
    );

    for (const entry of sections) {
      if (!entry.content) continue;
      const buf = Buffer.from(entry.content);
      // zlib raw inflate (HWP 기본 압축)
      try {
        const dec = zlib.inflateRawSync(buf);
        const t = parseHwpRecords(dec);
        if (t.trim()) allTexts.push(t);
        continue;
      } catch { /* not compressed */ }
      // 비압축 시도
      try {
        const t = parseHwpRecords(buf);
        if (t.trim()) allTexts.push(t);
      } catch { /* skip */ }
    }
  } catch (e) {
    console.warn("cfb error:", e);
  }

  // 추출 실패 시 UTF-16LE 스캔
  if (!allTexts.join("").trim()) {
    const segs: string[] = [];
    let cur = "";
    for (let i = 0; i + 1 < buffer.length; i += 2) {
      const code = buffer.readUInt16LE(i);
      if (
        (code >= 0xac00 && code <= 0xd7a3) ||
        (code >= 0x30 && code <= 0x39) ||
        (code >= 0x41 && code <= 0x7a) ||
        code === 0x20 || code === 0x0a
      ) {
        cur += String.fromCharCode(code);
      } else {
        if (cur.trim().length > 1) segs.push(cur.trim());
        cur = "";
      }
    }
    if (cur.trim()) segs.push(cur.trim());
    allTexts.push(segs.join("\n"));
  }

  return filterReadable(allTexts.join("\n"));
}

// ── 정답 추출 공통 프롬프트 ──────────────────────────────────
const ANSWER_INSTRUCTION = `당신은 시험 답안지(정답표)를 읽고 정답을 정확히 추출하는 전문가입니다.
주어진 답안지에서 모든 문제의 번호·정답·배점을 빠짐없이 추출해 JSON 배열로만 반환하세요.

작업 순서:
1. 먼저 답안지의 전체 구조를 파악합니다 (표 형태인지, 가로/세로 배열인지, 문제 번호 범위는 몇 번부터 몇 번까지인지).
2. 각 문제 번호에 대응하는 정답을 정확히 매칭합니다. 표의 행/열 구조를 반드시 지켜서 번호와 정답이 어긋나지 않게 합니다.
3. 1번부터 마지막 번호까지 빠진 번호가 없는지 검증합니다.

반환 형식 (JSON 배열만, 다른 설명 없이):
[{ "number": 1, "answer": "3", "points": 5 }, { "number": 2, "answer": "O", "points": 5 }]

규칙:
- number: 문제 번호 (정수). 1번부터 끝까지 연속되게, 누락 금지.
- answer:
  - 객관식 정답은 숫자만 ("1"~"5"). ①②③④⑤ 또는 ㄱㄴㄷㄹ 같은 표기는 해당 숫자로 변환.
  - OX 문제는 "O" 또는 "X".
  - 주관식/단답형은 정답 텍스트를 그대로.
  - 정답이 여러 개면 쉼표로 구분 (예: "1,3").
- points: 배점(정수). 명시되지 않으면 5.
- 확실하지 않은 정답도 가장 가능성 높은 값으로 채우되, 절대 번호를 건너뛰지 마세요.
- 출력은 JSON 배열만. 마크다운 코드펜스(\`\`\`)나 설명 문장을 붙이지 마세요.`;

function parseJsonArray(rawText: string) {
  try {
    const m = rawText.match(/\[[\s\S]*\]/);
    return m ? JSON.parse(m[0]) : null;
  } catch {
    return null;
  }
}

// PDF를 Claude에 직접 전달 (비전+텍스트 동시 활용 → 표 구조 정확 인식)
async function parseAnswerKeyFromPdf(buffer: Buffer) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: buffer.toString("base64"),
            },
          },
          { type: "text", text: ANSWER_INSTRUCTION },
        ],
      },
    ],
  });

  const content = msg.content[0];
  if (content.type !== "text") return null;
  return parseJsonArray(content.text);
}

// 추출된 텍스트로 정답 추출 (HWP 등 PDF가 아닌 경우)
async function parseAnswerKeyFromText(text: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: `${ANSWER_INSTRUCTION}\n\n답안지 텍스트:\n${text}`,
      },
    ],
  });

  const content = msg.content[0];
  if (content.type !== "text") return null;
  return parseJsonArray(content.text);
}

// ── API 핸들러 ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });

    const filename = file.name.toLowerCase();
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    if (filename.endsWith(".pdf")) {
      // PDF는 Claude에 직접 전달 (표 구조·레이아웃까지 정확히 인식)
      let answers = await parseAnswerKeyFromPdf(buffer);

      // 보조: 텍스트도 추출해 화면에 보여주고, PDF 직독 실패 시 폴백
      let text = "";
      try {
        text = await extractTextFromPdf(buffer);
      } catch {
        /* 텍스트 추출 실패는 무시 */
      }
      if ((!answers || answers.length === 0) && text.trim().length >= 5) {
        answers = await parseAnswerKeyFromText(text);
      }

      return NextResponse.json({ text: text.slice(0, 5000), answers });
    }

    if (filename.endsWith(".hwp") || filename.endsWith(".hwpx")) {
      const text = await extractTextFromHwp(buffer, filename);
      if (!text?.trim() || text.trim().length < 5) {
        return NextResponse.json(
          { error: "파일에서 텍스트를 추출할 수 없습니다. 한글에서 PDF로 저장 후 업로드하면 정확도가 높아집니다." },
          { status: 422 }
        );
      }
      const answers = await parseAnswerKeyFromText(text);
      return NextResponse.json({ text: text.slice(0, 5000), answers });
    }

    return NextResponse.json({ error: "PDF 또는 HWP/HWPX 파일만 지원합니다." }, { status: 400 });
  } catch (err) {
    console.error("parse-document error:", err);
    return NextResponse.json(
      { error: `파일 처리 오류: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
