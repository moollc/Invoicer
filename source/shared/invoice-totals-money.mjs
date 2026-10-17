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

/**
 * Prefix for the amount due. The invoice currency decides: a JMD invoice
 * shows "JMD 60,000.00", never "$60,000.00". A "$" is only kept for USD
 * (or when no currency is set), so existing USD invoices look the same.
 */
export function amountPrefixFor(data) {
  const existing = String((data && data.totalAmount) || '');
  const m = existing.match(/^([^\d.\-]+)/);
  const old = m ? m[1].trim() : '';
  const cur = String((data && data.currency) || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(cur)) return old || '$';
  if (old === cur) return cur;
  if (cur === 'USD' && (old === '$' || old === 'US$')) return old;
  return cur;
}

export function formatTotalAmountDisplay(amount, data) {
  const prefix = amountPrefixFor(data);
  const num = amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (prefix.length <= 4 && /^[A-Z]+$/.test(prefix)) return `${prefix} ${num}`;
  return `${prefix}${num}`;
}
