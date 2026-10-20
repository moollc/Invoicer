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

import { formatTotalsAmount, formatTotalsNumber, totalsDecimals, formatInvoiceAmount, setShowCents, getShowCents } from '../source/shared/invoice-totals.mjs';

test('every amount follows the Show cents setting (on by default)', () => {
  const base = { currency: 'JMD', lineItems: [{ costs: ['65000'] }], payments: [{ label: 'Deposit', amount: '10000' }], totalAmount: 'JMD 55,000.00' };
  assert.equal(getShowCents(), true, 'default on');
  assert.equal(totalsDecimals(base), 2);
  assert.equal(totalsDecimals(base, { showCents: false }), 0);
  assert.equal(formatTotalsNumber(65000, base), '65,000.00');
  assert.equal(formatTotalsNumber(65000, base, { showCents: false }), '65,000');
  assert.equal(formatTotalsAmount(10000, base), 'JMD 10,000.00');
  assert.equal(formatTotalsAmount(10000, base, { showCents: false }), 'JMD 10,000');
  // The saved preference is what the app sets; opts still override it.
  setShowCents(false);
  try {
    assert.equal(totalsDecimals(base), 0);
    assert.equal(totalsDecimals(base, { showCents: true }), 2);
    // How the amount due was typed no longer switches decimals.
    assert.equal(totalsDecimals({ ...base, totalAmount: 'JMD 55,000.00' }), 0);
  } finally { setShowCents(true); }
  assert.equal(totalsDecimals({ ...base, totalAmount: 'JMD 55,000' }), 2);
});

test('real cents are never hidden, whatever the setting', () => {
  const off = { showCents: false };
  const base = { currency: 'JMD', lineItems: [{ costs: ['65000'] }], payments: [], totalAmount: 'JMD 65,000.00' };
  assert.equal(totalsDecimals({ ...base, payments: [{ amount: '10000.50' }] }, off), 2);
  assert.equal(totalsDecimals({ ...base, lineItems: [{ costs: ['65000', '0.25'] }] }, off), 2);
  assert.equal(totalsDecimals({ ...base, lineItems: [{ costs: ['0.5', '0.5'] }] }, off), 2, 'cents that add up to a whole number still count');
  assert.equal(totalsDecimals({ ...base, totalAmount: 'JMD 64,999.99' }, off), 2);
  assert.equal(formatInvoiceAmount('2500.5', { ...base, lineItems: [{ costs: ['2500.5'] }] }, off), 'JMD 2,500.50');
});

test('line costs use the same prefix and decimals as the totals block', () => {
  const data = { currency: 'JMD', lineItems: [{ costs: ['55500'] }], payments: [], totalAmount: 'JMD 55,500.00' };
  assert.equal(formatInvoiceAmount('55500', data), 'JMD 55,500.00');
  assert.equal(formatInvoiceAmount('55,500.00', data), 'JMD 55,500.00');
  assert.equal(formatInvoiceAmount('JMD 55500', data), 'JMD 55,500.00');
  assert.equal(formatInvoiceAmount('55500', data, { showCents: false }), 'JMD 55,500');
  assert.equal(formatInvoiceAmount('JMD 55,500.00', data, { showCents: false }), 'JMD 55,500');
  assert.equal(formatInvoiceAmount('-2500', data), '\u2212JMD 2,500.00');
  assert.equal(formatInvoiceAmount('500', { currency: 'USD', totalAmount: '$500.00' }), '$500.00');
  // Not a plain amount: left as written.
  for (const t of ['TBC', 'Included', '2 x 500', '']) assert.equal(formatInvoiceAmount(t, data), t);
});

test('display decimals never change stored values', () => {
  const data = { currency: 'JMD', lineItems: [{ costs: ['55500'] }], payments: [{ amount: '1000' }], totalAmount: 'JMD 54,500.00', projectTotal: '55,500' };
  const before = JSON.stringify(data);
  formatInvoiceAmount('55500', data, { showCents: false });
  formatTotalsAmount(1000, data, { showCents: false });
  totalsDecimals(data, { showCents: false });
  assert.equal(JSON.stringify(data), before);
});

test('totals block uses the amount-due prefix for every row', () => {
  assert.equal(formatTotalsAmount(10000, { currency: 'JMD', totalAmount: '$55,000.00' }), 'JMD 10,000.00');
  assert.equal(formatTotalsAmount(100, { currency: 'USD', totalAmount: '$400.00' }), '$100.00');
});
