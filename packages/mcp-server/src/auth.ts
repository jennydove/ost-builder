import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Mirrors packages/cli/src/config/session.ts. Read-only here; we never write.
type CliSession = {
  apiBase: string;
  token: string;
  savedAt: number;
};

const DEFAULT_API_BASE = 'https://mozost.netlify.app';

function sessionFilePath(): string {
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'ost-builder', 'cli-session.json');
}

export function loadCliSession(
  readFile: (p: string) => string = (p) => fs.readFileSync(p, 'utf8'),
  exists: (p: string) => boolean = (p) => fs.existsSync(p),
): CliSession | null {
  const file = sessionFilePath();
  if (!exists(file)) return null;
  try {
    const parsed = JSON.parse(readFile(file)) as CliSession;
    if (!parsed?.token || !parsed?.apiBase) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface ResolvedAuth {
  token: string;
  apiBase: string;
}

export interface ResolveAuthDeps {
  env?: NodeJS.ProcessEnv;
  loadSession?: () => CliSession | null;
}

export function resolveAuth(deps: ResolveAuthDeps = {}): ResolvedAuth {
  const env = deps.env ?? process.env;
  const loadSession = deps.loadSession ?? (() => loadCliSession());

  const envToken = env.OST_PAT;
  if (envToken) {
    const apiBase = (env.OST_API_BASE || DEFAULT_API_BASE).replace(/\/$/, '');
    return { token: envToken, apiBase };
  }

  const session = loadSession();
  if (session) {
    return { token: session.token, apiBase: session.apiBase.replace(/\/$/, '') };
  }

  throw new Error(
    "No OST credentials found. Set OST_PAT in your MCP server env, " +
      "or run 'npx ost-builder auth login <token>' on this machine. " +
      'Get a token at https://mozost.netlify.app under Account → API tokens.',
  );
}
