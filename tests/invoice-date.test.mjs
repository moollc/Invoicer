import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseInvoiceDate, formatLedgerDate, formatInvoiceDate, toIsoDate, toDate,
  receiptDateHint, daysBetween, todayInvoiceDate,
} from '../source/shared/invoice-date.mjs';

test('today is written month first on the invoice', () => {
  assert.equal(todayInvoiceDate(new Date(2026, 9, 20)), '10 / 20 / 2026');
  assert.equal(todayInvoiceDate(new Date(2026, 8, 1)), '09 / 01 / 2026');
});

test('ledger form is M/D/YYYY from every input shape', () => {
  assert.equal(formatLedgerDate('09 / 01 / 2026'), '9/1/2026');
  assert.equal(formatLedgerDate('10/05/2026'), '10/5/2026');
  assert.equal(formatLedgerDate('2026-09-01'), '9/1/2026');
  assert.equal(formatLedgerDate('9/1/2026'), '9/1/2026');
  assert.equal(formatLedgerDate(new Date(2026, 9, 20)), '10/20/2026');
  assert.equal(formatLedgerDate('Oct 20, 2026'), '10/20/2026');
});

test('invoice display form is MM / DD / YYYY', () => {
  assert.equal(formatInvoiceDate('9/1/2026'), '09 / 01 / 2026');
  assert.equal(formatInvoiceDate('2026-10-20'), '10 / 20 / 2026');
  assert.equal(formatInvoiceDate('2026-10-20T09:30:00-05:00'), '10 / 20 / 2026', 'calendar dateTime keeps its own day');
});

test('date picker round trip keeps the day', () => {
  assert.equal(toIsoDate('10 / 20 / 2026'), '2026-10-20');
  assert.equal(formatInvoiceDate(toIsoDate('03 / 04 / 2026')), '03 / 04 / 2026');
});

test('ambiguous dates are month first', () => {
  assert.deepEqual(parseInvoiceDate('03/04/2026'), { y: 2026, m: 3, d: 4 });
  assert.deepEqual(parseInvoiceDate('03/04/2026', { receipt: '' }), { y: 2026, m: 3, d: 4 });
});

test('legacy day-first values are read safely', () => {
  // Only valid day first: the old autoDate wrote 20 / 10 / 2026 for Oct 20.
  assert.equal(formatLedgerDate('20 / 10 / 2026'), '10/20/2026');
  assert.equal(formatLedgerDate('13/1/2026'), '1/13/2026');
  // Ambiguous, but the receipt number says Sept 1 (260901A was stored as 1/9/2026).
  assert.equal(formatLedgerDate('1/9/2026', { receipt: '260901A' }), '9/1/2026');
  assert.equal(formatInvoiceDate('01 / 09 / 2026', { receipt: '260901A' }), '09 / 01 / 2026');
  // The receipt agrees with month first: leave it alone.
  assert.equal(formatLedgerDate('6/11/2026', { receipt: '260611A' }), '6/11/2026');
  assert.equal(formatLedgerDate('10/05/2026', { receipt: '261005B' }), '10/5/2026');
  // A2-style corrections and custom prefixes still give a hint.
  assert.deepEqual(receiptDateHint('260610A2'), { y: 2026, m: 6, d: 10 });
  assert.deepEqual(receiptDateHint('INV-260901B'), { y: 2026, m: 9, d: 1 });
  // A receipt from another day never flips a date it does not match.
  assert.equal(formatLedgerDate('3/4/2026', { receipt: '261020A' }), '3/4/2026');
});

test('unreadable values are kept, never invented', () => {
  assert.equal(parseInvoiceDate(''), null);
  assert.equal(parseInvoiceDate('13/13/2026'), null);
  assert.equal(parseInvoiceDate('2/30/2026'), null);
  assert.equal(parseInvoiceDate('46266'), null);
  assert.equal(formatLedgerDate('TBC'), 'TBC');
  assert.equal(formatInvoiceDate('TBC'), 'TBC');
  assert.equal(toIsoDate('TBC'), '');
  assert.equal(toDate('TBC'), null);
});

test('two-digit years and day arithmetic', () => {
  assert.equal(formatLedgerDate('9/1/26'), '9/1/2026');
  assert.equal(daysBetween('9/1/2026', '10/1/2026'), 30);
  assert.equal(daysBetween('10/20/2026', new Date(2026, 9, 20, 23, 0)), 0);
});
