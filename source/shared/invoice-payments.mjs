/**
 * Payments received against an invoice (no DOM). Reuses the invoice's
 * existing `payments` array: [{ label, amount, date?, ref? }].
 *
 *   Balance due = total - every payment row, never below 0.
 *
 * A payment row with a date is money received against THIS invoice (it goes
 * to the ledger's Amount Paid / Paid Date columns). A row without a date is
 * the older style: a deposit or credit already taken off before the invoice
 * was issued, so the ledger's Amount Due is the total less those rows only.
 * That keeps Amount Due meaning "what this invoice billed" for income, and
 * Amount Due - Amount Paid is what is still owed.
 */

import { parseMoneyNum, sumLineItemsTotal, formatTotalsAmount } from './invoice-totals-money.mjs';
import { parseInvoiceDate, formatLedgerDate } from './invoice-date.mjs';

const EPS = 0.005;
const round2 = n => Math.round(n * 100) / 100;

function list(data) {
  return (Array.isArray(data && data.payments) ? data.payments : []).filter(p => p && typeof p === 'object');
}

/** True when the row is a dated payment received against this invoice. */
export function isReceivedPayment(p) {
  return !!(p && parseInvoiceDate(p.date) && parseMoneyNum(p.amount) > 0);
}

/** Explicit amount-due override, or null. */
function overrideOf(data) {
  const raw = data && data.amountDueOverride;
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  return parseMoneyNum(raw);
}

/**
 * Everything the totals block and the ledger need about payments.
 *   total     line-item sum (Project Total)
 *   paid      every payment row
 *   received  dated rows (received against this invoice)
 *   deducted  undated rows (deposit / credit taken off up front)
 *   balance   what is still owed, clamped at 0
 *   billed    the ledger's Amount Due (total less undated rows, or the override)
 *   status    'none' | 'partial' | 'paid'
 */
export function paymentSummary(data) {
  const total = round2(sumLineItemsTotal(data || {}));
  let received = 0, deducted = 0;
  for (const p of list(data)) {
    const amt = parseMoneyNum(p.amount);
    if (!amt) continue;
    if (isReceivedPayment(p)) received += amt; else deducted += amt;
  }
  received = round2(received); deducted = round2(deducted);
  const paid = round2(received + deducted);
  const override = overrideOf(data);
  let balance, billed;
  if (total <= 0) { balance = 0; billed = 0; }
  else if (override !== null) { billed = round2(override); balance = round2(Math.max(0, override - received)); }
  else { billed = round2(Math.max(0, total - deducted)); balance = round2(Math.max(0, total - paid)); }
  const status = total > 0 && paid > 0 ? (balance <= EPS ? 'paid' : 'partial') : 'none';
  const dates = list(data).filter(isReceivedPayment).map(p => parseInvoiceDate(p.date));
  dates.sort((a, b) => (a.y - b.y) || (a.m - b.m) || (a.d - b.d));
  const last = dates[dates.length - 1];
  return {
    total, paid, received, deducted, balance, billed, status,
    overpaid: round2(Math.max(0, paid - total)),
    lastPaidDate: last ? `${last.m}/${last.d}/${last.y}` : '',
  };
}

/** Totals-block label for one payment row: "Payment received 10/21/2026". */
export function paymentRowLabel(p) {
  const base = String((p && p.label) || '').trim() || (p && p.date ? 'Payment received' : 'Payment');
  const d = parseInvoiceDate(p && p.date);
  if (!d) return base;
  const md = `${d.m}/${d.d}/${d.y}`;
  return base.includes(md) ? base : `${base} ${md}`;
}

/** Money as ledger text: "JMD 100,000" (plain numbers in the sheet read as USD). */
export function ledgerMoneyText(amount, currency) {
  const cur = String(currency || '').trim().toUpperCase();
  const num = Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return cur ? `${cur} ${num}` : num;
}

/**
 * A payment row for whatever is still owed, or null when nothing is owed
 * (so calling it twice never adds a second row). date is any readable date;
 * it is stored month first (M/D/YYYY).
 */
export function fullPaymentRow(data, { date, ref = '', label = 'Payment received' } = {}) {
  const { balance } = paymentSummary(data);
  if (!(balance > EPS)) return null;
  const row = {
    label,
    amount: balance.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
    date: formatLedgerDate(date || new Date()),
  };
  if (ref) row.ref = String(ref);
  return row;
}

/** Ledger fields for the payments on an invoice: Amount Paid text and last Paid Date. */
export function ledgerPaymentFields(data) {
  const s = paymentSummary(data);
  return {
    amountPaid: s.received > 0 ? ledgerMoneyText(s.received, data && data.currency) : '',
    paidDate: s.received > 0 ? s.lastPaidDate : '',
  };
}

/** Display amount for a payment row with the invoice's prefix and decimals. */
export function formatPaymentAmount(p, data) {
  return formatTotalsAmount(Math.abs(parseMoneyNum(p && p.amount)), data);
}
