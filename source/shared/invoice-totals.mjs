/**
 * Pure invoice total sync + verification (no DOM).
 * Loaded in the browser via boot/invoice-totals.js; tested with node --test.
 */

export function parseMoneyNum(s) {
  return parseFloat(String(s || '').replace(/[^0-9.-]/g, '')) || 0;
}

export function sumLineItemsTotal(data) {
  return (data.lineItems || []).reduce((sum, item) => {
    const costs = Array.isArray(item.costs) ? item.costs : [];
    return sum + costs.reduce((s, c) => s + parseMoneyNum(c), 0);
  }, 0);
}

export function formatTotalAmountDisplay(amount, data) {
  const existing = String(data.totalAmount || '');
  const prefixMatch = existing.match(/^([^\d.\-]+)/);
  const prefix = prefixMatch ? prefixMatch[1].trim() : (data.currency || '$');
  const num = amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (prefix.length <= 4 && /^[A-Z]+$/.test(prefix)) return `${prefix} ${num}`;
  return `${prefix}${num}`;
}

export function syncTotalsFromLineItems(data) {
  const lineSum = sumLineItemsTotal(data);
  if (lineSum <= 0) return data;

  const storedPt = parseMoneyNum(data.projectTotal);
  const storedTa = parseMoneyNum(data.totalAmount);
  const paymentsSum = (Array.isArray(data.payments) ? data.payments : [])
    .reduce((s, p) => s + parseMoneyNum(p.amount), 0);

  if (storedPt === 0 || Math.abs(storedPt - lineSum) > 0.01) {
    data.projectTotal = lineSum.toLocaleString('en-US');
  }

  if (paymentsSum > 0) {
    const expectedDue = Math.max(0, lineSum - paymentsSum);
    if (storedTa === 0 || Math.abs(storedTa - expectedDue) > 0.01) {
      data.totalAmount = formatTotalAmountDisplay(expectedDue, data);
    }
  } else if (storedTa === 0) {
    data.totalAmount = formatTotalAmountDisplay(lineSum, data);
  }
  return data;
}

/** Expected amount due after sync (deposit/payment aware). */
export function expectedAmountDue(data) {
  const lineSum = sumLineItemsTotal(data);
  if (lineSum <= 0) return 0;
  const paymentsSum = (Array.isArray(data.payments) ? data.payments : [])
    .reduce((s, p) => s + parseMoneyNum(p.amount), 0);
  if (paymentsSum > 0) return Math.max(0, lineSum - paymentsSum);
  const storedTa = parseMoneyNum(data.totalAmount);
  return storedTa > 0 ? storedTa : lineSum;
}

/** Verify gate: totals match line items after sync. */
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

  if (Math.abs(pt - lineSum) > 0.01) {
    errors.push(`projectTotal ${pt} !== lineSum ${lineSum}`);
  }
  if (Math.abs(ta - due) > 0.01) {
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

/** Snapshot safe for archive / ledger (healed copy). */
export function prepareInvoiceForArchive(data) {
  return syncTotalsFromLineItems(JSON.parse(JSON.stringify(data)));
}