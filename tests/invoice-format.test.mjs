import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPartySub, parsePartySub, formatCostCell, currencyPrefix } from '../source/shared/invoice-format.mjs';

test('bill-to: address line breaks, email, phone each on their own line', () => {
  const p = { address: '1 Example St\nSample Town', email: 'billing@example.com', phone: '000-555-0101' };
  assert.equal(formatPartySub(p), '1 Example St\nSample Town\nbilling@example.com\n000-555-0101');
  assert.deepEqual(parsePartySub(formatPartySub(p)), p);
});

test('bill-to: missing email or phone', () => {
  assert.deepEqual(parsePartySub('2 Sample Ave\nTestville\n(000) 555-0199'), { address: '2 Sample Ave\nTestville', email: '', phone: '(000) 555-0199' });
  assert.deepEqual(parsePartySub('2 Sample Ave\nsomeone@example.org'), { address: '2 Sample Ave', email: 'someone@example.org', phone: '' });
  assert.deepEqual(parsePartySub(''), { address: '', email: '', phone: '' });
});

test('bill-to: old single-line "address · email · phone" still parses', () => {
  assert.deepEqual(parsePartySub('1 Example St · billing@example.com · 000 555 0101'), { address: '1 Example St', email: 'billing@example.com', phone: '000 555 0101' });
});

test('bill-to: a street number line is not mistaken for a phone', () => {
  assert.deepEqual(parsePartySub('Unit 4\n22 Example Rd'), { address: 'Unit 4\n22 Example Rd', email: '', phone: '' });
});

test('cost cells get thousands separators', () => {
  assert.equal(formatCostCell('15000'), '15,000');
  assert.equal(formatCostCell('1500.5'), '1,500.50');
  assert.equal(formatCostCell('15,000'), '15,000');
  assert.equal(formatCostCell('$2500'), '$2,500');
  assert.equal(formatCostCell('TBD'), 'TBD');
  assert.equal(formatCostCell('250'), '250');
});

test('currency prefix uses the code, not "$"', () => {
  assert.equal(currencyPrefix('JMD'), 'JMD');
  assert.equal(currencyPrefix('usd'), 'USD');
  assert.equal(currencyPrefix(''), '$');
});

test('bill-to: extra line typed after email/phone stays in the address', () => {
  assert.deepEqual(parsePartySub('1 Example St\nbilling@example.com\n000-555-0101\nAttn: Accounts'),
    { address: '1 Example St\nAttn: Accounts', email: 'billing@example.com', phone: '000-555-0101' });
});

import { formatTotalAmountDisplay, syncTotalsFromLineItems } from '../source/shared/invoice-totals.mjs';

test('amount due uses the invoice currency code (JMD, not $)', () => {
  assert.equal(formatTotalAmountDisplay(60000, { currency: 'JMD', totalAmount: '$2,500' }), 'JMD 60,000.00');
  assert.equal(formatTotalAmountDisplay(60000, { currency: 'USD', totalAmount: '$2,500' }), '$60,000.00');
  assert.equal(formatTotalAmountDisplay(60000, { currency: 'EUR', totalAmount: 'USD 1' }), 'EUR 60,000.00');
});

test('switching currency heals a stale "$" prefix even when the amount is right', () => {
  const d = { currency: 'JMD', totalAmount: '$15,000.00', projectTotal: '15,000', lineItems: [{ costs: ['15000'] }] };
  syncTotalsFromLineItems(d);
  assert.equal(d.totalAmount, 'JMD 15,000.00');
});
