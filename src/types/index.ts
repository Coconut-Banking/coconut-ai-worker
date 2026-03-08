/**
 * Shared types for coconut-ai-worker.
 */

export interface RunMetadata {
  runId: string;
  startedAt: string;
  finishedAt?: string;
  issueNumber: number;
  issueTitle: string;
  sandboxPath: string;
  branchName?: string;
  prUrl?: string;
  changedFiles: string[];
  validationPassed: boolean;
  validationLog?: string;
  error?: string;
  dryRun?: boolean;
  testMode?: boolean;
}

export interface PlannerOutput {
  summary: string;
  likelyFilesToChange: string[];
  implementationSteps: string[];
  testsToAddOrUpdate: string[];
  risks: string[];
  confidence: 'low' | 'medium' | 'high';
  assumptions?: string[];
}

export interface CoderFileEdit {
  path: string;
  content: string;
  action: 'create' | 'replace';
}

export interface CoderOutput {
  summary: string;
  files_to_modify: Array<{ path: string; content: string }>;
  files_to_create: Array<{ path: string; content: string }>;
  changed_files: string[];
  rationale: string;
}

export interface RepoContext {
  fileTree: string;
  agentsMd: string;
  projectSpecMd: string;
}
