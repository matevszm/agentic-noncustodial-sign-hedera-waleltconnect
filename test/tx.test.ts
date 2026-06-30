import assert from "node:assert/strict";
import { test } from "node:test";
import { AccountId, Hbar } from "@hiero-ledger/sdk";
import { buildHbarTransfer } from "../src/tx.js";

test("buildHbarTransfer debits sender, credits recipient, sums to zero", () => {
  const from = AccountId.fromString("0.0.1001");
  const to = AccountId.fromString("0.0.2002");

  const tx = buildHbarTransfer(from, to, new Hbar(5));
  const transfers = tx.hbarTransfers;

  assert.equal(transfers.size, 2);

  const debit = transfers.get(from);
  const credit = transfers.get(to);
  assert.ok(debit, "sender transfer missing");
  assert.ok(credit, "recipient transfer missing");

  assert.equal(debit.toTinybars().toString(), new Hbar(-5).toTinybars().toString());
  assert.equal(credit.toTinybars().toString(), new Hbar(5).toTinybars().toString());

  const sum = debit.toTinybars().add(credit.toTinybars());
  assert.equal(sum.toString(), "0");
});
