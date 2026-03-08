import { getGitHubClient } from './client.js';
import { getRepoParams } from './client.js';

const ELIGIBLE_LABELS = ['auto-build', 'overnight'];
const AGENT_RUNNING = 'agent-running';
const AGENT_FAILED = 'agent-failed';
const NEEDS_REVIEW = 'needs-review';

export interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  labels: string[];
  state: string;
}

export async function listEligibleIssues(): Promise<GitHubIssue[]> {
  const client = getGitHubClient();
  const { owner, repo } = getRepoParams();
  const q = `repo:${owner}/${repo} is:open label:auto-build label:overnight`;
  const { data } = await client.rest.search.issuesAndPullRequests({ q, per_page: 10 });
  const items = (data.items ?? []).filter((item) => !('pull_request' in item && item.pull_request));
  const out: GitHubIssue[] = items.map((item) => ({
    number: item.number,
    title: item.title ?? '',
    body: item.body ?? null,
    labels: (item.labels ?? []).map((l) => (typeof l === 'string' ? l : l.name ?? '')),
    state: item.state ?? 'open',
  }));
  return out;
}

export async function addLabel(issueNumber: number, label: string): Promise<void> {
  const client = getGitHubClient();
  const { owner, repo } = getRepoParams();
  await client.rest.issues.addLabels({
    owner,
    repo,
    issue_number: issueNumber,
    labels: [label],
  });
}

export async function removeLabel(issueNumber: number, label: string): Promise<void> {
  const client = getGitHubClient();
  const { owner, repo } = getRepoParams();
  await client.rest.issues.removeLabel({
    owner,
    repo,
    issue_number: issueNumber,
    name: label,
  });
}

export async function commentOnIssue(issueNumber: number, body: string): Promise<void> {
  const client = getGitHubClient();
  const { owner, repo } = getRepoParams();
  await client.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body,
  });
}

export async function addAgentRunningLabel(issueNumber: number): Promise<void> {
  await addLabel(issueNumber, AGENT_RUNNING);
}

export async function removeAgentRunningLabel(issueNumber: number): Promise<void> {
  try {
    await removeLabel(issueNumber, AGENT_RUNNING);
  } catch (e) {
    // Label might not exist
  }
}

export async function addAgentFailedLabel(issueNumber: number): Promise<void> {
  await addLabel(issueNumber, AGENT_FAILED);
}

export async function addNeedsReviewLabel(issueNumber: number): Promise<void> {
  await addLabel(issueNumber, NEEDS_REVIEW);
}
