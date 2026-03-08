#!/usr/bin/env node
import { runIssue } from '../runner/runIssue.js';
import { loadEnv } from '../config/env.js';
import { getLogger } from '../lib/logger.js';

const log = getLogger();

async function main(): Promise<void> {
  loadEnv();
  const summary = await runIssue();
  if (!summary) {
    console.log('No issue processed. Exiting.');
    process.exit(0);
  }
  console.log('\n--- Run summary ---');
  console.log('Run ID:', summary.runId);
  console.log('Issue:', `#${summary.issueNumber}`, summary.issueTitle);
  console.log('Sandbox:', summary.sandboxPath);
  console.log('Changed files:', summary.changedFiles.length ? summary.changedFiles.join(', ') : '(none)');
  console.log('Validation:', summary.validationPassed ? 'PASSED' : 'FAILED');
  if (summary.branchName) console.log('Branch:', summary.branchName);
  if (summary.prUrl) console.log('PR:', summary.prUrl);
  if (summary.error) console.log('Error:', summary.error);
  if (summary.dryRun) console.log('(DRY_RUN: stopped after planner)');
  console.log('-------------------\n');
  process.exit(summary.validationPassed ? 0 : 1);
}

main().catch((err) => {
  log.error({ err }, 'cli failed');
  console.error(err);
  process.exit(1);
});
