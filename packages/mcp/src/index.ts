import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer, SERVER_INSTRUCTIONS } from './server.js';

export * from './server.js';

export async function startStdioServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Direct execution support
if (process.argv[1]?.endsWith('mcp/dist/index.js')) {
  startStdioServer().catch((err) => {
    console.error('Fatal MCP server error:', err);
    process.exit(1);
  });
}
