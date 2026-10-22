import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REIMBURSABLE_TYPE, isReimbursableLine, reimbursableBilled, reimbursableCostId,
  upsertReimbursableCost, reimbursableByReceipt, netIncomeAmount, dedupeCostsById,
  projectCostToRow, projectCostFromRow, isReimbursableCost,
} from '../source/shared/reimbursable.mjs';

const gear = { service: 'Equipment Procurement', details: 'Radios bought for the client', rates: ['Purchase'], costs: ['55,500'], reimbursable: true };
const svc = { service: 'Camera Operator', details: 'Day rate', rates: ['Day'], costs: ['30000'] };
const inv = (items) => ({ receiptNumber: '261020A', lineItems: items });

test('billed: only lines marked reimbursable count, every cost row on the line adds up', () => {
  assert.equal(isReimbursableLine(gear), true);
  assert.equal(isReimbursableLine(svc), false);
  assert.equal(reimbursableBilled(inv([gear, svc])), 55500);
  assert.equal(reimbursableBilled(inv([{ ...gear, costs: ['JMD 1,000.50', '2,000'] }])), 3000.5);
  assert.equal(reimbursableBilled(inv([svc])), 0);
  assert.equal(reimbursableBilled({}), 0);
});

test('first save logs one at-cost cost on the same receipt', () => {
  const { costs, action, cost } = upsertReimbursableCost([], { receipt: ' 261020A ', client: 'OCM Productions', data: inv([gear, svc]), date: '2026-10-20' });
  assert.equal(action, 'insert');
  assert.equal(costs.length, 1);
  assert.equal(cost.id, reimbursableCostId('261020A'));
  assert.equal(cost.receipt, '261020A');
  assert.equal(cost.amount, '55500');
  assert.equal(cost.billed, '55500');
  assert.equal(cost.type, REIMBURSABLE_TYPE);
  assert.equal(cost.desc, 'Reimbursable at cost: Equipment Procurement');
  assert.equal(cost.date, '2026-10-20');
});

test('re-saving or re-marking paid never adds a second cost', () => {
  let costs = [{ id: 'other', receipt: '261020A', amount: '500', desc: 'Courier' }];
  for (let i = 0; i < 4; i++) costs = upsertReimbursableCost(costs, { receipt: '261020A', data: inv([gear]) }).costs;
  assert.equal(costs.length, 2);
  assert.equal(costs.filter(c => c.id === 'reimb-261020A').length, 1);
  const again = upsertReimbursableCost(costs, { receipt: '261020A', data: inv([gear]) });
  assert.equal(again.action, 'none');
});

test('a changed reimbursable amount follows the invoice while the cost is untouched', () => {
  const first = upsertReimbursableCost([], { receipt: 'R1', data: inv([gear]) }).costs;
  const { costs, action } = upsertReimbursableCost(first, { receipt: 'R1', data: inv([{ ...gear, costs: ['60000'] }]) });
  assert.equal(action, 'update');
  assert.equal(costs.length, 1);
  assert.equal(costs[0].amount, '60000');
  assert.equal(costs[0].billed, '60000');
});

test('markup: a cost edited below the billed amount is kept on re-save', () => {
  const marked = { ...gear, costs: ['1100'] };
  let costs = upsertReimbursableCost([], { receipt: 'M1', data: inv([marked]) }).costs;
  costs = costs.map(c => ({ ...c, amount: '1000' })); // user: I paid 1,000, billed 1,100
  const { costs: out } = upsertReimbursableCost(costs, { receipt: 'M1', data: inv([marked]) });
  assert.equal(out[0].amount, '1000');
  assert.equal(out[0].billed, '1100');
  const row = { receipt: 'M1', projectTotal: 'USD 1,100', amountDue: 'USD 1,100' };
  assert.equal(netIncomeAmount(row, reimbursableByReceipt(out).get('M1')), 100);
});

test('unmarking a line, or an older invoice without the flag, never removes or zeroes the cost', () => {
  const costs = [{ id: 'reimb-261017A', receipt: '261017A', amount: '65000', billed: '65000', type: 'Reimbursable', desc: 'x' }];
  const res = upsertReimbursableCost(costs, { receipt: '261017A', data: inv([{ ...gear, reimbursable: undefined }]) });
  assert.equal(res.action, 'none');
  assert.deepEqual(res.costs, costs);
  assert.equal(upsertReimbursableCost([], { receipt: 'X', data: inv([svc]) }).action, 'none');
  assert.equal(upsertReimbursableCost([], { receipt: '', data: inv([gear]) }).action, 'none');
});

test('netting: a fully at-cost invoice nets to zero, a deposit balance too', () => {
  assert.equal(netIncomeAmount({ projectTotal: 'JMD 55,500', amountDue: 'JMD 55,500.00' }, 55500), 0);
  // 261017A: billed 65,000, 10,000 deposit, 55,000 balance paid, all at cost
  assert.equal(netIncomeAmount({ projectTotal: 'JMD 65,000', amountDue: 'JMD 55,000.00' }, 65000), 0);
  // mixed invoice: 30,000 service + 55,500 gear
  assert.equal(netIncomeAmount({ projectTotal: 'JMD 85,500', amountDue: 'JMD 85,500' }, 55500), 30000);
  // never negative
  assert.equal(netIncomeAmount({ projectTotal: '100', amountDue: '100' }, 250), 0);
});

test('old rows are unaffected: no reimbursable cost means the amount is unchanged', () => {
  const row = { projectTotal: 'JMD 60,000', amountDue: 'JMD 25,000' };
  assert.equal(netIncomeAmount(row, 0), 25000);
  assert.equal(netIncomeAmount(row, undefined), 25000);
  const plain = [{ id: '1', receipt: '260703C', amount: '25000' }];
  assert.equal(reimbursableByReceipt(plain).size, 0);
  assert.equal(isReimbursableCost(plain[0]), false);
});

test('reimbursableByReceipt only sums reimbursable costs, per receipt', () => {
  const map = reimbursableByReceipt([
    { receipt: 'A', amount: '100', type: 'Reimbursable' },
    { receipt: 'A ', amount: '50.5', type: 'reimbursable' },
    { receipt: 'A', amount: '999' },
    { receipt: 'B', amount: '7', type: 'Reimbursable' },
  ]);
  assert.equal(map.get('A'), 150.5);
  assert.equal(map.get('B'), 7);
});

test('sheet rows: old 6-column rows read as plain costs, new rows round-trip G/H', () => {
  const old = projectCostFromRow(['1787249294778niuc', '260703C', 'Client', 'Supplier', '25000', '2026-08-20']);
  assert.equal(old.type, '');
  assert.equal(old.billed, '');
  assert.equal(isReimbursableCost(old), false);
  const c = { id: 'reimb-261020A', receipt: '261020A', client: 'OCM Productions', desc: 'Reimbursable at cost: Equipment Procurement', amount: '55500', date: '2026-10-20', type: 'Reimbursable', billed: '55500' };
  const row = projectCostToRow(c);
  assert.equal(row.length, 8);
  assert.deepEqual(projectCostFromRow(row), c);
  assert.deepEqual(projectCostToRow(old).slice(6), ['', '']);
});

test('dedupe keeps the first cost for each id (old double-append twins)', () => {
  const twin = { id: '1787249294778niuc', receipt: '260703C', amount: '25000' };
  const out = dedupeCostsById([twin, { ...twin }, { id: 'b', amount: '1' }]);
  assert.equal(out.length, 2);
});
