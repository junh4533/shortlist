/** Keyword vocabularies for prefilling preferences from pasted resume text (no paid AI). */
import type { UserPreferences } from "./config";

export const SKILL_VOCABULARY = [
  "JavaScript",
  "TypeScript",
  "React",
  "Next.js",
  "Vue",
  "Angular",
  "Svelte",
  "Node.js",
  "Express",
  "GraphQL",
  "REST",
  "HTML",
  "CSS",
  "Tailwind",
  "Sass",
  "Redux",
  "Python",
  "Django",
  "Flask",
  "FastAPI",
  "Java",
  "Spring",
  "Kotlin",
  "Swift",
  "Go",
  "Rust",
  "Ruby",
  "Rails",
  "PHP",
  "Laravel",
  "C#",
  ".NET",
  "C++",
  "SQL",
  "PostgreSQL",
  "MySQL",
  "MongoDB",
  "Redis",
  "AWS",
  "GCP",
  "Azure",
  "Docker",
  "Kubernetes",
  "Terraform",
  "Figma",
  "Storybook",
  "Jest",
  "Cypress",
  "Playwright",
  "Electron",
  "WordPress",
  "Pandas",
  "PyTorch",
  "TensorFlow",
  "Spark",
  "Airflow",
  "dbt",
  "Snowflake",
];

export const TITLE_VOCABULARY = [
  "Frontend Engineer",
  "Front-End Developer",
  "Full Stack Engineer",
  "Full Stack Developer",
  "Backend Engineer",
  "Software Engineer",
  "Software Developer",
  "Web Developer",
  "UI Engineer",
  "Mobile Engineer",
  "iOS Engineer",
  "Android Engineer",
  "Data Engineer",
  "Data Scientist",
  "Data Analyst",
  "Machine Learning Engineer",
  "DevOps Engineer",
  "Site Reliability Engineer",
  "Platform Engineer",
  "Security Engineer",
  "QA Engineer",
  "Product Designer",
  "Product Manager",
  "Solutions Engineer",
];

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mentions(text: string, term: string) {
  return new RegExp(`(^|[^a-z0-9])${escapeRegex(term.toLowerCase())}($|[^a-z0-9])`, "i").test(text);
}

/** Skills and titles mentioned in resume text, using the vocabulary plus the user's skill aliases. */
export function extractFromResume(text: string, aliases: UserPreferences["skills"]["aliases"] = {}) {
  const lower = text.toLowerCase();
  const skills = new Set<string>();
  for (const skill of SKILL_VOCABULARY) if (mentions(lower, skill)) skills.add(skill);
  for (const [name, variants] of Object.entries(aliases)) {
    const hit = variants.find((variant) => mentions(lower, variant));
    if (!hit) continue;
    const canonical = SKILL_VOCABULARY.find((skill) => skill.toLowerCase().replace(/[^a-z0-9#+]/g, "") === name);
    skills.add(canonical ?? name);
  }
  const titles = TITLE_VOCABULARY.filter((title) => mentions(lower, title));
  return { skills: [...skills], titles };
}
