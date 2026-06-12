/**
 * HWP/HWPX 파일에서 텍스트 추출
 * - HWPX (.hwpx): ZIP+XML 구조 → JSZip으로 파싱
 * - HWP  (.hwp) : OLE/CFB 구조 → cfb 패키지로 BodyText 스트림 추출 → zlib 해제 → HWP 레코드 파싱
 */

// ───────────────────────────────────────────────────────────
// HWPX (ZIP 기반 XML)
// ───────────────────────────────────────────────────────────
async function extractHwpx(buffer: Buffer): Promise<string> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buffer);
  const texts: string[] = [];

  const sectionFiles = Object.keys(zip.files)
    .filter((name) => /Contents\/section\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const na = parseInt(a.match(/(\d+)\.xml$/)?.[1] ?? "0");
      const nb = parseInt(b.match(/(\d+)\.xml$/)?.[1] ?? "0");
      return na - nb;
    });

  for (const name of sectionFiles) {
    const xml = await zip.files[name].async("text");
    // <hp:t> 태그 내 텍스트 우선 추출
    const hpTexts: string[] = [];
    xml.replace(/<hp:t[^>]*>([\s\S]*?)<\/hp:t>/g, (_: string, inner: string) => {
      const t = inner.trim();
      if (t) hpTexts.push(t);
      return "";
    });

    if (hpTexts.length > 0) {
      texts.push(hpTexts.join(" "));
    } else {
      // fallback: 모든 태그 제거
      const plain = xml
        .replace(/<[^>]+>/g, " ")
        .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&").replace(/&quot;/g, '"')
        .replace(/\s{2,}/g, "\n").trim();
      if (plain) texts.push(plain);
    }
  }

  return texts.join("\n");
}

// ───────────────────────────────────────────────────────────
// HWP 바이너리: OLE/CFB → zlib 해제 → HWP 레코드 → 텍스트
// ───────────────────────────────────────────────────────────
function parseHwpRecords(data: Buffer): string {
  const texts: string[] = [];
  let i = 0;

  while (i + 4 <= data.length) {
    const header = data.readUInt32LE(i);
    const tagId  = header & 0x3ff;
    let   size   = (header >> 20) & 0xfff;
    i += 4;

    if (size === 0xfff) {
      if (i + 4 > data.length) break;
      size = data.readUInt32LE(i);
      i += 4;
    }

    if (i + size > data.length) break;

    // PARA_TEXT = 67
    if (tagId === 67 && size > 0) {
      const chunk = data.slice(i, i + size);
      // UTF-16LE 디코딩, 제어 문자 제거
      let text = "";
      for (let j = 0; j + 1 < chunk.length; j += 2) {
        const code = chunk.readUInt16LE(j);
        if (code === 13 || code === 10) { text += "\n"; }
        else if (code >= 0x20 && code !== 0xffff) { text += String.fromCharCode(code); }
      }
      const t = text.trim();
      if (t.length > 0) texts.push(t);
    }

    i += size;
  }

  return texts.join("\n");
}

function extractHwpBinary(buffer: Buffer): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const zlib = require("zlib");

  let allText = "";

  try {
    // cfb 패키지로 OLE 구조 파싱
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const CFB = require("cfb");
    const cfb = CFB.read(buffer, { type: "buffer" });

    // BodyText/Section0, Section1, ... 순서대로 처리
    const bodyEntries = cfb.FileIndex
      .filter((e: { name: string; content?: Buffer }) =>
        e.name && /^Section\d+$/i.test(e.name) && e.content
      )
      .sort((a: { name: string }, b: { name: string }) => {
        const na = parseInt(a.name.replace(/\D/g, "") || "0");
        const nb = parseInt(b.name.replace(/\D/g, "") || "0");
        return na - nb;
      });

    for (const entry of bodyEntries) {
      if (!entry.content || entry.content.length === 0) continue;
      try {
        // HWP BodyText 섹션은 zlib raw deflate (windowBits = -15)
        const decompressed: Buffer = zlib.inflateRawSync(entry.content);
        const text = parseHwpRecords(decompressed);
        if (text.trim()) allText += text + "\n";
      } catch {
        // 압축되지 않은 섹션이면 그냥 파싱 시도
        try {
          const text = parseHwpRecords(Buffer.from(entry.content));
          if (text.trim()) allText += text + "\n";
        } catch { /* skip */ }
      }
    }
  } catch (cfbErr) {
    // cfb 파싱 실패 시 fallback: 버퍼 전체에서 zlib 스트림 탐색
    console.warn("cfb parse failed, using fallback:", cfbErr);
    for (let i = 0; i < buffer.length - 2; i++) {
      // zlib raw deflate 시그니처 탐지 (첫 바이트가 특정 값일 때)
      if (buffer[i] === 0x78 && (buffer[i + 1] === 0x9c || buffer[i + 1] === 0xda || buffer[i + 1] === 0x01)) {
        try {
          const chunk = buffer.slice(i);
          const decompressed: Buffer = zlib.inflateSync(chunk);
          const text = parseHwpRecords(decompressed);
          if (text.trim().length > 5) allText += text + "\n";
        } catch { /* not a valid zlib block */ }
      }
    }

    // 최후 fallback: UTF-16LE 스캔으로 한글 텍스트 수집
    if (!allText.trim()) {
      const segments: string[] = [];
      let cur = "";
      for (let i = 0; i + 1 < buffer.length; i += 2) {
        const code = buffer.readUInt16LE(i);
        if ((code >= 0xac00 && code <= 0xd7a3) || // 한글 음절
            (code >= 0x30 && code <= 0x39) ||       // 숫자
            (code >= 0x20 && code <= 0x7e) ||       // ASCII
            code === 0x0a || code === 0x0d) {
          cur += String.fromCharCode(code);
        } else {
          if (cur.trim().length > 1) segments.push(cur.trim());
          cur = "";
        }
      }
      if (cur.trim().length > 1) segments.push(cur.trim());
      allText = segments.join("\n");
    }
  }

  return allText.trim();
}

// ───────────────────────────────────────────────────────────
// 공개 함수
// ───────────────────────────────────────────────────────────
export async function extractTextFromHwp(buffer: Buffer, filename: string): Promise<string> {
  const isHwpx =
    filename.toLowerCase().endsWith(".hwpx") ||
    (buffer[0] === 0x50 && buffer[1] === 0x4b); // PK magic = ZIP

  if (isHwpx) {
    return extractHwpx(buffer);
  } else {
    return extractHwpBinary(buffer);
  }
}
