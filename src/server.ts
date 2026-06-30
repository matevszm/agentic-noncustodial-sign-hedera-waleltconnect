import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import QRCode from "qrcode";
import { z } from "zod";
import { buildHbarTransfer, parseAccountId, parseHbar } from "./tx.js";
import {
  awaitAuthorization,
  getConnectedAccount,
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

async function main(): Promise<void> {
  await initWallet();

  const server = new McpServer({
    name: "walletconnect-agentic-payment",
    version: "1.0.0",
  });

  server.registerTool(
    "authorize_start",
    {
      title: "Start wallet authorization",
      description:
        "Begin WalletConnect pairing. Returns a wc: URI and a QR code to present to the user (scan/open in HashPack). Non-blocking; call authorize_await next.",
    },
    async () => {
      try {
        const uri = await startAuthorization();
        const qrCodeFile = join(process.cwd(), "wc-qr.png");
        await QRCode.toFile(qrCodeFile, uri);
        return text(
          JSON.stringify({
            uri,
            qrCodeFile,
            note: "Tell the user to open qrCodeFile and scan it in HashPack (camera/scan button), or paste the wc: URI into HashPack's WalletConnect connect screen. Do not print any base64. Then call authorize_await once the user confirms.",
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
      try {
        return text(JSON.stringify(await awaitAuthorization()));
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
      try {
        const from = getConnectedAccount();
        const tx = buildHbarTransfer(from, parseAccountId(to), parseHbar(amount));
        const { transactionId } = await signAndExecute(tx);
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

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("walletconnect-agentic-payment MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
