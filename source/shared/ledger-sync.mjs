/**
 * Ledger row rules (no DOM, no network). Loaded in the browser through
 * boot/ledger-sync.js as window.LedgerSync; tested with node --test.
 *
 * - One ledger row per receipt number. Saving an invoice whose receipt is
 *   already in the ledger updates that row (upsert); it never appends a twin.
 *   A2-style corrections have their own receipt numbers, so they stay rows
 *   of their own.
 * - Status is only changed by the user, except that an invoice with a
 *   deposit/payment and a balance still due is "Deposit".
 * - Deleting is explicit and leaves a tombstone so the next sheet sync
 *   removes the row there too instead of bringing it back.
 */

export const STATUS = {
  UNPAID: '⬜ Unpaid',
  DEPOSIT: '💰 Deposit',
  SENT: '📤 Sent',
  PAID: '✅ Paid',
  QUOTE: '📋 Quote',
};

export const SHEET_COLUMNS = ['receipt', 'date', 'client', 'service', 'projectTotal', 'amountDue', 'status', 'company', 'description', 'goalAllocations', 'taxRate'];

// Fields an invoice save owns. Everything else on a row (status set by the
// user, note, goal allocations, company) is kept as-is on update.
const INVOICE_FIELDS = ['date', 'client', 'service', 'description', 'projectTotal', 'amountDue', 'payPeriod', 'docType', 'taxRate'];

export function normReceipt(r) {
  return String(r == null ? '' : r).trim();
}

function money(s) {
  return parseFloat(String(s == null ? '' : s).replace(/[^0-9.-]/g, '')) || 0;
}

function paymentsSum(data) {
  return (Array.isArray(data && data.payments) ? data.payments : []).reduce((s, p) => s + money(p && p.amount), 0);
}

/**
 * Status for an invoice being saved.
 *   quote doc                     -> Quote
 *   user already set Paid / Sent  -> unchanged
 *   payments > 0 and balance > 0  -> Deposit
 *   user set Deposit              -> unchanged
 *   otherwise                     -> existing status, or Unpaid for a new row
 */
export function deriveLedgerStatus(data, existingStatus, { isQuote = false } = {}) {
  if (isQuote) return STATUS.QUOTE;
  if (existingStatus === STATUS.PAID || existingStatus === STATUS.SENT) return existingStatus;
  const paid = paymentsSum(data);
  const due = money(data && data.totalAmount);
  if (paid > 0 && due > 0) return STATUS.DEPOSIT;
  if (existingStatus && existingStatus !== STATUS.QUOTE) return existingStatus;
  return STATUS.UNPAID;
}

/**
 * Insert or update the row for incoming.receipt. Returns
 * { rows, action: 'insert' | 'update', index }. Does not mutate the input.
 * When the ledger already holds several rows with that receipt (left over
 * from the old append bug) only the first is updated; the others are left
 * for the user to delete.
 */
export function upsertLedgerRow(rows, incoming) {
  const list = Array.isArray(rows) ? rows.map(r => ({ ...r })) : [];
  const key = normReceipt(incoming.receipt);
  const index = list.findIndex(r => normReceipt(r.receipt) === key);
  if (index === -1) {
    list.push({ ...incoming, receipt: key });
    return { rows: list, action: 'insert', index: list.length - 1 };
  }
  const prev = list[index];
  const next = { ...prev };
  for (const f of INVOICE_FIELDS) if (incoming[f] !== undefined) next[f] = incoming[f];
  // A status the user set (Paid / Sent) is never overwritten by a re-save.
  const userSet = prev.status === STATUS.PAID || prev.status === STATUS.SENT;
  if (incoming.status !== undefined && !(userSet && incoming.status !== STATUS.QUOTE)) next.status = incoming.status;
  if (incoming._dirty !== undefined) next._dirty = incoming._dirty;
  next.receipt = key;
  list[index] = next;
  return { rows: list, action: 'update', index };
}

/** A row as the 11 Ledger sheet cells (A..K). */
export function rowToSheetValues(row) {
  return [
    row.receipt || '', row.date || '', row.client || '', row.service || '',
    row.projectTotal || '', row.amountDue || '', row.status || STATUS.UNPAID,
    row.company || '', row.description || '',
    row.goalAllocations ? JSON.stringify(row.goalAllocations) : '',
    parseFloat(row.taxRate) > 0 ? parseFloat(row.taxRate) : '',
  ];
}

export function sheetValuesToRow(v) {
  let goal = null;
  try { goal = JSON.parse(v[9] || 'null'); } catch (e) { goal = null; }
  return {
    receipt: normReceipt(v[0]),
    date: v[1] || '',
    client: v[2] || '',
    service: v[3] || '',
    projectTotal: v[4] || '',
    amountDue: v[5] || '',
    status: v[6] || STATUS.UNPAID,
    company: v[7] || '',
    description: v[8] || '',
    goalAllocations: goal,
    taxRate: parseFloat(v[10] || '0') || 0,
  };
}

