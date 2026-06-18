import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { resolveAuth, type ResolveAuthDeps, type ResolvedAuth } from './auth.js';
import type { FetchLike } from './http.js';
import { listTreesTool } from './tools/listTrees.js';
import { getTreeTool } from './tools/getTree.js';
import { getTreeJsonTool } from './tools/getTreeJson.js';
import { createTreeTool } from './tools/createTree.js';
import { updateTreeTool } from './tools/updateTree.js';
import { deleteTreeTool } from './tools/deleteTree.js';

export const SERVER_NAME = 'tree-mcp';
export const SERVER_VERSION = '0.2.0';

export interface CreateServerDeps {
  auth: ResolvedAuth;
  fetchImpl?: FetchLike;
}

export function createServer({ auth, fetchImpl = fetch }: CreateServerDeps): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  const tools = [
    listTreesTool(auth, fetchImpl),
    getTreeTool(auth, fetchImpl),
    getTreeJsonTool(auth, fetchImpl),
    createTreeTool(auth, fetchImpl),
    updateTreeTool(auth, fetchImpl),
    deleteTreeTool(auth, fetchImpl),
  ] as const;

  for (const tool of tools) {
    // The SDK accepts a raw Zod shape for inputSchema. registerTool's generics
    // disambiguate the handler arg type by the shape passed here.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server.registerTool(tool.name, tool.config as any, tool.handler as any);
  }

  return server;
}

export async function main(deps: ResolveAuthDeps = {}): Promise<void> {
  const auth = resolveAuth(deps);
  const server = createServer({ auth });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
