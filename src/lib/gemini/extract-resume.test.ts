import { describe, expect, it, vi } from "vitest";
import {
  EMPTY_TEXT_MESSAGE,
  PARSE_FAILURE_MESSAGE,
  extractResumeText,
  MAX_RESUME_BYTES,
  TOO_LARGE_MESSAGE,
} from "./extract-resume";

describe("extractResumeText", () => {
  it("rejects files over about 5 MB before parsing", async () => {
    const bytes = new Uint8Array(MAX_RESUME_BYTES + 1);
    const result = await extractResumeText(
      { name: "resume.pdf", bytes },
      {
        extractPdf: vi.fn(),
        extractDocx: vi.fn(),
      },
    );
    expect(result).toEqual({ ok: false, code: "too_large", message: TOO_LARGE_MESSAGE });
  });

  it("returns the empty-text message when the parser yields whitespace", async () => {
    const result = await extractResumeText(
      { name: "scan.pdf", bytes: new Uint8Array([1, 2, 3]) },
      {
        extractPdf: async () => "   \n\t  ",
        extractDocx: vi.fn(),
      },
    );
    expect(result).toEqual({ ok: false, code: "empty", message: EMPTY_TEXT_MESSAGE });
  });

  it("returns the parse-failure message when the parser throws", async () => {
    const result = await extractResumeText(
      { name: "bad.docx", bytes: new Uint8Array([1, 2, 3]) },
      {
        extractPdf: vi.fn(),
        extractDocx: async () => {
          throw new Error("corrupt");
        },
      },
    );
    expect(result).toEqual({ ok: false, code: "parse", message: PARSE_FAILURE_MESSAGE });
  });

  it("returns capped text on success", async () => {
    const result = await extractResumeText(
      { name: "me.pdf", bytes: new Uint8Array([1]) },
      {
        extractPdf: async () => "  Frontend Engineer\nReact  ",
        extractDocx: vi.fn(),
      },
    );
    expect(result).toEqual({ ok: true, text: "Frontend Engineer\nReact" });
  });
});
