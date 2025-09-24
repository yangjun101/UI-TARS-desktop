import { McpServer as InMemoryMCPServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerParameters } from '@modelcontextprotocol/sdk/client/stdio.js';

// `type` field only save but not used
export type MCP_SERVER_TYPE = 'stdio' | 'sse' | 'builtin' | 'streamable-http';

export interface MCPFilterConfig {
  allow?: string[];
  block?: string[];
}

export interface MCPFilters {
  tools?: MCPFilterConfig;
  prompts?: MCPFilterConfig;
}

interface BaseMCPServer<ServerNames extends string = string> {
  name: ServerNames;
  status?: 'activate' | 'error' | 'disabled';
  description?: string;
  /** timeout (seconds), default 60s */
  timeout?: number;
  /** filters for tools and prompts */
  filters?: MCPFilters;
}

export type MCPServer<ServerNames extends string = string> =
  | ({ type?: 'builtin' } & BuiltInMCPServer<ServerNames>)
  | ({ type?: 'stdio' } & StdioMCPServer<ServerNames>)
  | ({ type?: 'sse' } & SSEMCPServer<ServerNames>)
  | ({ type?: 'streamable-http' } & StreamableHTTPMCPServer<ServerNames>);

export type BuiltInMCPServer<ServerNames extends string = string> =
  BaseMCPServer<ServerNames> & {
    /** in-memory MCP server, same as function call */
    mcpServer: InMemoryMCPServer;
  };

export type StdioMCPServer<ServerNames extends string = string> =
  BaseMCPServer<ServerNames> &
    Pick<StdioServerParameters, 'command' | 'args' | 'env' | 'cwd'>;

export type SSEMCPServer<ServerNames extends string = string> =
  BaseMCPServer<ServerNames> & {
    /** SSE server */
    url: string;
    /** headers for SSE server */
    headers?: HeadersInit;
  };

export type StreamableHTTPMCPServer<ServerNames extends string = string> =
  BaseMCPServer<ServerNames> & {
    /** streamable http server */
    url: string;
    /** headers for streamable http server */
    headers?: HeadersInit;
  };
