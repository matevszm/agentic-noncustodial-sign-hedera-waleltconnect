# WalletConnect Agentic Payment (PoC)

An MCP server that lets an AI agent authorize a HashPack wallet and send HBAR on
**Hedera testnet**. The user approves every action inside HashPack over
WalletConnect — **private keys never leave the wallet**, and the server holds no
keys and cannot move funds on its own.

A single Node/TypeScript process hosts both the MCP server (stdio) and an
embedded WalletConnect dApp client (the "Approver"), plus a small local HTTP
server that serves a browser connect page.

## Requirements

- Node 20+ and [pnpm](https://pnpm.io)
- A WalletConnect / [Reown Cloud](https://cloud.reown.com) **project ID**
- HashPack with a Hedera **testnet** account (browser extension or mobile), with
  some test HBAR

## Setup

```bash
pnpm install
cp .env.example .env
# edit .env and set WALLETCONNECT_PROJECT_ID
```

Environment variables (`.env`):

| Variable                  | Required | Default                  |
| ------------------------- | -------- | ------------------------ |
| `WALLETCONNECT_PROJECT_ID`| yes      | —                        |
| `CONNECT_PORT`            | no       | `7777`                   |
| `DAPP_NAME`               | no       | `Agentic Payment (PoC)`  |
| `DAPP_DESCRIPTION`        | no       | (sensible default)       |
| `DAPP_URL`                | no       | `https://example.com`    |
| `DAPP_ICON_URL`           | no       | `https://example.com/icon.png` |

Network is hardcoded to **testnet** for the PoC.

## Run

```bash
pnpm dev     # start the server (tsx)
pnpm test    # run the transaction-builder self-check
```

### Register with an MCP client (Claude Code)

```bash
claude mcp add hbar -- bash -c "cd /ABS/PATH/TO/REPO && exec node_modules/.bin/tsx src/server.ts"
```

Running `tsx` directly (not `pnpm dev`) keeps stdout clean for the MCP channel;
the `cd` ensures `.env` is loaded. Confirm the tools with `claude mcp list` /
`/mcp` after restarting the session.

## Tools

| Tool              | Args                       | Returns                          |
| ----------------- | -------------------------- | -------------------------------- |
| `authorize_start` | none                       | `connectUrl`, `uri`              |
| `authorize_await` | none                       | `accountId`, `network`           |
| `send_hbar`       | `to` (0.0.x), `amount` (ℏ) | `transactionId`, `hashscanUrl`   |

## Flow

**Authorize**

1. The agent calls `authorize_start` → gets `connectUrl`
   (`http://localhost:7777/connect`), presents it, and immediately calls
   `authorize_await` (which blocks until approval — no manual confirmation needed).
2. Open `connectUrl` in a browser and choose **Connect via extension** or
   **Connect via mobile (QR)**.
   - Extension: a connect popup appears in HashPack → approve.
   - Mobile: scan the QR (or paste the `wc:` URI) in HashPack mobile → approve.
3. On approval, `authorize_await` returns the connected `accountId`, and the
   browser tab shows a success message.

**Send**

1. The agent calls `send_hbar { to, amount }`.
2. HashPack shows a signing popup → approve.
3. HashPack signs **and** broadcasts; the tool returns the `transactionId` and a
   HashScan link.

## Notes & limitations (PoC)

- **Single user, in-memory session.** Restarting the process loses the session —
  re-authorize before sending.
- **Testnet only**; no token/contract transactions, no fee estimation.
- **No separate transaction preview** — the HashPack popup is the only
  confirmation surface.
- The browser tab tries to close itself on success but browsers usually block
  `window.close()` for manually opened tabs, so it shows a "you can close this
  tab" message instead.
- The extension connect path relies on the HashPack content script responding on
  `http://localhost`; if it is not detected, use the mobile/QR path.
