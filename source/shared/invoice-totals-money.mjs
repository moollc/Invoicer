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

// "Show cents" display setting (Settings > Default Invoice Settings). On by
// default. It only changes how amounts are shown, never the stored values.
let showCentsPref = true;

/** Set the Show cents preference (the app calls this on load and on toggle). */
export function setShowCents(on) { showCentsPref = on !== false; }
export function getShowCents() { return showCentsPref; }

function amountTexts(d) {
  const out = [];
  (Array.isArray(d.lineItems) ? d.lineItems : []).forEach(item => {
    (Array.isArray(item && item.costs) ? item.costs : []).forEach(c => out.push(c));
  });
  (Array.isArray(d.payments) ? d.payments : []).forEach(p => out.push(p && p.amount));
  out.push(d.projectTotal, d.totalAmount);
  return out.filter(v => v != null && String(v).trim() !== '');
}

/**
 * Decimals for every amount on the invoice (line costs, project total,
 * payments, amount due): 2 with Show cents on (the default), 0 with it off.
 * Real cents anywhere on the invoice always force 2, so an amount is never
 * rounded on the page. opts.showCents overrides the saved preference.
 */
export function totalsDecimals(data, opts = {}) {
  const d = data || {};
  const show = opts.showCents === undefined ? showCentsPref : opts.showCents !== false;
  if (amountTexts(d).some(v => hasCents(parseMoneyNum(v)))) return 2;
  return show ? 2 : 0;
}

/** Number only, with the invoice's decimals: 65000 -> "65,000.00" (or "65,000"). */
export function formatTotalsNumber(amount, data, opts) {
  const dec = totalsDecimals(data, opts);
  return Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

/** Prefix + number, the way every amount on the invoice is shown. */
export function formatTotalsAmount(amount, data, opts) {
  const prefix = amountPrefixFor(data);
  const num = formatTotalsNumber(amount, data, opts);
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

// A plain amount as typed or stored: optional currency code or symbol, then
// a number ("55500", "55,500.00", "JMD 55500", "$1,200.5", "-2500").
const PLAIN_AMOUNT = /^\s*(-|\u2212)?\s*(?:[A-Z]{3}\s*|[A-Z]{0,3}\$|[€£¥])?\s*(-|\u2212)?\s*(\d[\d,]*(?:\.\d+)?|\.\d+)\s*$/;

/**
 * Display text for one amount on the invoice (a line cost or the amount
 * due), with the same prefix and decimals as the totals block:
 * "55500" -> "JMD 55,500.00". Text that is not a plain amount ("TBC",
 * "Included", "2 x 500") is returned unchanged. Negatives use a real minus.
 */
export function formatInvoiceAmount(value, data, opts) {
  const raw = String(value == null ? '' : value);
  const m = raw.match(PLAIN_AMOUNT);
  if (!m) return raw.trim();
  const n = parseFloat(m[3].replace(/,/g, ''));
  if (!isFinite(n)) return raw.trim();
  const neg = !!(m[1] || m[2]) && n !== 0;
  return (neg ? '\u2212' : '') + formatTotalsAmount(n, data, opts);
}
