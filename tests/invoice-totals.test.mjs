import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertTotalsConsistent,
  expectedAmountDue,
  hasAmountDueOverride,
  parseMoneyNum,
  prepareInvoiceForArchive,
  sumLineItemsTotal,
  sumPayments,
  syncTotalsFromLineItems,
} from '../source/shared/invoice-totals.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, 'fixtures');

function loadFixture(name) {
  return JSON.parse(readFileSync(join(fixtures, name), 'utf8'));
}

test('stale zero totals heal from line items', () => {
  const inv = loadFixture('stale-zero-totals.json');
  assert.equal(sumLineItemsTotal(inv), 50000);
  assert.equal(parseMoneyNum(inv.projectTotal), 0);
  assert.equal(parseMoneyNum(inv.totalAmount), 0);

  syncTotalsFromLineItems(inv);
  assert.equal(parseMoneyNum(inv.projectTotal), 50000);
  assert.equal(parseMoneyNum(inv.totalAmount), 50000);

  const gate = assertTotalsConsistent(inv);
  assert.equal(gate.ok, true);
  assert.equal(gate.lineSum, 50000);
  assert.equal(gate.expectedDue, 50000);
});

test('deposit with explicit payments keeps partial due, fixes project total only', () => {
  const inv = loadFixture('deposit-partial-due.json');
  assert.equal(sumLineItemsTotal(inv), 100000);
  assert.equal(sumPayments(inv), 50000);

  syncTotalsFromLineItems(inv);
  assert.equal(parseMoneyNum(inv.projectTotal), 100000);
  assert.equal(parseMoneyNum(inv.totalAmount), 50000);

  const gate = assertTotalsConsistent(inv);
  assert.equal(gate.ok, true);
  assert.equal(gate.expectedDue, 50000);
});

test('stale due heals to line sum when no deposit intent', () => {
  const inv = loadFixture('stale-due.json');
  assert.equal(sumLineItemsTotal(inv), 100000);
  assert.equal(sumPayments(inv), 0);
  assert.equal(hasAmountDueOverride(inv), false);
  // A wrong-but-nonzero due must NOT be trusted as a deposit.
  assert.equal(parseMoneyNum(inv.totalAmount), 50000);
  assert.equal(expectedAmountDue(inv), 100000);

  syncTotalsFromLineItems(inv);
  assert.equal(parseMoneyNum(inv.projectTotal), 100000);
  assert.equal(parseMoneyNum(inv.totalAmount), 100000);

  const gate = assertTotalsConsistent(inv);
  assert.equal(gate.ok, true);
  assert.equal(gate.expectedDue, 100000);
  assert.equal(parseMoneyNum(gate.totalAmount), 100000);
});

test('stored amount-due override is honored as explicit intent', () => {
  const inv = loadFixture('amount-due-override.json');
  assert.equal(sumLineItemsTotal(inv), 100000);
  assert.equal(sumPayments(inv), 0);
  assert.equal(hasAmountDueOverride(inv), true);
  assert.equal(expectedAmountDue(inv), 50000);

  syncTotalsFromLineItems(inv);
  assert.equal(parseMoneyNum(inv.projectTotal), 100000);
  assert.equal(parseMoneyNum(inv.totalAmount), 50000);

  const gate = assertTotalsConsistent(inv);
  assert.equal(gate.ok, true);
  assert.equal(gate.expectedDue, 50000);
});

test('payments reduce amount due', () => {
  const inv = loadFixture('with-payments.json');
  assert.equal(sumPayments(inv), 30000);
  assert.equal(expectedAmountDue(inv), 70000);

  syncTotalsFromLineItems(inv);
  assert.equal(parseMoneyNum(inv.projectTotal), 100000);
  assert.equal(parseMoneyNum(inv.totalAmount), 70000);

  const gate = assertTotalsConsistent(inv);
  assert.equal(gate.ok, true);
  assert.equal(gate.expectedDue, 70000);
});

test('explicit intent detection fires only on real signals', () => {
  assert.equal(hasAmountDueOverride({}), false);
  assert.equal(hasAmountDueOverride({ amountDueOverride: '' }), false);
  assert.equal(hasAmountDueOverride({ amountDueOverride: '   ' }), false);
  assert.equal(hasAmountDueOverride({ amountDueOverride: '50000' }), true);
  assert.equal(hasAmountDueOverride({ amountDueOverride: '0' }), true);
});

test('prepareInvoiceForArchive does not mutate source', () => {
  const inv = loadFixture('stale-zero-totals.json');
  const archived = prepareInvoiceForArchive(inv);
  assert.equal(parseMoneyNum(inv.projectTotal), 0);
  assert.equal(parseMoneyNum(inv.totalAmount), 0);
  assert.equal(parseMoneyNum(archived.projectTotal), 50000);
  assert.equal(parseMoneyNum(archived.totalAmount), 50000);
});
