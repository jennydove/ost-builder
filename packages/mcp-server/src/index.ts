#!/usr/bin/env node
import { main } from './server.js';

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  // stdout is the MCP transport — diagnostics must go to stderr.
  process.stderr.write(`tree-mcp: ${message}\n`);
  process.exit(1);
});
