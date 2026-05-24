#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  parseMarkdownToTree,
  serializeTreeToMarkdown,
  encodeMarkdownToUrlFragment,
} from '@ost-builder/shared';

const DEFAULT_SHARE_BASE = 'https://ost-builder.trinixlabs.dev/';

const DISABLED_NOTICE =
  'ost-builder auth/library commands are temporarily disabled.\n' +
  '\n' +
  'They targeted the retired Cloudflare backend. The CLI is being\n' +
  'rebuilt around personal access tokens against the live\n' +
  'Netlify+Supabase backend (Phase E of the 2026-05-22 codebase\n' +
  'audit — see docs/codebase-audit-2026-05-22.md §5).\n' +
  '\n' +
  'In the meantime, use the local file workflow:\n' +
  '  ost-builder <file.md> [--show] [--share] [--name <name>]';

type LegacyOptions = {
  inputPath?: string;
  share: boolean;
  show: boolean;
  shareBase: string;
  format: 'json' | 'markdown';
  formatExplicit: boolean;
  pretty: boolean;
  name?: string;
};

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

function printRootHelp() {
  console.log(`Opportunity Solution Tree (OST) Builder CLI ✨

Usage:
  ost-builder <file.md> [legacy options]
  ost-builder auth <login|status|logout>      (disabled — rebuilding in Phase E)
  ost-builder library <browse|upload|download|share|access>   (disabled — rebuilding in Phase E)

Legacy options:
  --show
  --share
  --name <name>
  --format <json|markdown>
  --pretty
  --share-base <url>
  --help, -h

Note: the auth and library subcommands targeted the retired Cloudflare
backend and currently fail with a notice. They will return in Phase E
of the codebase audit (see docs/codebase-audit-2026-05-22.md §5).`);
}

function parseLegacyArgs(args: string[]): LegacyOptions {
  const options: LegacyOptions = {
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
        printRootHelp();
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

function exitDisabled(): never {
  console.error(DISABLED_NOTICE);
  process.exit(2);
}

async function handleAuth(_args: string[]) {
  exitDisabled();
}

async function handleLibrary(_args: string[]) {
  exitDisabled();
}

async function runLegacy(args: string[]) {
  const options = parseLegacyArgs(args);
  if (!options.inputPath) {
    printRootHelp();
    process.exit(1);
  }

  const resolvedPath = path.resolve(process.cwd(), options.inputPath);
  if (!fs.existsSync(resolvedPath)) throw new Error(`Markdown file not found: ${resolvedPath}`);

  const markdown = fs.readFileSync(resolvedPath, 'utf8');
  let tree = parseMarkdownToTree(markdown);
  const currentMarkdown = markdown;

  if (options.name) tree.name = options.name;

  const shouldPrint =
    !(options.share && options.format === 'json') && !(options.show && !options.formatExplicit);
  if (shouldPrint) {
    if (options.format === 'markdown') console.log(currentMarkdown);
    else console.log(formatTreeAsJson(tree, options.pretty));
  }

  if (options.share) {
    const base = options.shareBase.replace(/#.*$/, '');
    const shareMarkdown =
      options.format === 'markdown'
        ? currentMarkdown
        : serializeTreeToMarkdown(tree, options.name || tree.name);
    const fragment = encodeMarkdownToUrlFragment(shareMarkdown, options.name || tree.name);
    const shareLink = `${base.replace(/\/?$/, '/')}#${fragment}`;
    if (options.show) {
      console.error(`🚀 Opening "${options.name || tree.name}" in your browser...`);
      openUrl(shareLink);
    }
    console.error(`🔗 Copy the following Share link:\n${shareLink}\n`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.includes('--help') || args.includes('-h')) {
    printRootHelp();
    return;
  }

  const root = args[0];
  if (root === 'auth') {
    await handleAuth(args.slice(1));
    return;
  }
  if (root === 'library') {
    await handleLibrary(args.slice(1));
    return;
  }

  await runLegacy(args);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
