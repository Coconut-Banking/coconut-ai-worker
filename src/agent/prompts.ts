import type { RepoContext } from '../types/index.js';

export const STARTER_AGENTS_MD = `# AGENTS.md

Rules for AI agents working in Coconut:

1. Prefer minimal, surgical changes when possible.
2. Run lint, typecheck, and tests before opening a PR.
3. Reuse existing patterns, hooks, components, and route structure where reasonable.
4. The agent may modify any part of the repository, including auth, database, API routes, external integrations, and migrations, if needed to implement the task.
5. Do not push directly to main.
6. Do not auto-merge pull requests.
7. If a risky or broad change is made, explain it clearly in the PR summary.
8. Add or update tests where practical.
`;

export const STARTER_PROJECT_SPEC_MD = `# PROJECT_SPEC.md

Coconut architecture overview

Frontend
- Next.js App Router
- React 18
- TypeScript
- Tailwind

Auth
- Clerk

Data
- Supabase for Postgres + pgvector
- Plaid for accounts and transactions
- OpenAI for NL search parsing and embeddings
- Stripe for settlement flows

Conventions
- Prefer extending existing hooks and components
- Keep components focused and composable
- Reuse lib/ abstractions where possible
- When changing external integrations or database-related code, preserve consistency across API routes, server utilities, schema, and tests
`;

export function buildPlannerPrompt(
  issueTitle: string,
  issueBody: string,
  ctx: RepoContext,
  maxFiles: number
): string {
  const fileTree = ctx.fileTree;
  return `You are a senior engineer planning implementation for a GitHub issue in the Coconut repo.

## GitHub issue

**Title:** ${issueTitle}

**Body:**
${issueBody}

## Repo context

**AGENTS.md:**
\`\`\`
${ctx.agentsMd}
\`\`\`

**PROJECT_SPEC.md:**
\`\`\`
${ctx.projectSpecMd}
\`\`\`

**File tree (prioritized):**
\`\`\`
${fileTree}
\`\`\`

## Task

Produce a concise implementation plan. For V1 we cap changes to at most ${maxFiles} files. Prefer minimal, surgical edits.

Respond with a single JSON object (no markdown fence, no extra text) with exactly these keys:
- summary: string (2-4 sentences)
- likelyFilesToChange: string[] (paths relative to repo root, max ${maxFiles})
- implementationSteps: string[] (ordered steps)
- testsToAddOrUpdate: string[] (paths or test names)
- risks: string[]
- confidence: "low" | "medium" | "high"
- assumptions: string[] (optional, if any)
`;
}

const MAX_FILE_CHARS = 80_000;

export function buildCoderPrompt(
  issueTitle: string,
  issueBody: string,
  plannerSummary: string,
  implementationSteps: string[],
  likelyFilesToChange: string[],
  ctx: RepoContext,
  maxFiles: number,
  currentFileContents: Record<string, string> = {}
): string {
  const fileContentsSection =
    Object.keys(currentFileContents).length === 0
      ? ''
      : `
## Current file contents (MUST preserve; only make minimal surgical edits)

For each file below, you MUST output the COMPLETE file in files_to_modify with ONLY the minimal changes needed for the issue. Do NOT replace with a stub, summary, or simplified version. Preserve every line, import, component, and logic except the specific lines you are changing.

${Object.entries(currentFileContents)
  .map(
    ([path, content]) =>
      `### ${path}\n\`\`\`\n${content.length > MAX_FILE_CHARS ? content.slice(0, MAX_FILE_CHARS) + '\n\n// ... (file truncated; preserve the rest of the file unchanged) ...' : content}\n\`\`\``
  )
  .join('\n\n')}
`;

  return `You are a senior engineer implementing a GitHub issue in the Coconut repo.

## GitHub issue

**Title:** ${issueTitle}

**Body:**
${issueBody}

## Plan (from planner)

**Summary:** ${plannerSummary}

**Steps:** ${implementationSteps.join('; ')}

**Likely files to change:** ${likelyFilesToChange.join(', ')}

## Repo context

**AGENTS.md:**
\`\`\`
${ctx.agentsMd.slice(0, 2000)}
\`\`\`

**PROJECT_SPEC.md:**
\`\`\`
${ctx.projectSpecMd.slice(0, 2000)}
\`\`\`

**File tree:**
\`\`\`
${ctx.fileTree.slice(0, 3000)}
\`\`\`
${fileContentsSection}

## Syntax and code correctness (must follow)

- Output only valid JavaScript/TypeScript/JSX. The code will be validated with \`tsc --noEmit\`; parse or syntax errors will fail the run.
- In JSX, to map over an array you must use an array literal inside the curly brace: \`{["a", "b"].map(x => ...)}\` — never \`{"a", "b"].map}\` or missing the opening \`[\`. The \`{\` opens JSX expression, then \`[\` starts the array.
- Do not drop brackets, parentheses, or braces. Preserve the exact syntax of the original file; when editing, change only the minimal tokens (e.g. one string, one JSX block).
- Copy-paste from the current file content above when possible; only alter the specific lines the plan requires.

## Task

Generate code edits. For V1:
- Cap to at most ${maxFiles} files (create or replace).
- For files_to_modify: you are given the current file content above. Your "content" MUST be the COMPLETE file with ONLY minimal surgical changes. Do NOT output a stub or simplified version — preserve the entire file and change only what the plan specifies.
- For files_to_create: output full file content as needed.
- Output only valid JSON (no markdown, no \`\`\`json). Use this shape:
{
  "summary": "string",
  "files_to_modify": [{"path": "relative/path.ts", "content": "full file content (entire file with minimal edits)"}],
  "files_to_create": [{"path": "relative/new.ts", "content": "full file content"}],
  "changed_files": ["path1", "path2"],
  "rationale": "string"
}
CRITICAL: When modifying an existing file, your output must preserve the whole file and change only the minimal section (e.g. one block or a few lines). If the model is unsure, state assumptions in rationale.
`;
}
