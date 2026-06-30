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

let connector: DAppConnector | null = null;
let session: WcSession | null = null;
let pendingApproval: Promise<WcSession> | null = null;
let connectedAccountId: string | null = null;
let currentUri: string | null = null;
let freezeClient: Client | null = null;

export function getCurrentUri(): string | null {
  return currentUri;
}

export function getSessionStatus(): {
  connected: boolean;
  accountId: string | null;
} {
  return { connected: session !== null, accountId: connectedAccountId };
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

export function startAuthorization(): Promise<string> {
  const c = requireConnector();
  return new Promise<string>((resolveUri, rejectUri) => {
    const approval = c.connect((uri) => {
      currentUri = uri;
      resolveUri(uri);
    });
    pendingApproval = approval;
    approval.catch(rejectUri);
  });
}

export async function awaitAuthorization(
  timeoutMs = 120_000,
): Promise<{ accountId: string; network: string }> {
  if (!pendingApproval) {
    throw new Error("No pending authorization. Call authorize_start first.");
  }
  const approval = pendingApproval;
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
    session = approved;
    connectedAccountId = accountId;
    currentUri = null;
    return { accountId, network: config.network };
  } finally {
    clearTimeout(timer);
    pendingApproval = null;
  }
}

export function getConnectedAccount(): AccountId {
  if (!session || !connectedAccountId) {
    throw new Error(
      "Not authorized. Run authorize_start and authorize_await first.",
    );
  }
  return AccountId.fromString(connectedAccountId);
}

export async function signAndExecute(
  tx: TransferTransaction,
): Promise<{ transactionId: string }> {
  const c = requireConnector();
  if (!session || !connectedAccountId) {
    throw new Error(
      "Not authorized. Run authorize_start and authorize_await first.",
    );
  }
  const signer = c.signers.find(
    (s) => s.getAccountId().toString() === connectedAccountId,
  );
  if (!signer) {
    throw new Error("No signer for the connected account. Re-authorize.");
  }
  // freezeWith supplies node account IDs (the signer's populateTransaction does not);
  // signing and broadcast still happen in HashPack via executeWithSigner.
  const frozen = tx
    .setTransactionId(TransactionId.generate(signer.getAccountId()))
    .freezeWith(getFreezeClient());
  const response = await frozen.executeWithSigner(signer);
  return { transactionId: response.transactionId.toString() };
}
