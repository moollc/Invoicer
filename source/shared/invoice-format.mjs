/**
 * Display helpers for the invoice (no DOM). Loaded in the browser through
 * boot/invoice-format.js as window.InvoiceFormat; tested with node --test.
 */

const EMAIL_RE = /\S+@\S+\.\S+/;
// Phone-ish: digits with spaces, dashes, dots, parens, +, "ext"; 7+ digits.
function looksLikePhone(s) {
  const t = String(s || '').trim();
  if (!t || t.includes('@')) return false;
  if (!/^[+\d\s().\-\/]*(?:(?:ext|x)\.?\s*\d+)?$/i.test(t)) return false;
  return (t.match(/\d/g) || []).length >= 7;
}

/** Bill-to block text: address lines, then email, then phone, one per line. */
export function formatPartySub(party) {
  const p = party || {};
  return [p.address, p.email, p.phone]
    .map(v => String(v || '').replace(/\r\n?/g, '\n').trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * Parse the Bill-to block back into { address, email, phone }.
 * Multi-line: trailing email / phone lines are picked off the end, the rest
 * (with its line breaks) is the address. Old single-line "a · e · p" text is
 * still understood.
 */
export function parsePartySub(text) {
  const raw = String(text || '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ');
  let lines = raw.split('\n').map(s => s.trim()).filter(Boolean);
  if (lines.length === 1 && lines[0].includes(' · ')) {
    const parts = lines[0].split(' · ').map(s => s.trim());
    // Old format was always address · email · phone; keep positions but let
    // shape decide when a part is clearly an email/phone.
    lines = parts.filter(Boolean);
  }
  let email = '';
  let phone = '';
  // A line that is just an email / just a phone number, anywhere in the
  // block (people add "Attn:" lines after them); the rest is the address.
  const isEmailLine = l => EMAIL_RE.test(l) && l.split(/\s+/).length === 1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!email && isEmailLine(lines[i])) { email = lines[i]; lines.splice(i, 1); }
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!phone && looksLikePhone(lines[i])) { phone = lines[i]; lines.splice(i, 1); }
  }
  return { address: lines.join('\n'), email, phone };
}

const SYMBOLS = { USD: '$', JMD: 'J$', EUR: '€', GBP: '£', CAD: 'CA$', AUD: 'A$', TTD: 'TT$' };

/** "15000" -> "15,000"; "1500.5" -> "1,500.50"; leaves non-numeric text alone. */
export function formatCostCell(value) {
  const s = String(value == null ? '' : value).trim();
  const m = s.match(/^([^\d\-.]*)(-?[\d,]*\.?\d+)(.*)$/);
  if (!m) return s;
  const [, pre, numStr, post] = m;
  const n = parseFloat(numStr.replace(/,/g, ''));
  if (!isFinite(n)) return s;
  const decimals = numStr.includes('.') ? 2 : 0;
  const body = n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: 2 });
  return `${pre}${body}${post}`;
}

/** Prefix for an amount in this currency: the 3-letter code (JMD 60,000.00). */
export function currencyPrefix(currency) {
  const c = String(currency || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? c : '$';
}

export { SYMBOLS as CURRENCY_SYMBOLS };
