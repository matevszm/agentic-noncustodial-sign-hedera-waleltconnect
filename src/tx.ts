import { AccountId, Hbar, TransferTransaction } from "@hiero-ledger/sdk";

export function parseAccountId(value: string): AccountId {
  return AccountId.fromString(value);
}

export function parseHbar(amount: number): Hbar {
  return new Hbar(amount);
}

export function buildHbarTransfer(
  from: AccountId,
  to: AccountId,
  amount: Hbar,
): TransferTransaction {
  return new TransferTransaction()
    .addHbarTransfer(from, amount.negated())
    .addHbarTransfer(to, amount);
}
