/**
 * Invoice totals healing + verification policy (no DOM).
 *
 * Partial-due intent is EXPLICIT only:
 *   - `payments` (sum > 0) reduces the amount due, or
 *   - `amountDueOverride` stores the amount due outright.
 * A nonzero `totalAmount` alone is NOT treated as a deposit signal — a stale
 * amount due heals to the line sum exactly like projectTotal does.
 */

import {
  formatTotalAmountDisplay,
  parseMoneyNum,
  sumLineItemsTotal,
  sumPayments,
} from './invoice-totals-money.mjs';

const DRIFT_EPSILON = 0.01;

/** True only when an explicit amount-due override is stored. */
export function hasAmountDueOverride(data) {
  const raw = data.amountDueOverride;
  return raw !== undefined && raw !== null && String(raw).trim() !== '';
}

/** Derived amount due: explicit override > payments > full line sum. */
export function expectedAmountDue(data) {
  const lineSum = sumLineItemsTotal(data);
  if (lineSum <= 0) return 0;
  if (hasAmountDueOverride(data)) return parseMoneyNum(data.amountDueOverride);
  const paymentsSum = sumPayments(data);
  if (paymentsSum > 0) return Math.max(0, lineSum - paymentsSum);
  return lineSum;
}

/** In-place heal of projectTotal + totalAmount from line items. Mutates + returns data. */
export function syncTotalsFromLineItems(data) {
  const lineSum = sumLineItemsTotal(data);
  if (lineSum <= 0) return data;

  if (Math.abs(parseMoneyNum(data.projectTotal) - lineSum) > DRIFT_EPSILON) {
    data.projectTotal = lineSum.toLocaleString('en-US');
  }

  const due = expectedAmountDue(data);
  if (Math.abs(parseMoneyNum(data.totalAmount) - due) > DRIFT_EPSILON) {
    data.totalAmount = formatTotalAmountDisplay(due, data);
  }
  return data;
}

/** Verify gate: totals match line items after sync (non-mutating). */
export function assertTotalsConsistent(data) {
  const lineSum = sumLineItemsTotal(data);
  if (lineSum <= 0) {
    return { ok: true, skipped: true, lineSum, reason: 'no line-item costs' };
  }

  const healed = syncTotalsFromLineItems(JSON.parse(JSON.stringify(data)));
  const errors = [];
  const pt = parseMoneyNum(healed.projectTotal);
  const due = expectedAmountDue(healed);
  const ta = parseMoneyNum(healed.totalAmount);

  if (Math.abs(pt - lineSum) > DRIFT_EPSILON) {
    errors.push(`projectTotal ${pt} !== lineSum ${lineSum}`);
  }
  if (Math.abs(ta - due) > DRIFT_EPSILON) {
    errors.push(`totalAmount ${ta} !== expected due ${due}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    lineSum,
    projectTotal: healed.projectTotal,
    totalAmount: healed.totalAmount,
    expectedDue: due,
  };
}

/** Snapshot safe for archive / ledger (healed copy, source untouched). */
export function prepareInvoiceForArchive(data) {
  return syncTotalsFromLineItems(JSON.parse(JSON.stringify(data)));
}
