/** Server-side resume text extraction for PDF (unpdf) and DOCX (mammoth). */

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
export const MAX_RESUME_CHARS = 15_000;

export const EMPTY_TEXT_MESSAGE =
  "This file has no readable text. Paste your resume below.";
export const PARSE_FAILURE_MESSAGE =
  "Could not read that file. Try another export, or paste the text.";
export const TOO_LARGE_MESSAGE = "That file is too large (max about 5 MB).";

export type ExtractResumeResult =
  | { ok: true; text: string }
  | { ok: false; code: "empty" | "parse" | "too_large" | "type"; message: string };

export type ResumeExtractors = {
  extractPdf: (bytes: Uint8Array) => Promise<string>;
  extractDocx: (bytes: Uint8Array) => Promise<string>;
};

async function defaultExtractPdf(bytes: Uint8Array): Promise<string> {
  const { extractText } = await import("unpdf");
  const result = await extractText(bytes, { mergePages: true });
  return typeof result.text === "string" ? result.text : String(result.text ?? "");
}

async function defaultExtractDocx(bytes: Uint8Array): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return result.value ?? "";
}

const defaultExtractors: ResumeExtractors = {
  extractPdf: defaultExtractPdf,
  extractDocx: defaultExtractDocx,
};

function extensionOf(filename: string) {
  const match = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "";
}

/** Extract plain text from a PDF or DOCX upload. Caps length; stubs inject parsers in tests. */
export async function extractResumeText(
  file: { name: string; bytes: Uint8Array },
  extractors: ResumeExtractors = defaultExtractors,
): Promise<ExtractResumeResult> {
  if (file.bytes.byteLength > MAX_RESUME_BYTES) {
    return { ok: false, code: "too_large", message: TOO_LARGE_MESSAGE };
  }

  const ext = extensionOf(file.name);
  if (ext !== "pdf" && ext !== "docx") {
    return {
      ok: false,
      code: "type",
      message: "Upload a .pdf or .docx file, or paste the text.",
    };
  }

  let text: string;
  try {
    text = ext === "pdf" ? await extractors.extractPdf(file.bytes) : await extractors.extractDocx(file.bytes);
  } catch {
    return { ok: false, code: "parse", message: PARSE_FAILURE_MESSAGE };
  }

  const trimmed = text.replace(/\u0000/g, "").trim();
  if (!trimmed) {
    return { ok: false, code: "empty", message: EMPTY_TEXT_MESSAGE };
  }

  return { ok: true, text: trimmed.slice(0, MAX_RESUME_CHARS) };
}
