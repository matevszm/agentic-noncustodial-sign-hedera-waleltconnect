import { createRequire } from "node:module";
import type { DAppConnector } from "@hashgraph/hedera-wallet-connect";
import {
  AccountId,
  Client,
  LedgerId,
  TransactionId,
  TransferTransaction,
} from "@hiero-ledger/sdk";
import { config } from "./config.js";

const require = createRequire(import.meta.url);
const {
  DAppConnector: DAppConnectorCtor,
  HederaChainId,
  HederaJsonRpcMethod,
  HederaSessionEvent,
} = require("@hashgraph/hedera-wallet-connect") as typeof import("@hashgraph/hedera-wallet-connect");

type WcSession = Awaited<ReturnType<DAppConnector["connect"]>>;

interface SessionState {
  topic: string | null;
  accountId: string | null;
  pendingApproval: Promise<WcSession> | null;
  currentUri: string | null;
}

const sessions = new Map<string, SessionState>();
let connector: DAppConnector | null = null;
let freezeClient: Client | null = null;

function getOrCreate(sid: string): SessionState {
  let state = sessions.get(sid);
  if (!state) {
    state = { topic: null, accountId: null, pendingApproval: null, currentUri: null };
    sessions.set(sid, state);
  }
  return state;
}

function getFreezeClient(): Client {
  if (!freezeClient) {
    freezeClient = Client.forTestnet();
  }
  return freezeClient;
}

function requireConnector(): DAppConnector {
  if (!connector) {
    throw new Error("Wallet not initialized");
  }
  return connector;
}

export function getCurrentUri(sid: string): string | null {
  return sessions.get(sid)?.currentUri ?? null;
}

export function getSessionStatus(sid: string): {
  connected: boolean;
  accountId: string | null;
} {
  const state = sessions.get(sid);
  return { connected: !!state?.topic, accountId: state?.accountId ?? null };
}

export async function initWallet(): Promise<void> {
  if (connector) {
    return;
  }
  const created = new DAppConnectorCtor(
    config.metadata,
    LedgerId.TESTNET,
    config.projectId,
    Object.values(HederaJsonRpcMethod),
    [HederaSessionEvent.ChainChanged, HederaSessionEvent.AccountsChanged],
    [HederaChainId.Testnet],
  );
  await created.init();
  connector = created;
}

export async function startAuthorization(sid: string): Promise<string> {
  const c = requireConnector();
  const state = getOrCreate(sid);

  if (state.topic) {
    try {
      await c.disconnect(state.topic);
    } catch {
      // stale topic; nothing to disconnect
    }
    state.topic = null;
    state.accountId = null;
    state.currentUri = null;
  }

  return new Promise<string>((resolveUri, rejectUri) => {
    const approval = c.connect((uri) => {
      state.currentUri = uri;
      resolveUri(uri);
    });
    state.pendingApproval = approval;
    approval.catch(rejectUri);
  });
}

export async function awaitAuthorization(
  sid: string,
  timeoutMs = 120_000,
): Promise<{ accountId: string; network: string }> {
  const state = getOrCreate(sid);
  if (!state.pendingApproval) {
    throw new Error("No pending authorization. Call authorize_start first.");
  }
  const approval = state.pendingApproval;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(new Error("Authorization timed out. Call authorize_start again.")),
      timeoutMs,
    );
  });

  try {
    const approved = await Promise.race([approval, timeout]);
    const caip = approved.namespaces.hedera?.accounts[0];
    if (!caip) {
      throw new Error("Approved session has no Hedera account");
    }
    const accountId = caip.split(":").pop();
    if (!accountId) {
      throw new Error("Could not parse account id from session");
    }
    state.topic = approved.topic;
    state.accountId = accountId;
    state.currentUri = null;
    // step-0 verification: confirm signer routing key (.topic) matches the session.
    console.error(
      `[wallet] sid=${sid} session topic=${approved.topic} signers=`,
      requireConnector().signers.map((s) => ({
        topic: s.topic,
        account: s.getAccountId().toString(),
      })),
    );
    return { accountId, network: config.network };
  } finally {
    clearTimeout(timer);
    state.pendingApproval = null;
  }
}

export function getConnectedAccount(sid: string): AccountId {
  const state = sessions.get(sid);
  if (!state?.topic || !state.accountId) {
    throw new Error(
      "Not authorized. Run authorize_start and authorize_await first.",
    );
  }
  return AccountId.fromString(state.accountId);
}

export async function signAndExecute(
  sid: string,
  tx: TransferTransaction,
): Promise<{ transactionId: string }> {
  const c = requireConnector();
  const state = sessions.get(sid);
  if (!state?.topic) {
    throw new Error(
      "Not authorized. Run authorize_start and authorize_await first.",
    );
  }
  const signer = c.signers.find((s) => s.topic === state.topic);
  if (!signer) {
    throw new Error("No signer for this session. Re-authorize.");
  }
  // freezeWith supplies node account IDs (the signer's populateTransaction does not);
  // signing and broadcast still happen in HashPack via executeWithSigner.
  const frozen = tx
    .setTransactionId(TransactionId.generate(signer.getAccountId()))
    .freezeWith(getFreezeClient());
  const response = await frozen.executeWithSigner(signer);
  return { transactionId: response.transactionId.toString() };
}
