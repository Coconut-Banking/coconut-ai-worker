# coconut-ai-worker

Local-first autonomous coding worker for the [Coconut](https://github.com/Coconut-Banking/coconut) project. It runs on your laptop, reads GitHub issues from the Coconut repo, clones the repo into a fresh sandbox, generates an implementation plan with OpenAI, generates code edits, applies them, runs validation, and optionally pushes a branch or opens a PR.

**V1** is optimized for: local execution, simple architecture, easy debugging, minimal moving parts, no database, no queue, no VM/deployment.

## Local setup

1. **Clone and install**

   ```bash
   cd coconut-ai-worker
   npm install
   ```

2. **Create `.env`**

   Copy the example and fill in required keys:

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and set at least:

   - `GITHUB_TOKEN` – GitHub personal access token (repo scope)
   - `OPENAI_API_KEY` – OpenAI API key

   Other variables have defaults; see `.env.example` for full list.

3. **Build (optional)**

   ```bash
   npm run build
   ```

## Commands

- **`npm run dev`** – Watch mode: runs the worker with `tsx watch`, re-running on file changes.
- **`npm run build`** – Compile TypeScript to `dist/`.
- **`npm run start`** – Run the compiled worker: `node dist/cli/run-once.js` (run `npm run build` first).
- **`npm run run-once`** – Process at most one eligible issue (uses `tsx`; no build required).

## Env flags

- **`TEST_MODE`** (default: `true`) – When `true`, after validation passes the worker commits locally but does **not** push and does **not** open a PR. Use this to test the full pipeline without touching GitHub remotes.
- **`DRY_RUN`** (default: `true`) – When `true`, the worker stops after the planner step: no code generation, no edits, no validation. Run metadata and logs are still written. Use to verify issue selection and planning without changing any repo.
- **`KEEP_SANDBOX`** (default: `true`) – When `true`, the sandbox directory is left on disk after the run for inspection. When `false`, it is removed (unless the run failed, in which case you may want to inspect it).
- **`DEBUG`** (default: `true`) – Enables debug-level pino logs.
- **`OPEN_PR`** (default: `false`) – When `true` and `TEST_MODE` is `false`, the worker pushes the branch and opens a PR against the default branch, then comments on the source issue with the PR link.

## Behavior summary

1. Fetches open GitHub issues with labels **`auto-build`** and **`overnight`**.
2. Processes **at most one issue** per run.
3. For the selected issue: creates a sandbox, clones Coconut, checks out the default branch, creates branch `ai/issue-{number}-{timestamp}`.
4. Reads or creates `AGENTS.md` and `PROJECT_SPEC.md` in the repo root.
5. Generates a planning document with OpenAI, then (unless `DRY_RUN`) generates code edits, applies them, and runs `npm ci`/`npm install`, `npm run lint`, `npm run typecheck`, `npm run test`.
6. On validation failure: does not push; saves logs and run metadata; can comment on the issue and add label `agent-failed`, remove `agent-running`.
7. On success: commits with message `feat: implement issue #{number}`; if `TEST_MODE` stops there; if `OPEN_PR` pushes and opens a PR and comments on the issue; adds `needs-review`, removes `agent-running`.
8. Run metadata is stored in `runs/{runId}.json`, logs in `logs/{runId}.log`.

**Hard constraints:** never push directly to `main`; never auto-merge PRs; one issue per run; planner always runs before coder.

## Sample GitHub issue format

To have the worker pick up an issue, add labels **`auto-build`** and **`overnight`**. Example:

**Title:** Improve transactions search empty state

**Body:**

```
Goal:
Improve the UX when a natural-language query returns no matching transactions.

Requirements:
- show a friendlier empty state
- preserve any backend answer text if available
- keep current search behavior intact
- add tests if relevant
```

## Project structure

- `src/config` – Env loading and validation (zod).
- `src/lib` – Logger (pino), fs helpers, shell (execa).
- `src/github` – GitHub client (Octokit), issues (list, labels, comments), PRs (open).
- `src/sandbox` – Prepare sandbox (clone, branch), repo context (file tree), git helpers.
- `src/agent` – Prompts, planner (OpenAI), coder (OpenAI), apply edits.
- `src/runner` – Persist run metadata/logs, full run lifecycle (runIssue).
- `src/cli` – Entrypoint (`run-once`).
- `src/types` – Shared types.
- `logs/` – Per-run log files.
- `runs/` – Per-run metadata JSON.
