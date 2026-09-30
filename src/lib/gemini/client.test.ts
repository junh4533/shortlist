import { describe, expect, it, vi } from "vitest";
import { generateStarterFromPrompt } from "./client";

describe("generateStarterFromPrompt", () => {
  it("returns a clear error when the API key is missing", async () => {
    const result = await generateStarterFromPrompt("hello", { apiKey: "", fetch: vi.fn() });
    expect(result).toEqual({ ok: false, message: "GEMINI_API_KEY is not set." });
  });

  it("parses a successful JSON candidate without a real network call", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    titles: { include: ["Frontend Engineer"], exclude: ["Intern"], prefer: { frontend: 3 } },
                    skills: { preferred: ["React"], bonus: ["AWS"] },
                  }),
                },
              ],
            },
          },
        ],
      }),
    );
    const result = await generateStarterFromPrompt("prompt", { apiKey: "test-key", fetch: fetchMock });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.titles.include).toEqual(["Frontend Engineer"]);
      expect(result.data.skills.preferred).toEqual(["React"]);
    }
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects invalid model JSON", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        candidates: [{ content: { parts: [{ text: '{"titles":null}' }] } }],
      }),
    );
    const result = await generateStarterFromPrompt("prompt", { apiKey: "test-key", fetch: fetchMock });
    expect(result).toEqual({ ok: false, message: "Gemini JSON failed validation." });
  });
});
