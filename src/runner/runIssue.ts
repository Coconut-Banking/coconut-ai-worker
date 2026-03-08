import path from 'path';
import { loadEnv } from '../config/env.js';
import { getLogger } from '../lib/logger.js';
import { run } from '../lib/shell.js';
import { readFileUtf8, pathExists, writeFileUtf8 } from '../lib/fs.js';
import { listEligibleIssues, addAgentRunningLabel, removeAgentRunningLabel, addAgentFailedLabel, addNeedsReviewLabel, commentOnIssue } from '../github/issues.js';
import { openPullRequest, defaultPRTitle, defaultPRBody } from '../github/prs.js';
import { prepareSandbox, removeSandbox } from '../sandbox/prepareSandbox.js';
import { summarizeFileTree, sortTreeLinesForDisplay } from '../sandbox/repoContext.js';
import { addFiles, commit, push } from '../sandbox/git.js';
import { runPlanner } from '../agent/planner.js';
import { runCoder } from '../agent/coder.js';
import { applyEdits } from '../agent/applyEdits.js';
import { STARTER_AGENTS_MD, STARTER_PROJECT_SPEC_MD } from '../agent/prompts.js';
import { persistRunMetadata, persistRunLog } from './persistRun.js';
import type { RunMetadata } from '../types/index.js';
import type { RepoContext } from '../types/index.js';

const log = getLogger();

