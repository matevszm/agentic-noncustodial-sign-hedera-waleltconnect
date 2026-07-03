import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { config } from "./config.js";
import { handleConnectRequest } from "./http.js";
import { SID_HEADER, SID_MISSING_MESSAGE, isValidSid } from "./sid.js";
import { buildHbarTransfer, parseAccountId, parseHbar } from "./tx.js";
import {
  awaitAuthorization,
  getConnectedAccount,
  getCurrentUri,
  getSessionStatus,
  initWallet,
  signAndExecute,
  startAuthorization,
} from "./wallet.js";

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

function errorText(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

function buildMcpServer(sid: string | null): McpServer {
  const server = new McpServer({
    name: "walletconnect-agentic-payment",
    version: "1.0.0",
  });

  server.registerTool(
    "authorize_start",
    {
      title: "Start wallet authorization",
      description:
        "Begin WalletConnect pairing. Returns a connectUrl with two options (browser extension or mobile QR). Non-blocking. Present connectUrl to the user, then IMMEDIATELY call authorize_await — it resolves automatically once the user connects, so no manual confirmation is needed.",
    },
    async () => {
      if (sid === null) return errorText(new Error(SID_MISSING_MESSAGE));
      try {
        const uri = await startAuthorization(sid);
        const connectUrl = `http://localhost:${config.httpPort}/connect?sid=${encodeURIComponent(sid)}`;
        return text(
          JSON.stringify({
            connectUrl,
            uri,
            note: "Give the user connectUrl to open in a browser: it offers 'extension' and 'mobile QR' buttons. Then call authorize_await right away (do not wait for the user to say anything) — it returns automatically when the connection is approved, and the browser tab will show a success message.",
          }),
        );
      } catch (error) {
        return errorText(error);
      }
    },
  );

  server.registerTool(
    "authorize_await",
    {
      title: "Wait for wallet approval",
      description:
        "Block until the user approves the pairing in HashPack (up to ~120s). Returns the connected accountId and network.",
    },
    async () => {
      if (sid === null) return errorText(new Error(SID_MISSING_MESSAGE));
      try {
        return text(JSON.stringify(await awaitAuthorization(sid)));
      } catch (error) {
        return errorText(error);
      }
    },
  );

  server.registerTool(
    "send_hbar",
    {
      title: "Send HBAR",
      description:
        "Send HBAR from the authorized account to a recipient. The user signs and broadcasts in HashPack. Requires an active session (authorize first).",
      inputSchema: {
        to: z.string().describe("recipient account id, e.g. 0.0.1234"),
        amount: z.number().positive().describe("amount in HBAR"),
      },
    },
    async ({ to, amount }) => {
      if (sid === null) return errorText(new Error(SID_MISSING_MESSAGE));
      try {
        const from = getConnectedAccount(sid);
        const tx = buildHbarTransfer(from, parseAccountId(to), parseHbar(amount));
        const { transactionId } = await signAndExecute(sid, tx);
        return text(
          JSON.stringify({
            transactionId,
            hashscanUrl: `https://hashscan.io/testnet/transaction/${transactionId}`,
          }),
        );
      } catch (error) {
        return errorText(error);
      }
    },
  );

  return server;
}

async function handleMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const header = req.headers[SID_HEADER];
  const sid = isValidSid(header) ? header : null;

  const server = buildMcpServer(sid);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res);
}

async function main(): Promise<void> {
  await initWallet();

  const httpServer = createServer((req, res) => {
    const pathname = new URL(req.url ?? "", "http://localhost").pathname;
    if (pathname === "/mcp") {
      handleMcp(req, res).catch((error) => {
        console.error("MCP request failed:", error);
        if (!res.headersSent) {
          res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
          res.end("internal error");
        }
      });
      return;
    }
    handleConnectRequest(req, res, getCurrentUri, getSessionStatus);
  });

  httpServer.listen(config.httpPort, "127.0.0.1", () => {
    console.error(
      `walletconnect-agentic-payment on http://localhost:${config.httpPort} (MCP: /mcp, connect: /connect?sid=<uuid>)`,
    );
  });
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
