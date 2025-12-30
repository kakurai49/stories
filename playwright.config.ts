import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

type Repo = { owner: string; repo: string };

const ensureTrailingSlash = (url: string): string => (url.endsWith('/') ? url : `${url}/`);

const tryExec = (command: string): string | null => {
  try {
    const output = execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return output.length > 0 ? output : null;
  } catch {
    return null;
  }
};

const parseOwnerRepoFromRemote = (remote: string): Repo | null => {
  const normalized = remote.trim();
  const sshMatch = normalized.match(/git@github\.com:([^/]+)\/([^/.]+)(?:\.git)?/);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  const httpsMatch = normalized.match(/https?:\/\/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?/);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }

  return null;
};

const parseOwnerFromEmail = (email: string): string | null => {
  const noreply = email.match(/^(?:\d+\+)?([^@+]+)@users\.noreply\.github\.com$/i);
  if (noreply?.[1]) return noreply[1];
  return null;
};

const detectRepo = (): Repo | null => {
  const envRepo = process.env.GITHUB_REPOSITORY ?? process.env.REPOSITORY;
  if (envRepo && envRepo.includes('/')) {
    const [owner, repo] = envRepo.split('/', 2);
    return { owner, repo };
  }

  const remote = tryExec('git config --get remote.origin.url');
  if (remote) {
    const parsed = parseOwnerRepoFromRemote(remote);
    if (parsed) return parsed;
  }

  const lastCommitEmail = tryExec('git log -1 --pretty=format:%ae');
  const ownerFromEmail = lastCommitEmail ? parseOwnerFromEmail(lastCommitEmail) : null;
  if (ownerFromEmail) {
    return { owner: ownerFromEmail, repo: path.basename(process.cwd()) };
  }

  return null;
};

const detectBaseURL = (): string => {
  const envBase = process.env.BASE_URL?.trim();
  if (envBase) {
    return ensureTrailingSlash(envBase);
  }

  const repo = detectRepo();

  if (repo) {
    const ghCli = tryExec('command -v gh');
    if (ghCli) {
      const pagesUrl = tryExec(`gh api repos/${repo.owner}/${repo.repo}/pages --jq .html_url`);
      if (pagesUrl) {
        return ensureTrailingSlash(pagesUrl);
      }
    }
  }

  const cnamePath = path.join(process.cwd(), 'CNAME');
  if (fs.existsSync(cnamePath)) {
    const cname = fs.readFileSync(cnamePath, 'utf-8').split('\n')[0]?.trim();
    if (cname) {
      const prefixed = cname.startsWith('http') ? cname : `https://${cname}`;
      return ensureTrailingSlash(prefixed);
    }
  }

  if (repo) {
    if (repo.repo.toLowerCase() === `${repo.owner.toLowerCase()}.github.io`) {
      return ensureTrailingSlash(`https://${repo.owner}.github.io/`);
    }
    return ensureTrailingSlash(`https://${repo.owner}.github.io/${repo.repo}/`);
  }

  const fallbackRepo = path.basename(process.cwd());
  return ensureTrailingSlash(`https://${fallbackRepo}.github.io/`);
};

const resolvedBaseURL = detectBaseURL();
console.log(`Playwright baseURL resolved to: ${resolvedBaseURL}`);

export default defineConfig({
  testDir: 'tests',
  timeout: 120 * 1000,
  outputDir: path.join('artifacts', 'test-results'),
  reporter: [
    ['list'],
    ['html', { outputFolder: path.join('artifacts', 'playwright-report'), open: 'never' }],
  ],
  use: {
    baseURL: resolvedBaseURL,
    headless: true,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: true,
    proxy:
      process.env.HTTPS_PROXY || process.env.HTTP_PROXY
        ? {
            server: (process.env.HTTPS_PROXY || process.env.HTTP_PROXY)!,
            bypass: process.env.NO_PROXY,
          }
        : undefined,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
