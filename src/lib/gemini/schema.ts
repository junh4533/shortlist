/** Zod schemas for Gemini starter JSON (titles/skills, plus optional resume profile fields). */
import { z } from "zod";

const weightedPrefer = z.record(z.string(), z.number()).default({});

export const geminiStarterSchema = z.object({
  titles: z.object({
    include: z.array(z.string()).default([]),
    exclude: z.array(z.string()).default([]),
    prefer: weightedPrefer,
  }),
  skills: z.object({
    preferred: z.array(z.string()).default([]),
    bonus: z.array(z.string()).default([]),
  }),
  profile: z
    .object({
      years_experience: z.number().nullable().optional(),
      current_title: z.string().nullable().optional(),
      home: z.string().nullable().optional(),
      skills: z.array(z.string()).optional(),
    })
    .optional(),
});

export type GeminiStarter = z.infer<typeof geminiStarterSchema>;

/** OpenAPI-ish schema for Gemini responseJsonSchema. */
export const geminiResponseJsonSchema = {
  type: "object",
  properties: {
    titles: {
      type: "object",
      properties: {
        include: { type: "array", items: { type: "string" } },
        exclude: { type: "array", items: { type: "string" } },
        prefer: { type: "object", additionalProperties: { type: "number" } },
      },
      required: ["include", "exclude", "prefer"],
    },
    skills: {
      type: "object",
      properties: {
        preferred: { type: "array", items: { type: "string" } },
        bonus: { type: "array", items: { type: "string" } },
      },
      required: ["preferred", "bonus"],
    },
    profile: {
      type: "object",
      properties: {
        years_experience: { type: "number", nullable: true },
        current_title: { type: "string", nullable: true },
        home: { type: "string", nullable: true },
        skills: { type: "array", items: { type: "string" } },
      },
    },
  },
  required: ["titles", "skills"],
} as const;
