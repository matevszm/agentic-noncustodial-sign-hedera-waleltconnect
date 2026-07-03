# WalletConnect Agentic Payment (PoC)

An MCP server that lets an AI agent authorize a HashPack wallet and send HBAR on
**Hedera testnet**. The user approves every action inside HashPack over
WalletConnect — **private keys never leave the wallet**, and the server holds no
keys and cannot move funds on its own.

A single Node/TypeScript process hosts everything on one HTTP port: the MCP
server (Streamable HTTP, at `/mcp`), an embedded WalletConnect dApp client (the
"Approver"), and a browser connect page (`/connect`). It serves **many
concurrent users** — each client identifies itself with a stable UUID v4 sent in
the `sid` HTTP header, and every session's wallet state is isolated.

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

Start the server yourself first (`pnpm dev`) — with HTTP transport the client
connects to a running URL, it does not spawn the process. Then register it,
passing your `sid` (any UUID v4) as a header. Generate one inline:

```bash
claude mcp add hbar http://localhost:7777/mcp --transport http --header "sid: $(uuidgen)"
```

Put `name` and the URL first and `--header` last: `--header` is variadic, so if
it comes before the positionals it swallows them (`missing required argument 'name'`).
No `uuidgen`? Use `$(cat /proc/sys/kernel/random/uuid)` instead (always v4, no
package needed).

Each user/client registers with their own `sid` — it is generated once at add
time and stored in the client config, so it stays stable (`claude mcp get hbar`
to see it). Confirm the tools with `claude mcp list` / `/mcp`. Without a valid
`sid` header the tools still list, but every call returns a message telling you
to add the header.

## Tools

| Tool              | Args                       | Returns                          |
| ----------------- | -------------------------- | -------------------------------- |
| `authorize_start` | none                       | `connectUrl`, `uri`              |
| `authorize_await` | none                       | `accountId`, `network`           |
| `send_hbar`       | `to` (0.0.x), `amount` (ℏ) | `transactionId`, `hashscanUrl`   |

## Flow

**Authorize**

1. The agent calls `authorize_start` → gets `connectUrl`
   (`http://localhost:7777/connect?sid=<yours>`), presents it, and immediately
   calls `authorize_await` (which blocks until approval — no manual confirmation
   needed).
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

- **Sessions are in-memory, keyed by `sid`.** Multiple users are supported
  concurrently, but nothing is persisted: restarting the process drops all
  sessions, so every user re-authorizes. No session TTL/eviction.
- **`sid` is the only identity.** Anyone who knows a `sid` can view/approve that
  session's connect page — fine for a PoC (a UUID v4 is unguessable), not for
  production.
- **Testnet only**; no token/contract transactions, no fee estimation.
- **No separate transaction preview** — the HashPack popup is the only
  confirmation surface.
- The browser tab tries to close itself on success but browsers usually block
  `window.close()` for manually opened tabs, so it shows a "you can close this
  tab" message instead.
- The extension connect path relies on the HashPack content script responding on
  `http://localhost`; if it is not detected, use the mobile/QR path.
