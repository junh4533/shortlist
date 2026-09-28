import { describe, expect, it } from "vitest";
import { extractFromResume } from "./skills-vocabulary";

describe("extractFromResume", () => {
  const resume = `Jun Huang — Front-End Developer
  Built dashboards in React and Next.js with TypeScript, Tailwind, and Node.js APIs backed by SQL.
  Previously a Full Stack Developer shipping C# services on AWS.`;

  it("finds vocabulary skills and titles", () => {
    const { skills, titles } = extractFromResume(resume);
    expect(skills).toEqual(expect.arrayContaining(["React", "Next.js", "TypeScript", "Tailwind", "Node.js", "SQL", "C#", "AWS"]));
    expect(skills).not.toContain("Java");
    expect(titles).toEqual(expect.arrayContaining(["Front-End Developer", "Full Stack Developer"]));
  });

  it("maps user aliases back to canonical skills", () => {
    const { skills } = extractFromResume("Experienced with reactjs", { react: ["react", "reactjs"] });
    expect(skills).toContain("React");
  });
});
