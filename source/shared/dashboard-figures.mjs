/**
 * Dashboard figures that mix ledger, bills, goals and project costs (no DOM,
 * no network). Loaded in the browser through boot/dashboard-figures.js as
 * window.DashboardFigures; tested with node --test.
 *
 * Units: ledger, bills and project costs are in the ledger currency (e.g.
 * JMD). Goals and goal allocations are kept in USD (allocateToGoal converts
 * with the _AppData rate), so they are converted back before they are added
 * to or taken from ledger money. rateToUSD is "1 ledger unit = x USD".
 */

import { ledgerRowBalance } from './ledger-sync.mjs';

const OPEN_STATUSES = new Set(['⬜ Unpaid', '💰 Deposit', '📤 Sent']);

/**
 * Outstanding: what clients still owe on Unpaid, Deposit and Sent rows, after
 * payments recorded against them (Amount Due less Amount Paid, never below 0
 * per row). Reimbursable at-cost lines stay in: the client still owes them.
 */
export function outstandingTotal(rows) {
  return round2((rows || []).reduce((s, r) => (r && OPEN_STATUSES.has(r.status)) ? s + ledgerRowBalance(r) : s, 0));
}

function money(s) {
  return parseFloat(String(s == null ? '' : s).replace(/[^0-9.-]/g, '')) || 0;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
/** YYYY-MM from an ISO date or a month-first M/D/YYYY date, else ''. */
export function monthOf(date) {
  const v = String(date || '').trim();
  let m = v.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?(?:[T\s].*)?$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m && +m[1] >= 1 && +m[1] <= 12) return `${m[3]}-${m[1].padStart(2, '0')}`;
  return '';
}

/** USD to ledger currency, or null when there is no usable rate. */
export function usdToLocal(usd, rateToUSD) {
  const r = Number(rateToUSD);
  if (!(r > 0)) return null;
  return round2(money(usd) / r);
}

/**
 * What the paid bills cost so far. A bill counts when it is marked paid or has
 * dated payments; its Paid Total wins over the history sum (older payments may
 * predate history). An unpaid bill with no payments counts nothing, whatever
 * its Paid Total says.
 */
export function billPaidAmount(bill) {
  if (!bill) return 0;
  const hist = Array.isArray(bill.history) ? bill.history : [];
  const histSum = hist.reduce((s, h) => s + money(h && h.amount), 0);
  const paidFlag = bill.paid === true || bill.paid === '1' || String(bill.paid).toLowerCase() === 'true';
  if (!paidFlag && !hist.length) return 0;
  const total = money(bill.paidTotal);
  return round2(total > 0 ? total : histSum);
}
export function billsPaidTotal(bills) {
  return round2((bills || []).reduce((s, b) => s + billPaidAmount(b), 0));
}

/** YYYY-MM -> bill payments made that month (dated history only). */
export function billSpendByMonth(bills) {
  const out = {};
  for (const b of bills || []) {
    for (const h of (Array.isArray(b && b.history) ? b.history : [])) {
      const ym = monthOf(h && h.date);
      if (ym) out[ym] = round2((out[ym] || 0) + money(h.amount));
    }
  }
  return out;
}

/**
 * YYYY-MM -> project costs paid that month. Reimbursable at-cost records are
 * left out: that money is netted off the invoice it was billed on instead.
 */
export function projectCostSpendByMonth(costs, isReimbursable = () => false) {
  const out = {};
  const seen = new Set();
  for (const c of costs || []) {
    if (!c) continue;
    if (c.id) { if (seen.has(c.id)) continue; seen.add(c.id); }
    if (isReimbursable(c)) continue;
    const ym = monthOf(c.date);
    if (ym) out[ym] = round2((out[ym] || 0) + money(c.amount));
  }
  return out;
}

/**
 * YYYY-MM -> money set aside for goals that month, in ledger currency. Comes
 * from the allocations recorded on ledger rows (column J), which sync across
 * devices. Empty when there is no rate.
 */
export function goalSpendByMonth(rows, rateToUSD) {
  const out = {};
  if (!(Number(rateToUSD) > 0)) return out;
  for (const r of rows || []) {
    let allocs = r && r.goalAllocations;
    if (typeof allocs === 'string') { try { allocs = JSON.parse(allocs); } catch (e) { allocs = null; } }
    if (!Array.isArray(allocs)) continue;
    for (const a of allocs) {
      const ym = monthOf(a && a.date);
      const local = usdToLocal(a && a.applied, rateToUSD);
      if (ym && local) out[ym] = round2((out[ym] || 0) + local);
    }
  }
  return out;
}

/** Goals reached so far: USD total and ledger-currency total (null with no rate). */
export function goalsReached(goals, rateToUSD) {
  const usd = round2((goals || []).reduce((s, g) => s + money(g && g.amountReached), 0));
  return { usd, local: usd > 0 ? usdToLocal(usd, rateToUSD) : 0 };
}

/**
 * Bar widths for the 6-month chart, all on one scale so a month's expenses
 * can be compared with what it earned (and can run past it). Goals sit after
 * expenses on the same track.
 */
export function chartBars(months) {
  const list = months || [];
  const max = Math.max(1, ...list.map(t => Math.max(money(t.total), money(t.spent) + money(t.goals))));
  const pct = n => Math.round((money(n) / max) * 1000) / 10;
  return list.map(t => ({
    ...t,
    earnedPct: pct(t.total),
    spentPct: pct(t.spent),
    goalsPct: pct(t.goals),
    goalsLeftPct: pct(t.spent),
  }));
}
