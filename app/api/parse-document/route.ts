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

// ── Claude로 정답 추출 ───────────────────────────────────────
async function parseAnswerKeyWithClaude(text: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `아래는 시험 답안지(정답표)에서 추출한 텍스트입니다.
모든 문제의 정답과 배점을 빠짐없이 추출해 JSON 배열로만 반환하세요. 마지막 문제까지 누락 없이 포함해야 합니다.

반환 형식 (JSON 배열만):
[{ "number": 1, "answer": "3", "points": 5 }, ...]

규칙:
- 객관식 정답: 숫자만 ("1"~"5"), ①②③④⑤ → "1"~"5"
- OX: "O" 또는 "X"
- 주관식: 텍스트 그대로
- 배점 없으면 5
- JSON 배열만, 설명 없이

텍스트:
${text}`,
      },
    ],
  });

  const content = msg.content[0];
  if (content.type !== "text") return null;
  try {
    const m = content.text.match(/\[[\s\S]*\]/);
    return m ? JSON.parse(m[0]) : null;
  } catch {
    return null;
  }
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

    let text = "";
    if (filename.endsWith(".pdf")) {
      text = await extractTextFromPdf(buffer);
    } else if (filename.endsWith(".hwp") || filename.endsWith(".hwpx")) {
      text = await extractTextFromHwp(buffer, filename);
    } else {
      return NextResponse.json({ error: "PDF 또는 HWP/HWPX 파일만 지원합니다." }, { status: 400 });
    }

    if (!text?.trim() || text.trim().length < 5) {
      return NextResponse.json({ error: "파일에서 텍스트를 추출할 수 없습니다. PDF로 변환 후 다시 시도해보세요." }, { status: 422 });
    }

    const answers = await parseAnswerKeyWithClaude(text);
    return NextResponse.json({ text: text.slice(0, 5000), answers });
  } catch (err) {
    console.error("parse-document error:", err);
    return NextResponse.json(
      { error: `파일 처리 오류: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
