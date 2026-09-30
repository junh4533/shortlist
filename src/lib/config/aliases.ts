/** Generic title/skill/seniority aliases used by blank profiles (not copied from search.config.yaml). */

export const DEFAULT_TITLE_ALIASES: Record<string, string[]> = {
  frontend: ["frontend", "front-end", "front end", "ui engineer", "react engineer"],
  fullstack: ["full stack", "fullstack", "full-stack"],
  backend: ["backend", "back-end", "back end", "server-side", "server side"],
};

export const DEFAULT_SKILL_ALIASES: Record<string, string[]> = {
  react: ["react", "react.js", "reactjs"],
  nextjs: ["next.js", "nextjs", "next"],
  typescript: ["typescript", "ts"],
  javascript: ["javascript", "js", "ecmascript"],
  nodejs: ["node", "node.js", "nodejs"],
  csharp: ["c#", "csharp", ".net", "asp.net"],
};

export const DEFAULT_SENIORITY_ALIASES: Record<string, string[]> = {
  intern: ["intern", "internship", "trainee"],
  junior: ["junior", "jr", "jr.", "entry", "entry-level", "entry level"],
  mid: ["mid", "mid-level", "midlevel", "mid level", "intermediate"],
  senior: ["senior", "sr", "sr."],
  "mid-senior": ["mid-senior", "mid senior", "midsenior"],
  staff: ["staff"],
  principal: ["principal"],
};
