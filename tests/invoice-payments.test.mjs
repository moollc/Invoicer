import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  paymentSummary, paymentRowLabel, fullPaymentRow, ledgerPaymentFields, ledgerMoneyText,
} from '../source/shared/invoice-payments.mjs';
import { expectedAmountDue, syncTotalsFromLineItems } from '../source/shared/invoice-totals-sync.mjs';

const inv = (payments = [], extra = {}) => ({
  currency: 'JMD',
  lineItems: [{ service: 'Edit', costs: ['100,000'] }],
  projectTotal: '100,000',
  totalAmount: 'JMD 100,000.00',
  payments,
  ...extra,
});
const paid = { label: 'Payment received', amount: '100,000', date: '10/21/2026', ref: 'JMTROT102126710735' };

test('full payment: balance 0 and paid', () => {
  const s = paymentSummary(inv([paid]));
  assert.equal(s.balance, 0);
  assert.equal(s.status, 'paid');
  assert.equal(s.lastPaidDate, '10/21/2026');
  assert.equal(expectedAmountDue(inv([paid])), 0);
  assert.equal(syncTotalsFromLineItems(inv([paid])).totalAmount, 'JMD 0.00');
});

test('partial payment: balance is what is left', () => {
  const s = paymentSummary(inv([{ amount: '40,000', date: '10/21/2026' }]));
  assert.equal(s.balance, 60000);
  assert.equal(s.status, 'partial');
  assert.equal(syncTotalsFromLineItems(inv([{ amount: '40,000', date: '10/21/2026' }])).totalAmount, 'JMD 60,000.00');
});

test('no payments: balance is the full total', () => {
  const s = paymentSummary(inv());
  assert.equal(s.balance, 100000);
  assert.equal(s.status, 'none');
  assert.equal(s.billed, 100000);
});

test('overpayment: balance clamps at 0', () => {
  const s = paymentSummary(inv([{ amount: '120,000', date: '10/21/2026' }]));
  assert.equal(s.balance, 0);
  assert.equal(s.status, 'paid');
  assert.equal(s.overpaid, 20000);
  assert.equal(expectedAmountDue(inv([{ amount: '120,000', date: '10/21/2026' }])), 0);
});

test('undated rows are deposits taken off up front: billed drops, received does not', () => {
  const s = paymentSummary(inv([{ label: 'Deposit', amount: '25,000' }]));
  assert.equal(s.billed, 75000);
  assert.equal(s.received, 0);
  assert.equal(s.balance, 75000);
  const t = paymentSummary(inv([{ label: 'Deposit', amount: '25,000' }, { amount: '75,000', date: '11/1/2026' }]));
  assert.equal(t.billed, 75000);
  assert.equal(t.balance, 0);
  assert.equal(t.status, 'paid');
});

test('amount-due override: dated payments come off the override', () => {
  const s = paymentSummary(inv([{ amount: '10,000', date: '10/21/2026' }], { amountDueOverride: '50,000' }));
  assert.equal(s.billed, 50000);
  assert.equal(s.balance, 40000);
});

test('row label carries the date month first, once', () => {
  assert.equal(paymentRowLabel({ amount: '1', date: '2026-10-21' }), 'Payment received 10/21/2026');
  assert.equal(paymentRowLabel({ label: 'Paid 10/21/2026', amount: '1', date: '10/21/2026' }), 'Paid 10/21/2026');
  assert.equal(paymentRowLabel({ label: 'Deposit', amount: '1' }), 'Deposit');
});

test('full payment row: covers what is owed, idempotent', () => {
  const d = inv([{ amount: '40,000', date: '10/1/2026' }]);
  const row = fullPaymentRow(d, { date: '2026-10-21', ref: 'X1' });
  assert.deepEqual(row, { label: 'Payment received', amount: '60,000', date: '10/21/2026', ref: 'X1' });
  d.payments.push(row);
  assert.equal(fullPaymentRow(d, { date: '10/22/2026' }), null);
  assert.equal(paymentSummary(d).balance, 0);
});

test('ledger fields: amount as text with currency, last paid date', () => {
  assert.deepEqual(ledgerPaymentFields(inv([paid])), { amountPaid: 'JMD 100,000', paidDate: '10/21/2026' });
  assert.deepEqual(ledgerPaymentFields(inv([{ label: 'Deposit', amount: '25,000' }])), { amountPaid: '', paidDate: '' });
  assert.equal(ledgerMoneyText(40000.5, 'jmd'), 'JMD 40,000.5');
});
