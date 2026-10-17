import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STATUS, upsertLedgerRow, deriveLedgerStatus, mergeLedger, makeTombstone,
  tombstoneTargets, removeLocalRow, rowToSheetValues, sheetValuesToRow,
} from '../source/shared/ledger-sync.mjs';

const base = {
  receipt: '261017A', date: '10/17/2026', client: 'Acme', service: 'Edit, Grade',
  description: '', projectTotal: 'JMD 100,000', amountDue: 'JMD 100,000', status: STATUS.UNPAID,
};

test('upsert: same receipt updates in place, no second row', () => {
  const rows = [{ ...base, note: 'call Tue', goalAllocations: [{ g: 1 }] }];
  const edited = { ...base, service: 'Edit, Colour, Sound', client: 'Acme Ltd' };
  const { rows: out, action } = upsertLedgerRow(rows, edited);
  assert.equal(action, 'update');
  assert.equal(out.length, 1);
  assert.equal(out[0].service, 'Edit, Colour, Sound');
  assert.equal(out[0].client, 'Acme Ltd');
  assert.equal(out[0].note, 'call Tue', 'note kept');
  assert.deepEqual(out[0].goalAllocations, [{ g: 1 }], 'allocations kept');
  assert.equal(rows[0].service, 'Edit, Grade', 'input not mutated');
});

test('upsert: matches on receipt, not service text (A2 correction is its own row)', () => {
  const rows = [{ ...base }];
  const { rows: out1, action: a1 } = upsertLedgerRow(rows, { ...base, receipt: '261017A2' });
  assert.equal(a1, 'insert');
  assert.equal(out1.length, 2);
  const { rows: out2, action: a2 } = upsertLedgerRow(out1, { ...base, receipt: ' 261017A ', service: 'Totally different' });
  assert.equal(a2, 'update');
  assert.equal(out2.length, 2);
  assert.equal(out2[0].service, 'Totally different');
  assert.equal(out2[1].receipt, '261017A2');
});

test('upsert: keeps a Paid status the user set', () => {
  const { rows: out } = upsertLedgerRow([{ ...base, status: STATUS.PAID }], { ...base, client: 'X' });
  assert.equal(out[0].status, STATUS.PAID);
  assert.equal(out[0].client, 'X');
  assert.equal(deriveLedgerStatus({ totalAmount: '0' }, out[0].status), STATUS.PAID);
});

test('status: deposit present and balance > 0 => Deposit', () => {
  const data = { payments: [{ label: 'Deposit', amount: '40,000' }], totalAmount: 'JMD 60,000.00' };
  assert.equal(deriveLedgerStatus(data, undefined), STATUS.DEPOSIT);
  assert.equal(deriveLedgerStatus(data, STATUS.UNPAID), STATUS.DEPOSIT);
});

test('status: no deposit => Unpaid for a new row, existing status kept', () => {
  assert.equal(deriveLedgerStatus({ totalAmount: '100' }, undefined), STATUS.UNPAID);
  assert.equal(deriveLedgerStatus({ totalAmount: '100' }, STATUS.DEPOSIT), STATUS.DEPOSIT);
});

test('status: save/print never turns Unpaid into Sent; Sent/Paid only stay if user set them', () => {
  assert.equal(deriveLedgerStatus({ totalAmount: '100' }, STATUS.UNPAID), STATUS.UNPAID);
  assert.equal(deriveLedgerStatus({ totalAmount: '100' }, STATUS.SENT), STATUS.SENT);
  assert.equal(deriveLedgerStatus({ payments: [{ amount: '50' }], totalAmount: '50' }, STATUS.PAID), STATUS.PAID);
});

test('status: deposit that covers everything is not Deposit', () => {
  assert.equal(deriveLedgerStatus({ payments: [{ amount: '100' }], totalAmount: '0' }, undefined), STATUS.UNPAID);
});

test('status: quote doc => Quote', () => {
  assert.equal(deriveLedgerStatus({}, STATUS.UNPAID, { isQuote: true }), STATUS.QUOTE);
});

test('merge: dirty local edit wins over sheet and is queued for push', () => {
  const sheet = [{ ...base, status: STATUS.UNPAID, goalAllocations: null, taxRate: 0 }];
  const local = [{ ...base, client: 'Renamed Client', _dirty: true }];
  const { rows, toPush } = mergeLedger(sheet, local, []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].client, 'Renamed Client');
  assert.equal(toPush.length, 1);
});