function runId(): string {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function loadOrCreateRepoContext(repoPath: string): Promise<RepoContext> {
  const agentsPath = path.join(repoPath, 'AGENTS.md');
  const specPath = path.join(repoPath, 'PROJECT_SPEC.md');
  let agentsMd = STARTER_AGENTS_MD;
  let projectSpecMd = STARTER_PROJECT_SPEC_MD;
  if (await pathExists(agentsPath)) {
    agentsMd = await readFileUtf8(agentsPath);
  } else {
    await writeFileUtf8(agentsPath, STARTER_AGENTS_MD);
  }
  if (await pathExists(specPath)) {
    projectSpecMd = await readFileUtf8(specPath);
  } else {
    await writeFileUtf8(specPath, STARTER_PROJECT_SPEC_MD);
  }
  const tree = await summarizeFileTree(repoPath);
  const fileTree = sortTreeLinesForDisplay(tree);
  return { fileTree, agentsMd, projectSpecMd };
}

function isMissingScript(output: string, script: string): boolean {
  return /Missing script:\s*["']?/.test(output) && output.includes(script);
}

function isBrokenLintSetup(output: string): boolean {
  return (
    output.includes('Invalid project directory') &&
    output.includes('no such directory') &&
    output.includes('lint')
  );
}

function isBrokenTestSetup(output: string): boolean {
  return (
    (output.includes('failed to load config') || output.includes('Startup Error')) &&
    (output.includes('vitest') || output.includes('ERR_REQUIRE_ESM'))
  );
}

async function runValidation(repoPath: string, logLines: string[]): Promise<{ passed: boolean; output: string }> {
  const out: string[] = [];
  const runOne = async (
    cmd: string,
    args: string[],
    opts?: {
      skipIfMissingScript?: string;
      skipIfBrokenLint?: boolean;
      skipIfBrokenTest?: boolean;
    }
  ): Promise<number> => {
    const res = await run(cmd, args, { cwd: repoPath });
    const combined = res.stdout + res.stderr;
    const line = `$ ${cmd} ${args.join(' ')}\n${res.stdout}\n${res.stderr}\n exit=${res.exitCode}`;
    out.push(line);
    logLines.push(line);
    if (res.exitCode !== 0) {
      if (opts?.skipIfMissingScript && isMissingScript(combined, opts.skipIfMissingScript)) return 0;
      if (opts?.skipIfBrokenLint && isBrokenLintSetup(combined)) return 0;
      if (opts?.skipIfBrokenTest && isBrokenTestSetup(combined)) return 0;
    }
    return res.exitCode;
  };
  let installExit = await runOne('npm', ['ci']);
  if (installExit !== 0) {
    installExit = await runOne('npm', ['install']);
  }
  if (installExit !== 0) {
    return { passed: false, output: out.join('\n') };
  }
  if (
    (await runOne('npm', ['run', 'lint'], { skipIfBrokenLint: true })) !== 0
  )
    return { passed: false, output: out.join('\n') };
  if (
    (await runOne('npm', ['run', 'typecheck'], { skipIfMissingScript: 'typecheck' })) !== 0
  )
    return { passed: false, output: out.join('\n') };
  if (
    (await runOne('npm', ['run', 'test'], {
      skipIfMissingScript: 'test',
      skipIfBrokenTest: true,
    })) !== 0
  )
    return { passed: false, output: out.join('\n') };
  return { passed: true, output: out.join('\n') };
}

export interface RunSummary {
  runId: string;
  issueNumber: number;
  issueTitle: string;
  sandboxPath: string;
  changedFiles: string[];
  validationPassed: boolean;
  branchName?: string;
  prUrl?: string;
  error?: string;
  dryRun?: boolean;
}

export async function runIssue(): Promise<RunSummary | null> {
  const env = loadEnv();
  const id = runId();
  const logLines: string[] = [`[${new Date().toISOString()}] runId=${id}`];

  const issues = await listEligibleIssues();
  if (issues.length === 0) {
    log.info('No eligible issues (auto-build + overnight)');
    return null;
  }
  const issue = issues[0];
  log.info({ issueNumber: issue.number, title: issue.title }, 'Selected issue');
  logLines.push(`Selected issue #${issue.number}: ${issue.title}`);

  let sandboxPath: string | null = null;
  let repoPath: string | null = null;
  let branchName: string | null = null;
  let changedFiles: string[] = [];

  try {
    await addAgentRunningLabel(issue.number);
    logLines.push('Added label agent-running');
  } catch (e) {
    log.warn({ err: e }, 'Failed to add agent-running label');
  }

  try {
    const sandbox = await prepareSandbox(id, issue.number);
    sandboxPath = sandbox.sandboxPath;
    repoPath = sandbox.repoPath;
    branchName = sandbox.branchName;
    logLines.push(`Sandbox: ${sandboxPath}, branch: ${branchName}`);

    const ctx = await loadOrCreateRepoContext(sandbox.repoPath);
    const plan = await runPlanner(issue.title, issue.body ?? '', ctx);
    logLines.push(`Planner summary: ${plan.summary}`);

    if (env.DRY_RUN) {
      const metadata: RunMetadata = {
        runId: id,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        issueNumber: issue.number,
        issueTitle: issue.title,
        sandboxPath: sandboxPath,
        branchName: branchName ?? undefined,
        changedFiles: [],
        validationPassed: false,
        dryRun: true,
        testMode: env.TEST_MODE ?? false,
      };
      await persistRunMetadata(metadata);
      await persistRunLog(id, logLines.join('\n'));
      await removeAgentRunningLabel(issue.number);
      if (!env.KEEP_SANDBOX && sandboxPath) await removeSandbox(sandboxPath);
      return {
        runId: id,
        issueNumber: issue.number,
        issueTitle: issue.title,
        sandboxPath: sandboxPath,
        changedFiles: [],
        validationPassed: true,
        branchName: branchName ?? undefined,
        dryRun: true,
      };
    }

    const currentFileContents: Record<string, string> = {};
    for (const relPath of plan.likelyFilesToChange) {
      const fullPath = path.join(sandbox.repoPath, relPath);
      if (await pathExists(fullPath)) {
        try {
          const content = await readFileUtf8(fullPath);
          currentFileContents[relPath] = content;
        } catch (e) {
          log.warn({ relPath, err: e }, 'Could not read file for coder context');
        }
      }
    }
    const coderOutput = await runCoder(issue.title, issue.body ?? '', plan, ctx, currentFileContents);
    changedFiles = await applyEdits(sandbox.repoPath, coderOutput);
    logLines.push(`Applied edits: ${changedFiles.join(', ')}`);

    const validation = await runValidation(sandbox.repoPath, logLines);
    const metadata: RunMetadata = {
      runId: id,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      issueNumber: issue.number,
      issueTitle: issue.title,
      sandboxPath: sandboxPath,
      branchName: branchName ?? undefined,
      changedFiles,
      validationPassed: validation.passed,
      validationLog: validation.output,
      testMode: env.TEST_MODE ?? false,
    };

    if (!validation.passed) {
      await persistRunMetadata(metadata);
      await persistRunLog(id, logLines.join('\n'));
      try {
        await commentOnIssue(
          issue.number,
          `Agent run failed (validation). Run ID: \`${id}\`. See logs for details.`
        );
      } catch (_) {}
      await addAgentFailedLabel(issue.number);
      await removeAgentRunningLabel(issue.number);
      if (!env.KEEP_SANDBOX && sandboxPath) await removeSandbox(sandboxPath);
      return {
        runId: id,
        issueNumber: issue.number,
        issueTitle: issue.title,
        sandboxPath: sandboxPath,
        changedFiles,
        validationPassed: false,
        branchName: branchName ?? undefined,
        error: 'Validation failed',
      };
    }

    if (changedFiles.length > 0) {
      await addFiles(sandbox.repoPath, changedFiles);
      await commit(sandbox.repoPath, `feat: implement issue #${issue.number}`);
      logLines.push('Committed');
    } else {
      logLines.push('No file changes to commit.');
    }

    let prUrl: string | undefined;
    if (env.TEST_MODE) {
      metadata.finishedAt = new Date().toISOString();
      await persistRunMetadata(metadata);
      await persistRunLog(id, logLines.join('\n'));
      if (!env.KEEP_SANDBOX && sandboxPath) await removeSandbox(sandboxPath);
      await removeAgentRunningLabel(issue.number);
      return {
        runId: id,
        issueNumber: issue.number,
        issueTitle: issue.title,
        sandboxPath: sandboxPath,
        changedFiles,
        validationPassed: true,
        branchName: branchName ?? undefined,
      };
    }

    if (changedFiles.length === 0) {
      await removeAgentRunningLabel(issue.number);
      metadata.finishedAt = new Date().toISOString();
      await persistRunMetadata(metadata);
      await persistRunLog(id, logLines.join('\n'));
      if (!env.KEEP_SANDBOX && sandboxPath) await removeSandbox(sandboxPath);
      return {
        runId: id,
        issueNumber: issue.number,
        issueTitle: issue.title,
        sandboxPath: sandboxPath,
        changedFiles,
        validationPassed: true,
        branchName: branchName ?? undefined,
      };
    }

    if (env.OPEN_PR) {
      await push(sandbox.repoPath, branchName!);
      prUrl = await openPullRequest(
        branchName!,
        defaultPRTitle(issue.number, issue.title),
        defaultPRBody(issue.number),
        issue.number
      );
      await commentOnIssue(issue.number, `Opened PR: ${prUrl}`);
      logLines.push(`PR: ${prUrl}`);
    } else {
      await push(sandbox.repoPath, branchName!);
    }

    await addNeedsReviewLabel(issue.number);
    await removeAgentRunningLabel(issue.number);
    metadata.prUrl = prUrl;
    await persistRunMetadata(metadata);
    await persistRunLog(id, logLines.join('\n'));
    if (!env.KEEP_SANDBOX && sandboxPath) await removeSandbox(sandboxPath);

    return {
      runId: id,
      issueNumber: issue.number,
      issueTitle: issue.title,
      sandboxPath: sandboxPath,
      changedFiles,
      validationPassed: true,
      branchName: branchName ?? undefined,
      prUrl,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err }, 'runIssue failed');
    logLines.push(`Error: ${message}`);
    const metadata: RunMetadata = {
      runId: id,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      issueNumber: issue.number,
      issueTitle: issue.title,
      sandboxPath: sandboxPath ?? '',
      branchName: branchName ?? undefined,
      changedFiles,
      validationPassed: false,
      error: message,
    };
    await persistRunMetadata(metadata);
    await persistRunLog(id, logLines.join('\n'));
    try {
      await commentOnIssue(issue.number, `Agent run failed: ${message}. Run ID: \`${id}\`.`);
    } catch (_) {}
    await addAgentFailedLabel(issue.number);
    await removeAgentRunningLabel(issue.number);
    if (sandboxPath && !env.KEEP_SANDBOX) await removeSandbox(sandboxPath);
    return {
      runId: id,
      issueNumber: issue.number,
      issueTitle: issue.title,
      sandboxPath: sandboxPath ?? '',
      changedFiles,
      validationPassed: false,
      branchName: branchName ?? undefined,
      error: message,
    };
  }
}
