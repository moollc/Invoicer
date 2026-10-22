/**
 * Reimbursable expenses billed at cost (no DOM, no network). Loaded in the
 * browser through boot/reimbursable.js as window.Reimbursable; tested with
 * node --test.
 *
 * A line item marked `reimbursable: true` is money passed through to the
 * client at cost (gear bought on their behalf). It still shows on the invoice
 * and in the totals as normal; on the ledger side it gets one matching
 * ProjectCosts record (type "Reimbursable") on the same receipt, and every
 * income figure (income pool, goals, tax reserve, dashboard) uses the net
 * amount, so only a markup counts as income.
 *
 * ProjectCosts columns: A ID, B Receipt #, C Client, D Description, E Amount,
 * F Date, G Type, H Billed. Old rows have no G/H and read as plain costs.
 */

export const REIMBURSABLE_TYPE = 'Reimbursable';
export const REIMBURSABLE_LABEL = 'Reimbursable expense, billed at cost';
export const PROJECT_COST_HEADERS = ['ID', 'Receipt #', 'Client', 'Description', 'Amount', 'Date', 'Type', 'Billed'];

function money(s) {
  return parseFloat(String(s == null ? '' : s).replace(/[^0-9.-]/g, '')) || 0;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
function normReceipt(r) {
  return String(r == null ? '' : r).trim();
}

export function isReimbursableLine(item) {
  return !!(item && (item.reimbursable === true || item.reimbursable === 'true'));
}

/** Sum of the reimbursable line items as billed on the invoice. */
export function reimbursableBilled(data) {
  const items = (data && Array.isArray(data.lineItems)) ? data.lineItems : [];
  return round2(items.filter(isReimbursableLine).reduce((sum, item) => {
    const costs = Array.isArray(item.costs) ? item.costs : [];
    return sum + costs.reduce((s, c) => s + money(c), 0);
  }, 0));
}

/** One auto cost per receipt, so the id is stable and a re-save updates it. */
export function reimbursableCostId(receipt) {
  return 'reimb-' + normReceipt(receipt);
}

export function isReimbursableCost(cost) {
  return !!cost && String(cost.type || '').toLowerCase() === REIMBURSABLE_TYPE.toLowerCase();
}

function describe(data) {
  const names = ((data && data.lineItems) || []).filter(isReimbursableLine)
    .map(i => String(i.service || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  return 'Reimbursable at cost' + (names.length ? ': ' + [...new Set(names)].join(', ') : '');
}

/**
 * Insert or update the reimbursable cost for one invoice. Returns
 * { costs, action: 'insert' | 'update' | 'none', cost }. Never mutates input
 * and never removes a row.
 *   - no reimbursable lines and no cost yet     -> none
 *   - first save                                -> insert, amount = billed
 *   - re-save, amount still the billed default  -> amount follows the new billed
 *   - re-save, amount edited by the user        -> amount kept (markup case)
 *   - no reimbursable lines now (unmarked, or an older invoice saved before
 *     the flag existed)                         -> none; the cost is left as
 *     it is and only the user removes it
 */
export function upsertReimbursableCost(costs, { receipt, client = '', data, date }) {
  const list = Array.isArray(costs) ? costs.map(c => ({ ...c })) : [];
  const key = normReceipt(receipt);
  if (!key) return { costs: list, action: 'none', cost: null };
  const billed = reimbursableBilled(data);
  const id = reimbursableCostId(key);
  const idx = list.findIndex(c => c.id === id);
  if (idx === -1) {
    if (billed <= 0) return { costs: list, action: 'none', cost: null };
    const cost = {
      id, receipt: key, client: client || '', desc: describe(data),
      amount: String(billed), date: date || new Date().toISOString().slice(0, 10),
      type: REIMBURSABLE_TYPE, billed: String(billed),
    };
    list.push(cost);
    return { costs: list, action: 'insert', cost };
  }
  const prev = list[idx];
  if (billed <= 0) return { costs: list, action: 'none', cost: prev };
  const untouched = round2(money(prev.amount)) === round2(money(prev.billed));
  const next = {
    ...prev,
    receipt: key,
    client: client || prev.client || '',
    type: REIMBURSABLE_TYPE,
    billed: String(billed),
    amount: untouched ? String(billed) : prev.amount,
  };
  next.desc = describe(data);
  const same = ['receipt', 'client', 'desc', 'amount', 'type', 'billed'].every(k => String(prev[k] ?? '') === String(next[k] ?? ''));
  if (same) return { costs: list, action: 'none', cost: prev };
  list[idx] = next;
  return { costs: list, action: 'update', cost: next };
}

/** Receipt -> total at-cost amount of its reimbursable cost records. */
export function reimbursableByReceipt(costs) {
  const map = new Map();
  for (const c of costs || []) {
    if (!isReimbursableCost(c)) continue;
    const key = normReceipt(c.receipt);
    if (!key) continue;
    map.set(key, round2((map.get(key) || 0) + money(c.amount)));
  }
  return map;
}

/**
 * Income that counts for a ledger row. Ledger income uses Amount Due; when a
 * deposit was taken before, Amount Due is only part of the Project Total, so
 * the at-cost share is taken in proportion (deposit 10k of 65k all at cost:
 * the 55k balance still nets to 0). Never below 0. Rows with no reimbursable
 * cost are returned unchanged.
 */
export function netIncomeAmount(row, reimbursedCost) {
  const amt = money(row && row.amountDue);
  const cost = money(reimbursedCost);
  if (cost <= 0 || amt <= 0) return amt;
  const total = money(row && row.projectTotal) || amt;
  const share = total > 0 ? Math.min(amt, cost * (amt / total)) : Math.min(amt, cost);
  return Math.max(0, round2(amt - share));
}

/** Keep the first record for each id (the sheet can hold twins from an old double-append). */
export function dedupeCostsById(costs) {
  const seen = new Set();
  const out = [];
  for (const c of costs || []) {
    if (!c || !c.id) { out.push(c); continue; }
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out;
}

export function projectCostToRow(c) {
  return [c.id, c.receipt || '', c.client || '', c.desc || '', c.amount || '0', c.date || '', c.type || '', c.billed || ''];
}

export function projectCostFromRow(r, clean = v => v) {
  const v = i => (r && r[i] != null ? String(r[i]) : '');
  return {
    id: v(0),
    receipt: clean(v(1)) || '',
    client: clean(v(2)) || '',
    desc: clean(v(3)) || '',
    amount: clean(v(4)) || '0',
    date: clean(v(5)) || '',
    type: clean(v(6)) || '',
    billed: clean(v(7)) || '',
  };
}
