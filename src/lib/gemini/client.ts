/** Gemini REST generateContent (JSON mode). Server-only; tests inject fetch. */
import { geminiResponseJsonSchema, geminiStarterSchema, type GeminiStarter } from "./schema";

const DEFAULT_MODEL = "gemini-2.5-flash";

export type GeminiGenerateResult =
  | { ok: true; data: GeminiStarter }
  | { ok: false; message: string };

export type GeminiGenerateOptions = {
  apiKey?: string;
  model?: string;
  fetch?: typeof fetch;
};

export async function generateStarterFromPrompt(
  prompt: string,
  options: GeminiGenerateOptions = {},
): Promise<GeminiGenerateResult> {
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return { ok: false, message: "GEMINI_API_KEY is not set." };

  const model = options.model ?? process.env.GEMINI_MODEL?.trim() ?? DEFAULT_MODEL;
  const fetchFn = options.fetch ?? fetch;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  let response: Response;
  try {
    response = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: geminiResponseJsonSchema,
        },
      }),
    });
  } catch (error) {
    return { ok: false, message: `Gemini request failed: ${(error as Error).message}` };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return { ok: false, message: `Gemini returned ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}` };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, message: "Gemini returned non-JSON." };
  }

  const text = extractCandidateText(payload);
  if (!text) return { ok: false, message: "Gemini returned an empty response." };

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text);
  } catch {
    return { ok: false, message: "Gemini response was not valid JSON." };
  }

  const parsed = geminiStarterSchema.safeParse(parsedJson);
  if (!parsed.success) return { ok: false, message: "Gemini JSON failed validation." };
  return { ok: true, data: parsed.data };
}

function extractCandidateText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || !candidates[0] || typeof candidates[0] !== "object") return null;
  const content = (candidates[0] as { content?: { parts?: { text?: string }[] } }).content;
  const text = content?.parts?.[0]?.text;
  return typeof text === "string" && text.trim() ? text : null;
}
