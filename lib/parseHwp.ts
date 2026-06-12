/**
 * HWP/HWPX 파일에서 텍스트 추출
 * - HWPX: ZIP 기반 XML → 직접 파싱
 * - HWP(바이너리): zlib 압축 해제 후 유니코드 텍스트 추출
 */
import { Readable } from "stream";

async function extractHwpx(buffer: Buffer): Promise<string> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buffer);
  const texts: string[] = [];

  // section 파일들 순서대로 추출
  const sectionFiles = Object.keys(zip.files)
    .filter((name) => /Contents\/section\d+\.xml/.test(name))
    .sort();

  for (const name of sectionFiles) {
    const xml = await zip.files[name].async("text");
    // XML 태그 제거 후 텍스트만 추출
    const text = xml
      .replace(/<[^>]+>/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/\s{2,}/g, "\n")
      .trim();
    if (text) texts.push(text);
  }

  return texts.join("\n");
}

function extractHwpBinary(buffer: Buffer): string {
  const zlib = require("zlib");
  const texts: string[] = [];

  // HWP OLE 구조에서 BodyText 섹션 찾기
  // 간단한 방법: 압축된 섹션 블록을 zlib으로 해제 후 UTF-16LE 텍스트 추출
  let offset = 0;
  while (offset < buffer.length - 4) {
    // HWP 레코드 헤더 파싱 (4바이트)
    const header = buffer.readUInt32LE(offset);
    const tagId = header & 0x3ff;
    const level = (header >> 10) & 0xf;
    let size = (header >> 20) & 0xfff;
    offset += 4;

    if (size === 0xfff) {
      if (offset + 4 > buffer.length) break;
      size = buffer.readUInt32LE(offset);
      offset += 4;
    }

    // PARA_TEXT 태그 (67)
    if (tagId === 67 && size > 0 && offset + size <= buffer.length) {
      const chunk = buffer.slice(offset, offset + size);
      try {
        const text = chunk.toString("utf16le").replace(/\0/g, "").trim();
        if (text.length > 0) texts.push(text);
      } catch {}
    }

    offset += size;
  }

  if (texts.length === 0) {
    // fallback: UTF-16LE로 전체 스캔
    try {
      const raw = buffer.toString("utf16le");
      const printable = raw
        .split("")
        .filter((c) => c.charCodeAt(0) >= 0x20 || c === "\n")
        .join("")
        .replace(/\0+/g, " ")
        .trim();
      return printable;
    } catch {
      return "";
    }
  }

  return texts.join("\n");
}

export async function extractTextFromHwp(buffer: Buffer, filename: string): Promise<string> {
  const isHwpx =
    filename.toLowerCase().endsWith(".hwpx") ||
    (buffer[0] === 0x50 && buffer[1] === 0x4b); // PK = ZIP magic

  if (isHwpx) {
    return extractHwpx(buffer);
  } else {
    // HWP 바이너리: zlib 섹션 압축 해제 시도
    const zlib = require("zlib");
    // OLE 헤더 확인 (D0 CF 11 E0)
    if (
      buffer[0] === 0xd0 &&
      buffer[1] === 0xcf &&
      buffer[2] === 0x11 &&
      buffer[3] === 0xe0
    ) {
      // CFB(OLE) 구조 파싱은 복잡하므로 간단한 텍스트 스캔 사용
      // UTF-16LE 한글 범위 (0xAC00~0xD7A3) 탐색
      const texts: string[] = [];
      for (let i = 0; i < buffer.length - 1; i++) {
        const code = buffer.readUInt16LE(i);
        if (code >= 0xac00 && code <= 0xd7a3) {
          // 한글 문자 발견, 주변 컨텍스트 읽기
          let start = Math.max(0, i - 2);
          let end = Math.min(buffer.length, i + 200);
          const chunk = buffer.slice(start, end).toString("utf16le");
          const cleaned = chunk.replace(/[^가-힣 -~\n]/g, "").trim();
          if (cleaned.length > 2) texts.push(cleaned);
          i += 100; // 이미 처리한 범위 건너뜀
        }
      }
      return [...new Set(texts)].join("\n");
    }
    return extractHwpBinary(buffer);
  }
}
