import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  monthOf, usdToLocal, billPaidAmount, billsPaidTotal, billSpendByMonth,
  projectCostSpendByMonth, goalSpendByMonth, goalsReached, chartBars,
} from '../source/shared/dashboard-figures.mjs';

// Real-shaped sheet (names replaced, amounts/dates/statuses kept).
const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/dashboard-real-shaped.json', import.meta.url), 'utf8'));
const RATE = parseFloat(fx._AppData[1][1]); // 1 JMD in USD
const bills = fx.Bills.slice(1).map(r => ({
  name: r[1], amount: r[2], paid: r[8] === '1', history: JSON.parse(r[9] || '[]'), paidTotal: r[10],
}));
const costs = fx.ProjectCosts.slice(1).map(r => ({ id: r[0], receipt: r[1], amount: r[4], date: r[5], type: r[6] || '' }));
const ledger = fx.Ledger.slice(1).map(r => ({ receipt: r[0], date: r[1], goalAllocations: r[9] || null }));
const goals = fx.Goals.slice(1).map(r => ({ name: r[0], amountReached: r[5] }));
const isReimb = c => String(c.type).toLowerCase() === 'reimbursable';

test('months: ISO and month-first dates, nothing else', () => {
  assert.equal(monthOf('2026-09-21'), '2026-09');
  assert.equal(monthOf('2026-9-1'), '2026-09');
  assert.equal(monthOf('9/1/2026'), '2026-09');
  assert.equal(monthOf('10/05/2026'), '2026-10');
  assert.equal(monthOf('13/1/2026'), '');
  assert.equal(monthOf(''), '');
});

test('bills paid: Paid Total wins, an unpaid bill with no payments counts nothing', () => {
  assert.equal(billPaidAmount({ paid: true, paidTotal: '43000', history: [{ date: '2026-07-14', amount: '22000' }] }), 43000);
  assert.equal(billPaidAmount({ paid: true, paidTotal: '0', history: [{ date: '2026-07-14', amount: '22000' }] }), 22000);
  assert.equal(billPaidAmount({ paid: false, paidTotal: '40000', history: [] }), 0);
  assert.equal(billPaidAmount({ paid: false, paidTotal: '7450', history: [{ date: '2026-07-07', amount: '7450' }] }), 7450);
  // Real sheet: 371,390.34 in Paid Total, of which 40,000 is an unpaid bill with no payments
  assert.equal(billsPaidTotal(bills), 331390.34);
});

test('expenses by month: dated bill payments plus non-reimbursable project costs', () => {
  const b = billSpendByMonth(bills);
  const c = projectCostSpendByMonth(costs, isReimb);
  assert.deepEqual(b, { '2026-05': 150000, '2026-06': 20864, '2026-07': 90213.86, '2026-09': 48674.71 });
  // the duplicated supplier payment counts once, the two at-cost records not at all
  assert.deepEqual(c, { '2026-08': 25000, '2026-09': 18399.15 });
});

test('goals: USD allocations on ledger rows land in their month in JMD', () => {
  const g = goalSpendByMonth(ledger, RATE);
  assert.deepEqual(Object.keys(g).sort(), ['2026-06', '2026-07', '2026-09', '2026-10']);
  assert.equal(Math.round(g['2026-06']), 2751);
  assert.equal(Math.round(g['2026-07']), 6771);
  assert.equal(Math.round(g['2026-09']), 8292);
  assert.equal(Math.round(g['2026-10']), 1500);
  assert.deepEqual(goalSpendByMonth(ledger, null), {});
});

test('goals reached: 178.36 USD is about JMD 28,275, never added to JMD as is', () => {
  const r = goalsReached(goals, RATE);
  assert.equal(r.usd, 178.36);
  assert.equal(Math.round(r.local), 28275);
  assert.equal(goalsReached(goals, null).local, null);
  assert.equal(usdToLocal(10, 0), null);
});

test('chart: one scale for earned, expenses and goals; goals sit after expenses', () => {
  const bars = chartBars([
    { label: 'May', total: 177000, spent: 150000, goals: 0 },
    { label: 'Jul', total: 305000, spent: 90213.86, goals: 6771 },
    { label: 'Aug', total: 10000, spent: 25000, goals: 0 },
    { label: 'Oct', total: 0, spent: 0, goals: 0 },
  ]);
  assert.equal(bars[1].earnedPct, 100);
  assert.equal(bars[0].earnedPct, 58);
  assert.equal(bars[0].spentPct, 49.2);
  assert.ok(bars[2].spentPct > bars[2].earnedPct, 'overspend shows past the earned bar');
  assert.equal(bars[1].goalsLeftPct, bars[1].spentPct);
  assert.deepEqual([bars[3].earnedPct, bars[3].spentPct, bars[3].goalsPct], [0, 0, 0]);
});

test('outstanding: real sheet stays 144,000; a part payment comes off', async () => {
  const { outstandingTotal } = await import('../source/shared/dashboard-figures.mjs');
  const { sheetValuesToRow } = await import('../source/shared/ledger-sync.mjs');
  const rows = fx.Ledger.slice(1).map(sheetValuesToRow);
  assert.equal(outstandingTotal(rows), 144000);
  const i = rows.findIndex(r => r.receipt === '261005A'); // Sent, JMD 40,000
  const part = rows.map((r, j) => j === i ? { ...r, amountPaid: 'JMD 15,000', paidDate: '10/20/2026' } : r);
  assert.equal(outstandingTotal(part), 129000);
  const over = rows.map((r, j) => j === i ? { ...r, amountPaid: 'JMD 50,000' } : r);
  assert.equal(outstandingTotal(over), 104000);
});
