/**
 * Pure money helpers for invoice totals (no DOM, no healing policy).
 * Parsing, summing, and display formatting only.
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

export function sumPayments(data) {
  return (Array.isArray(data.payments) ? data.payments : [])
    .reduce((s, p) => s + parseMoneyNum(p && p.amount), 0);
}

export function formatTotalAmountDisplay(amount, data) {
  const existing = String(data.totalAmount || '');
  const prefixMatch = existing.match(/^([^\d.\-]+)/);
  const prefix = prefixMatch ? prefixMatch[1].trim() : (data.currency || '$');
  const num = amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (prefix.length <= 4 && /^[A-Z]+$/.test(prefix)) return `${prefix} ${num}`;
  return `${prefix}${num}`;
}