/** Identity of one specific row, so a delete removes exactly that row. */
export function rowSignature(row) {
  return [normReceipt(row.receipt), row.client || '', row.service || '', row.amountDue || '', row.date || '']
    .map(s => String(s).trim().toLowerCase()).join('|');
}

export function makeTombstone(row, at = Date.now()) {
  return { receipt: normReceipt(row.receipt), sig: rowSignature(row), at };
}

/**
 * Which sheet rows (1-based sheet row numbers, header = 1) a tombstone
 * removes. Exact signature match first; if none matches exactly and the
 * receipt is unique in the sheet, that single row (the row was edited on
 * another device after this one deleted it would be lost otherwise, so only
 * when it is the only row with that receipt).
 * sheetRows: array of row objects in sheet order (row i -> sheet row i + 2).
 */
export function tombstoneTargets(sheetRows, tomb) {
  const same = [];
  sheetRows.forEach((r, i) => { if (normReceipt(r.receipt) === tomb.receipt) same.push(i); });
  if (!same.length) return [];
  const exact = same.filter(i => rowSignature(sheetRows[i]) === tomb.sig);
  if (exact.length) return [exact[exact.length - 1] + 2];
  if (same.length === 1) return [same[0] + 2];
  return [];
}

/**
 * Merge the sheet with local rows.
 *   - tombstoned rows are dropped (and reported in toDelete)
 *   - a local row marked _dirty wins over the sheet for its receipt and is
 *     reported in toPush (it is an edit the sheet has not got yet)
 *   - a clean local Paid stays Paid; a dirty row keeps the sheet status
 *     unless the user changed status on this device (_statusDirty)
 *   - local-only fields (note, payPeriod, docType) survive a pull
 *   - dirty local rows the sheet does not have are kept and pushed
 *   - clean local rows the sheet does not have are dropped (deleted elsewhere)
 * Returns { rows, toPush, toDelete: [sheetRowNumber...] }.
 */
export function mergeLedger(sheetRows, localRows, tombstones = []) {
  const toDelete = new Set();
  for (const t of tombstones) tombstoneTargets(sheetRows, t).forEach(n => toDelete.add(n));
  const kept = sheetRows.filter((_, i) => !toDelete.has(i + 2));

  const local = (localRows || []).map(r => ({ ...r }));
  const used = new Set();
  const toPush = [];
  const merged = kept.map(sr => {
    const li = local.findIndex((lr, i) => !used.has(i) && normReceipt(lr.receipt) === sr.receipt);
    if (li === -1) return sr;
    used.add(li);
    const lr = local[li];
    const extras = { note: lr.note, payPeriod: lr.payPeriod, docType: lr.docType };
    Object.keys(extras).forEach(k => extras[k] === undefined && delete extras[k]);
    if (lr._dirty === true) {
      const row = { ...sr, ...lr, receipt: sr.receipt };
      // Status: a status the user picked on this device wins. Otherwise the
      // sheet's status stands (it may have been set on another device), except
      // that a derived Deposit/Quote upgrades a plain Unpaid.
      if (!lr._statusDirty) {
        const upgrade = sr.status === STATUS.UNPAID && (lr.status === STATUS.DEPOSIT || lr.status === STATUS.QUOTE);
        row.status = upgrade ? lr.status : sr.status;
      }
      if (row.goalAllocations == null && sr.goalAllocations != null) row.goalAllocations = sr.goalAllocations;
      toPush.push(row);
      return row;
    }
    const keepPaid = lr.status === STATUS.PAID && sr.status !== STATUS.PAID;
    const row = {
      ...sr,
      ...extras,
      status: keepPaid ? STATUS.PAID : sr.status,
      goalAllocations: sr.goalAllocations ?? lr.goalAllocations ?? null,
      taxRate: sr.taxRate > 0 ? sr.taxRate : (lr.taxRate || 0),
    };
    if (keepPaid) toPush.push(row); // repair a sheet that missed a Paid
    return row;
  });
  const tombSigs = new Set(tombstones.map(t => t.sig));
  local.forEach((lr, i) => {
    if (used.has(i) || lr._dirty !== true) return;
    if (tombSigs.has(rowSignature(lr))) return;
    merged.push(lr);
    toPush.push(lr);
  });
  return { rows: merged, toPush, toDelete: [...toDelete].sort((a, b) => b - a) };
}

/** Remove one specific row (by signature) from a local list. */
export function removeLocalRow(rows, row) {
  const sig = rowSignature(row);
  const list = [...(rows || [])];
  let idx = -1;
  for (let i = list.length - 1; i >= 0; i--) if (rowSignature(list[i]) === sig) { idx = i; break; }
  if (idx === -1) {
    const key = normReceipt(row.receipt);
    const same = list.map((r, i) => normReceipt(r.receipt) === key ? i : -1).filter(i => i >= 0);
    if (same.length === 1) idx = same[0];
  }
  if (idx >= 0) list.splice(idx, 1);
  return { rows: list, removed: idx >= 0 };
}