test('merge: dirty content edit does not undo a Paid made on another device', () => {
  const sheet = [{ ...base, status: STATUS.PAID }];
  const local = [{ ...base, status: STATUS.UNPAID, client: 'New', _dirty: true }];
  const { rows } = mergeLedger(sheet, local, []);
  assert.equal(rows[0].status, STATUS.PAID);
  assert.equal(rows[0].client, 'New');
});

test('merge: a status the user changed here wins', () => {
  const sheet = [{ ...base, status: STATUS.PAID }];
  const local = [{ ...base, status: STATUS.UNPAID, _dirty: true, _statusDirty: true }];
  assert.equal(mergeLedger(sheet, local, []).rows[0].status, STATUS.UNPAID);
});

test('merge: unsynced new local row is kept and pushed; clean ghost is dropped', () => {
  const sheet = [{ ...base }];
  const local = [{ ...base }, { ...base, receipt: '261017B', _dirty: true }, { ...base, receipt: 'GHOST' }];
  const { rows, toPush } = mergeLedger(sheet, local, []);
  assert.deepEqual(rows.map(r => r.receipt), ['261017A', '261017B']);
  assert.deepEqual(toPush.map(r => r.receipt), ['261017B']);
});

test('merge: local note survives a pull (note is not a sheet column)', () => {
  const { rows } = mergeLedger([{ ...base }], [{ ...base, note: 'n1' }], []);
  assert.equal(rows[0].note, 'n1');
});

test('merge: paid and unpaid history both kept', () => {
  const sheet = [{ ...base, status: STATUS.PAID }, { ...base, receipt: '261001A', status: STATUS.UNPAID }];
  const { rows } = mergeLedger(sheet, [], []);
  assert.equal(rows.length, 2);
});

test('delete: tombstone removes the row and it does not come back on sync', () => {
  const sheet = [{ ...base }, { ...base, receipt: '261017B', client: 'Other' }];
  const tomb = makeTombstone(sheet[1]);
  const { rows, toDelete } = mergeLedger(sheet, [{ ...base, receipt: '261017B', client: 'Other' }], [tomb]);
  assert.deepEqual(rows.map(r => r.receipt), ['261017A']);
  assert.deepEqual(toDelete, [3]); // header is row 1, B is row 3
});

test('delete: with duplicate receipts, only the exact row is removed', () => {
  const dupA = { ...base, service: 'Old services' };
  const dupB = { ...base, service: 'New services' };
  const sheet = [dupA, { ...base, receipt: 'X1' }, dupB];
  assert.deepEqual(tombstoneTargets(sheet, makeTombstone(dupA)), [2]);
  assert.deepEqual(tombstoneTargets(sheet, makeTombstone(dupB)), [4]);
  const { rows } = mergeLedger(sheet, [], [makeTombstone(dupA)]);
  assert.deepEqual(rows.map(r => r.service), ['Edit, Grade', 'New services']);
});

test('delete: ambiguous (row edited elsewhere, receipt duplicated) deletes nothing', () => {
  const sheet = [{ ...base, service: 'a' }, { ...base, service: 'b' }];
  assert.deepEqual(tombstoneTargets(sheet, makeTombstone({ ...base, service: 'c' })), []);
});

test('removeLocalRow removes exactly one matching row', () => {
  const rows = [{ ...base, service: 'a' }, { ...base, service: 'b' }, { ...base, receipt: 'Z' }];
  const { rows: out, removed } = removeLocalRow(rows, { ...base, service: 'b' });
  assert.equal(removed, true);
  assert.deepEqual(out.map(r => r.service), ['a', 'Edit, Grade']);
});

test('sheet values round-trip', () => {
  const row = { ...base, company: 'moo', goalAllocations: [{ id: 'g', applied: 5 }], taxRate: 0.15 };
  const back = sheetValuesToRow(rowToSheetValues(row).map(v => (typeof v === 'number' ? String(v) : v)));
  assert.equal(back.receipt, row.receipt);
  assert.equal(back.client, row.client);
  assert.deepEqual(back.goalAllocations, row.goalAllocations);
  assert.equal(back.taxRate, 0.15);
});
