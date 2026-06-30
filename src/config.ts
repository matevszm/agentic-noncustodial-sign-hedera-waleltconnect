import "dotenv/config";

const projectId = process.env.WALLETCONNECT_PROJECT_ID;
if (!projectId) {
  throw new Error(
    "WALLETCONNECT_PROJECT_ID is required. Get one at https://cloud.reown.com and set it in .env",
  );
}

export const config = {
  projectId,
  network: "testnet" as const,
  httpPort: Number(process.env.CONNECT_PORT ?? 7777),
  metadata: {
    name: process.env.DAPP_NAME ?? "Agentic Payment (PoC)",
    description:
      process.env.DAPP_DESCRIPTION ??
      "MCP server that sends HBAR signed by the user in HashPack",
    url: process.env.DAPP_URL ?? "https://example.com",
    icons: [process.env.DAPP_ICON_URL ?? "https://example.com/icon.png"],
  },
};
