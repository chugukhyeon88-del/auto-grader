/**
 * HWP/HWPX 파일에서 텍스트 추출
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
    const hpTexts: string[] = [];
    xml.replace(/<hp:t[^>]*>([\s\S]*?)<\/hp:t>/g, (_: string, inner: string) => {
      const t = inner.trim();
      if (t) hpTexts.push(t);
      return "";
    });

    if (hpTexts.length > 0) {
      texts.push(hpTexts.join(" "));
    } else {
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
// HWP 레코드 파싱 (압축 해제된 BodyText 섹션용)
// ───────────────────────────────────────────────────────────
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

    // PARA_TEXT = 67
    if (tagId === 67 && size > 0) {
      const chunk = data.slice(i, i + size);
      let text = "";
      for (let j = 0; j + 1 < chunk.length; j += 2) {
        const code = chunk.readUInt16LE(j);
        if (code === 13 || code === 10) text += "\n";
        else if (code >= 0x20 && code < 0xfffe) text += String.fromCharCode(code);
      }
      const t = text.trim();
      if (t.length > 0) texts.push(t);
    }

    i += size;
  }

  return texts.join("\n");
}

// ───────────────────────────────────────────────────────────
// 깨진 문자 필터링 → 의미 있는 텍스트만 추출
// ───────────────────────────────────────────────────────────
function filterReadableText(raw: string): string {
  const lines = raw.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 전체 길이 대비 읽을 수 있는 문자(숫자, 영문, 일반 한글) 비율 계산
    const readable = trimmed.split("").filter((c) => {
      const code = c.charCodeAt(0);
      return (
        (code >= 0x30 && code <= 0x39) ||   // 0-9
        (code >= 0x41 && code <= 0x7a) ||   // A-z
        (code >= 0xac00 && code <= 0xd7a3) || // 한글 음절 (완성형)
        (code >= 0x3131 && code <= 0x318e) || // 한글 자모
        c === " " || c === "." || c === "," ||
        c === ":" || c === ")" || c === "(" ||
        c === "①" || c === "②" || c === "③" || c === "④" || c === "⑤" ||
        c === "O" || c === "X" || c === "o" || c === "x"
      );
    });

    const ratio = readable.length / trimmed.length;

    // 가독성 비율 50% 이상이고, 최소 1자 이상인 경우만 포함
    if (ratio >= 0.5 && readable.length >= 1) {
      result.push(readable.join("").trim());
    }
  }

  // 중복 제거, 빈 줄 제거
  return [...new Set(result)].filter(Boolean).join("\n");
}

// ───────────────────────────────────────────────────────────
// HWP 바이너리 파싱 (OLE/CFB)
// ───────────────────────────────────────────────────────────
function extractHwpBinary(buffer: Buffer): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const zlib = require("zlib");
  const allTexts: string[] = [];

  // 방법 1: cfb 패키지로 OLE 구조 파싱
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const CFB = require("cfb");
    const cfb = CFB.read(buffer, { type: "buffer" });

    // BodyText 디렉토리 아래 Section 스트림들 수집
    const bodyEntries = cfb.FileIndex.filter(
      (e: { name: string; content?: Uint8Array; type?: number }) =>
        e.name &&
        /^Section\d*$/i.test(e.name) &&
        e.content &&
        e.content.length > 0
    ).sort((a: { name: string }, b: { name: string }) => {
      const na = parseInt(a.name.replace(/\D/g, "") || "0");
      const nb = parseInt(b.name.replace(/\D/g, "") || "0");
      return na - nb;
    });

    for (const entry of bodyEntries) {
      if (!entry.content) continue;
      const buf = Buffer.from(entry.content);

      // zlib raw inflate 시도
      try {
        const decompressed = zlib.inflateRawSync(buf);
        const text = parseHwpRecords(decompressed);
        if (text.trim()) allTexts.push(text);
        continue;
      } catch { /* not compressed */ }

      // 압축 없이 직접 파싱 시도
      try {
        const text = parseHwpRecords(buf);
        if (text.trim()) allTexts.push(text);
      } catch { /* skip */ }
    }
  } catch (cfbErr) {
    console.warn("cfb parse error:", cfbErr);
  }

  // 방법 2: 버퍼 전체에서 zlib deflate 스트림 탐지
  if (allTexts.length === 0) {
    for (let i = 0; i < buffer.length - 4; i++) {
      // deflate 헤더: 0x78 0x9C / 0x78 0xDA / 0x78 0x01
      if (
        buffer[i] === 0x78 &&
        (buffer[i + 1] === 0x9c || buffer[i + 1] === 0xda || buffer[i + 1] === 0x01)
      ) {
        try {
          const decompressed = zlib.inflateSync(buffer.slice(i));
          const text = parseHwpRecords(decompressed);
          if (text.trim().length > 3) {
            allTexts.push(text);
            i += 50; // 겹침 방지
          }
        } catch { /* not valid */ }
      }
    }
  }

  // 방법 3 (최후 수단): 버퍼 전체를 UTF-16LE로 스캔 후 가독성 필터 적용
  if (allTexts.length === 0) {
    const segments: string[] = [];
    let cur = "";
    for (let i = 0; i + 1 < buffer.length; i += 2) {
      const code = buffer.readUInt16LE(i);
      if (
        (code >= 0xac00 && code <= 0xd7a3) || // 한글 음절
        (code >= 0x30 && code <= 0x39) ||      // 숫자
        (code >= 0x41 && code <= 0x7a) ||      // 영문
        code === 0x20 || code === 0x0a
      ) {
        cur += String.fromCharCode(code);
      } else {
        if (cur.trim().length > 1) segments.push(cur.trim());
        cur = "";
      }
    }
    if (cur.trim().length > 1) segments.push(cur.trim());
    allTexts.push(segments.join("\n"));
  }

  const raw = allTexts.join("\n");
  return filterReadableText(raw);
}

// ───────────────────────────────────────────────────────────
// 공개 함수
// ───────────────────────────────────────────="────────────────
export async function extractTextFromHwp(buffer: Buffer, filename: string): Promise<string> {
  const isHwpx =
    filename.toLowerCase().endsWith(".hwpx") ||
    (buffer[0] === 0x50 && buffer[1] === 0x4b);

  if (isHwpx) {
    return extractHwpx(buffer);
  } else {
    return extractHwpBinary(buffer);
  }
}
