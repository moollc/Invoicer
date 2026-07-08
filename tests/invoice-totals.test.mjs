import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertTotalsConsistent,
  parseMoneyNum,
  prepareInvoiceForArchive,
  sumLineItemsTotal,
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

  syncTotalsFromLineItems(inv);
  assert.equal(parseMoneyNum(inv.projectTotal), 50000);
  assert.equal(parseMoneyNum(inv.totalAmount), 50000);

  const gate = assertTotalsConsistent(inv);
  assert.equal(gate.ok, true);
  assert.equal(gate.lineSum, 50000);
});

test('deposit invoice keeps partial due, fixes project total only', () => {
  const inv = loadFixture('deposit-partial-due.json');
  syncTotalsFromLineItems(inv);
  assert.equal(parseMoneyNum(inv.projectTotal), 100000);
  assert.equal(parseMoneyNum(inv.totalAmount), 50000);

  const gate = assertTotalsConsistent(inv);
  assert.equal(gate.ok, true);
  assert.equal(gate.expectedDue, 50000);
});

test('payments reduce amount due', () => {
  const inv = loadFixture('with-payments.json');
  syncTotalsFromLineItems(inv);
  assert.equal(parseMoneyNum(inv.projectTotal), 100000);
  assert.equal(parseMoneyNum(inv.totalAmount), 70000);

  const gate = assertTotalsConsistent(inv);
  assert.equal(gate.ok, true);
  assert.equal(gate.expectedDue, 70000);
});

test('prepareInvoiceForArchive does not mutate source', () => {
  const inv = loadFixture('stale-zero-totals.json');
  const archived = prepareInvoiceForArchive(inv);
  assert.equal(parseMoneyNum(inv.projectTotal), 0);
  assert.equal(parseMoneyNum(archived.projectTotal), 50000);
});