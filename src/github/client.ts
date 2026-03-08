import { Octokit } from '@octokit/rest';
import { loadEnv } from '../config/env.js';

let octokit: Octokit | null = null;

export function getGitHubClient(): Octokit {
  if (!octokit) {
    const env = loadEnv();
    octokit = new Octokit({ auth: env.GITHUB_TOKEN });
  }
  return octokit;
}

export function getRepoParams(): { owner: string; repo: string } {
  const env = loadEnv();
  return { owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO };
}
