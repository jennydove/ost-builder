#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  parseMarkdownToTree,
  serializeTreeToMarkdown,
  encodeMarkdownToUrlFragment,
} from '@ost-builder/shared';
import { loadSession, saveSession, clearSession } from './config/session.js';
import { apiFetch, resolveApiBase } from './http/client.js';

const DEFAULT_SHARE_BASE = 'https://mozost.netlify.app/';

function openUrl(url: string) {
  if (process.platform === 'darwin') {
    spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
    return;
  }
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref();
    return;
  }
  spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
}

function formatTreeAsJson(tree: unknown, pretty: boolean): string {
  return JSON.stringify(tree, (_k, v) => (v instanceof Date ? v.toISOString() : v), pretty ? 2 : 0);
}

function printHelp() {
  console.log(`OST Builder CLI

Usage:
  ost-builder <file.md> [options]
  ost-builder auth login <token>
  ost-builder auth status
  ost-builder auth logout
  ost-builder library list
  ost-builder library upload <file.md> [--name <name>]
  ost-builder library download <id> [--output <file>]

Options:
  --show              Open tree in browser
  --share             Generate shareable link
  --name <name>       Override tree name
  --format <json|md>  Output format (default: json)
  --pretty            Pretty-print JSON
  --help, -h          Show this help

Environment:
  OST_API_BASE        Override API base URL`);
}

// ── Auth commands ──────────────────────────────────────────

async function handleAuth(args: string[]) {
  const sub = args[0];

  if (sub === 'login') {
    const token = args[1];
    if (!token) {
      console.error('Usage: ost-builder auth login <token>\n\nGenerate a token at your OST Builder settings page.');
      process.exit(1);
    }
    if (!token.startsWith('ost_pat_')) {
      console.error('Invalid token format. Tokens start with ost_pat_');
      process.exit(1);
    }
    const apiBase = resolveApiBase();
    saveSession({ apiBase, token, savedAt: Date.now() });
    console.log(`Authenticated. Token saved to ~/.config/ost-builder/cli-session.json\nAPI: ${apiBase}`);
    return;
  }

  if (sub === 'status') {
    const session = loadSession();
    if (!session) {
      console.log('Not authenticated. Run: ost-builder auth login <token>');
      return;
    }
    console.log(`Authenticated\nAPI: ${session.apiBase}\nToken: ${session.token.slice(0, 16)}...`);
    return;
  }

  if (sub === 'logout') {
    clearSession();
    console.log('Logged out. Session cleared.');
    return;
  }

  console.error('Usage: ost-builder auth <login|status|logout>');
  process.exit(1);
}

// ── Library commands ───────────────────────────────────────

type ShareListItem = {
  id: string;
  name: string | null;
  visibility: string;
  updatedAt: number;
  link: string;
};

async function handleLibrary(args: string[]) {
  const session = loadSession();
  if (!session) {
    console.error('Not authenticated. Run: ost-builder auth login <token>');
    process.exit(1);
  }

  const sub = args[0];

  if (sub === 'list') {
    const res = await apiFetch<{ items: ShareListItem[] }>('/api/share/store');
    if (!res.items.length) {
      console.log('No trees found.');
      return;
    }
    console.log(`\n  ${'Name'.padEnd(40)} ${'Visibility'.padEnd(18)} ${'Updated'.padEnd(24)} ID`);
    console.log(`  ${'─'.repeat(40)} ${'─'.repeat(18)} ${'─'.repeat(24)} ${'─'.repeat(36)}`);
    for (const item of res.items) {
      const name = (item.name || 'Untitled').slice(0, 38).padEnd(40);
      const vis = item.visibility.padEnd(18);
      const updated = new Date(item.updatedAt).toISOString().slice(0, 19).replace('T', ' ').padEnd(24);
      console.log(`  ${name} ${vis} ${updated} ${item.id}`);
    }
    console.log(`\n  ${res.items.length} tree(s)\n`);
    return;
  }

  if (sub === 'upload') {
    const filePath = args[1];
    if (!filePath) {
      console.error('Usage: ost-builder library upload <file.md> [--name <name>]');
      process.exit(1);
    }

    const resolved = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(resolved)) {
      console.error(`File not found: ${resolved}`);
      process.exit(1);
    }

    let name: string | undefined;
    const nameIdx = args.indexOf('--name');
    if (nameIdx !== -1 && args[nameIdx + 1]) name = args[nameIdx + 1];

    const markdown = fs.readFileSync(resolved, 'utf8');
    if (!name) {
      const firstLine = markdown.split('\n')[0]?.trim() || '';
      if (firstLine.startsWith('# ')) name = firstLine.slice(2).trim();
    }

    const res = await apiFetch<{ id: string; link: string }>('/api/share/store', {
      method: 'POST',
      body: JSON.stringify({
        markdown,
        name: name || path.basename(resolved, '.md'),
        visibility: 'link-public',
      }),
    });

    console.log(`Uploaded: ${name || path.basename(resolved)}`);
    console.log(`  ID:   ${res.id}`);
    console.log(`  Link: ${resolveApiBase()}${res.link}`);
    return;
  }

  if (sub === 'download') {
    const id = args[1];
    if (!id) {
      console.error('Usage: ost-builder library download <id> [--output <file>]');
      process.exit(1);
    }

    const res = await apiFetch<{ markdown: string; name?: string | null }>(
      `/api/share/store/${encodeURIComponent(id)}`,
    );

    let outputPath: string | undefined;
    const outIdx = args.indexOf('--output');
    if (outIdx !== -1 && args[outIdx + 1]) outputPath = args[outIdx + 1];

    if (outputPath) {
      const resolved = path.resolve(process.cwd(), outputPath);
      fs.writeFileSync(resolved, res.markdown, 'utf8');
      console.log(`Downloaded "${res.name || 'Untitled'}" → ${resolved}`);
    } else {
      process.stdout.write(res.markdown);
    }
    return;
  }

  console.error('Usage: ost-builder library <list|upload|download>');
  process.exit(1);
}

