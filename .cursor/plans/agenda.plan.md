---
name: Agenda
overview: Interview demo agenda for the job board project.
isProject: false
---

# Agenda

1. **Self-introduction** (2 min)
2. **Project Overview** (2 min)
   - a. What is the inspiration behind Job Board?
   - b. Problem/solution
3. **Architecture Overview** (5–7 min)
   - a. High-level overview of the tech-stack
   - b. Codebase walkthrough
   - c. Technical challenges

```mermaid
flowchart TD
  subgraph sources [Discovery]
    CSV["Company lists (CSV and JSON)"]
    CC["Common Crawl URL index"]
  end
  Ingest["Ingest command (npm run ingest)"]
  ATS["Greenhouse, Lever, and Ashby APIs"]
  subgraph store [SQLite database]
    Co["Company boards"]
    Jo["Cached job listings"]
    Tr["Application status"]
  end
  subgraph app [Next.js server]
    YAML["Filter rules (search.config.yaml)"]
    Match["Score jobs against the rules"]
    Page["Job table in the browser"]
  end
  CSV --> Ingest
  CC --> Co
  Ingest -->|"HTTP fetch"| ATS
  ATS -->|save listings| Jo
  Ingest -->|mark board live or dead| Co
  Jo --> Match
  YAML --> Match
  Tr --> Page
  Match --> Page
  Page -->|"update application status"| Tr
```
4. **Live Demo** (3–5 min)
   - a. User configured filters
   - b. How jobs are ranked
5. **Roadmap** (2 min)
   - a. Next steps & new features
   - b. Plan to "get out of localhost"
6. **Q&A** (3–5 min)
7. **Extra Time:** demo client projects
