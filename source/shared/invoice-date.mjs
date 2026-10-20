/**
 * One place that reads and writes invoice and ledger dates (no DOM).
 * Loaded in the browser through boot/invoice-date.js as window.InvoiceDate;
 * tested with node --test.
 *
 * Month comes first everywhere (US order):
 *   ledger / sheet   M/D/YYYY        9/1/2026
 *   invoice display  MM / DD / YYYY  09 / 01 / 2026
 *
 * Older builds wrote the invoice date day first ("01 / 09 / 2026" for
 * Sept 1), so a value that is only valid day first (13 / 10 / 2026) is read
 * day first, and an ambiguous one (01 / 09 / 2026) is read day first only
 * when the receipt number (YYMMDD + letter) says so. Everything else is
 * month first.
 */

const pad2 = n => String(n).padStart(2, '0');

function daysIn(y, m) { return new Date(y, m, 0).getDate(); }

function valid(y, m, d) {
  return Number.isInteger(y) && Number.isInteger(m) && Number.isInteger(d)
    && y >= 1900 && y <= 9999 && m >= 1 && m <= 12 && d >= 1 && d <= daysIn(y, m);
}

function fromDate(dt) {
  if (!(dt instanceof Date) || isNaN(dt.valueOf())) return null;
  return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
}

/** Date a receipt number was issued on: "260901A" -> { y: 2026, m: 9, d: 1 }. */
export function receiptDateHint(receipt) {
  const m = String(receipt || '').trim().match(/(\d{2})(\d{2})(\d{2})[A-Z]+\d*$/i);
  if (!m) return null;
  const y = 2000 + Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  return valid(y, mo, d) ? { y, m: mo, d } : null;
}

const same = (a, b) => !!a && !!b && a.y === b.y && a.m === b.m && a.d === b.d;

/**
 * Read a date written any way the app or the sheet has written one.
 * Returns { y, m, d } or null. opts.receipt breaks ties for old day-first
 * values (see the top of this file).
 */
export function parseInvoiceDate(value, opts = {}) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return fromDate(value);
  if (typeof value === 'object' && 'y' in value) return valid(value.y, value.m, value.d) ? { y: value.y, m: value.m, d: value.d } : null;
  const s = String(value).trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (m) {
    const y = +m[1], mo = +m[2], d = +m[3];
    return valid(y, mo, d) ? { y, m: mo, d } : null;
  }
  m = s.match(/^(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{2}|\d{4})$/);
  if (m) {
    const a = +m[1], b = +m[2];
    let y = +m[3];
    if (m[3].length === 2) y += 2000;
    const monthFirst = valid(y, a, b) ? { y, m: a, d: b } : null;
    const dayFirst = valid(y, b, a) ? { y, m: b, d: a } : null;
    if (monthFirst && !dayFirst) return monthFirst;
    if (dayFirst && !monthFirst) return dayFirst;
    if (!monthFirst) return null;
    const hint = receiptDateHint(opts.receipt);
    if (hint && same(hint, dayFirst) && !same(hint, monthFirst)) return dayFirst;
    return monthFirst;
  }
  // Written-out dates ("Oct 20, 2026", "20 October 2026"). Never digits-only.
  if (/[a-z]/i.test(s)) return fromDate(new Date(s));
  return null;
}

/** Local Date at noon (safe from DST edges), or null. */
export function toDate(value, opts) {
  const p = parseInvoiceDate(value, opts);
  return p ? new Date(p.y, p.m - 1, p.d, 12, 0, 0) : null;
}

/** Ledger / sheet form: M/D/YYYY. Unreadable input is returned trimmed. */
export function formatLedgerDate(value, opts) {
  const p = parseInvoiceDate(value, opts);
  if (!p) return value == null ? value : String(value).trim();
  return `${p.m}/${p.d}/${p.y}`;
}

/** Invoice display form: MM / DD / YYYY. Unreadable input is returned as is. */
export function formatInvoiceDate(value, opts) {
  const p = parseInvoiceDate(value, opts);
  if (!p) return value == null ? '' : String(value);
  return `${pad2(p.m)} / ${pad2(p.d)} / ${p.y}`;
}

/** YYYY-MM-DD for <input type="date">, or '' when unreadable. */
export function toIsoDate(value, opts) {
  const p = parseInvoiceDate(value, opts);
  return p ? `${p.y}-${pad2(p.m)}-${pad2(p.d)}` : '';
}

/** Days from `from` to `to` (both dates, whole days, to - from). */
export function daysBetween(from, to) {
  const a = toDate(from), b = toDate(to);
  if (!a || !b) return NaN;
  return Math.round((b - a) / 86400000);
}

/** Today in invoice display form, from an injectable clock. */
export function todayInvoiceDate(now = new Date()) {
  return formatInvoiceDate(now);
}
