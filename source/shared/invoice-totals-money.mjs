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

const hasCents = n => Math.abs(Math.round(n * 100) % 100) > 0;

/**
 * Decimals setting for the totals block (project total, payments, amount
 * due): 0 or 2. It follows how the amount due is shown (pass healed data):
 * "JMD 55,000" means decimals off, "JMD 55,000.00" (the default) means on.
 * A blank or zero amount due keeps the default. Real cents anywhere in the
 * block always force 2 so an amount is never rounded on the invoice.
 */
export function totalsDecimals(data) {
  const d = data || {};
  const amounts = [sumLineItemsTotal(d), ...(Array.isArray(d.payments) ? d.payments : []).map(p => parseMoneyNum(p && p.amount))];
  if (amounts.some(hasCents)) return 2;
  const shown = String(d.totalAmount || '').trim();
  if (parseMoneyNum(shown) !== 0 && /\d/.test(shown) && !/\.\d/.test(shown)) return 0;
  return 2;
}

/** Number only, with the block's decimals: 65000 -> "65,000.00" (or "65,000"). */
export function formatTotalsNumber(amount, data) {
  const dec = totalsDecimals(data);
  return Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

/** Prefix + number, the way every amount in the totals block is shown. */
export function formatTotalsAmount(amount, data) {
  const prefix = amountPrefixFor(data);
  const num = formatTotalsNumber(amount, data);
  if (prefix.length <= 4 && /^[A-Z]+$/.test(prefix)) return `${prefix} ${num}`;
  return `${prefix}${num}`;
}

/**
 * Amount due written by the totals heal (always 2 decimals, so a template
 * placeholder like "$2,500" never switches decimals off). A total due the
 * user wrote without cents is left alone while it is right, and the rest of
 * the block follows it through totalsDecimals.
 */
export function formatTotalAmountDisplay(amount, data) {
  const prefix = amountPrefixFor(data);
  const num = amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (prefix.length <= 4 && /^[A-Z]+$/.test(prefix)) return `${prefix} ${num}`;
  return `${prefix}${num}`;
}