// ── Local file workflow ────────────────────────────────────

type LocalOptions = {
  inputPath?: string;
  share: boolean;
  show: boolean;
  shareBase: string;
  format: 'json' | 'markdown';
  formatExplicit: boolean;
  pretty: boolean;
  name?: string;
};

function parseLocalArgs(args: string[]): LocalOptions {
  const options: LocalOptions = {
    share: false,
    show: false,
    shareBase: DEFAULT_SHARE_BASE,
    format: 'json',
    formatExplicit: false,
    pretty: false,
  };
  let sawFlag = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) continue;
    switch (arg) {
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
      case '--share':
        options.share = true;
        sawFlag = true;
        break;
      case '--show':
        options.show = true;
        options.share = true;
        sawFlag = true;
        break;
      case '--pretty':
        options.pretty = true;
        sawFlag = true;
        break;
      case '--format': {
        const value = args[i + 1];
        if (!value || (value !== 'json' && value !== 'markdown'))
          throw new Error('Expected --format json or markdown.');
        options.format = value;
        options.formatExplicit = true;
        sawFlag = true;
        i += 1;
        break;
      }
      case '--share-base': {
        const value = args[i + 1];
        if (!value) throw new Error('Expected a URL after --share-base.');
        options.shareBase = value;
        sawFlag = true;
        i += 1;
        break;
      }
      case '--name': {
        const value = args[i + 1];
        if (!value) throw new Error('Expected a name after --name.');
        options.name = value;
        sawFlag = true;
        i += 1;
        break;
      }
      default:
        if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
        if (!options.inputPath) options.inputPath = arg;
        else throw new Error('Only one input markdown file is supported.');
    }
  }

  if (!sawFlag && options.inputPath) {
    options.show = true;
    options.share = true;
  }
  return options;
}

async function runLocal(args: string[]) {
  const options = parseLocalArgs(args);
  if (!options.inputPath) {
    printHelp();
    process.exit(1);
  }

  const resolvedPath = path.resolve(process.cwd(), options.inputPath);
  if (!fs.existsSync(resolvedPath)) throw new Error(`Markdown file not found: ${resolvedPath}`);

  const markdown = fs.readFileSync(resolvedPath, 'utf8');
  const tree = parseMarkdownToTree(markdown);

  if (options.name) tree.name = options.name;

  const shouldPrint =
    !(options.share && options.format === 'json') && !(options.show && !options.formatExplicit);
  if (shouldPrint) {
    if (options.format === 'markdown') console.log(markdown);
    else console.log(formatTreeAsJson(tree, options.pretty));
  }

  if (options.share) {
    const base = options.shareBase.replace(/#.*$/, '');
    const shareMarkdown =
      options.format === 'markdown'
        ? markdown
        : serializeTreeToMarkdown(tree, options.name || tree.name);
    const fragment = encodeMarkdownToUrlFragment(shareMarkdown, options.name || tree.name);
    const shareLink = `${base.replace(/\/?$/, '/')}#${fragment}`;
    if (options.show) {
      console.error(`Opening "${options.name || tree.name}" in your browser...`);
      openUrl(shareLink);
    }
    console.error(`Share link:\n${shareLink}\n`);
  }
}

// ── Main ───────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  const root = args[0];
  if (root === 'auth') return handleAuth(args.slice(1));
  if (root === 'library') return handleLibrary(args.slice(1));

  await runLocal(args);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
