import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as Reimbursable from '../source/shared/reimbursable.mjs';

// app.js is a browser script, so the goal helpers are copied out of its source
// and run in a sandbox with a stub localStorage. The window exposure is checked too.
const appSource = readFileSync(new URL('../app.js', import.meta.url), 'utf8');

// Source text of a top-level `function name(...) {...}` or single-line `const name = ...;`.
// Small scanner: skips strings, template literals and // comments when matching braces.
function declaration(name) {
  const lines = appSource.split('\n');
  const fn = new RegExp(`^(async )?function ${name}\\(`);
  const start = lines.findIndex(l => fn.test(l) || l.startsWith(`const ${name} =`));
  if (start === -1) throw new Error(`${name} not found in app.js`);
  if (lines[start].startsWith('const ')) return lines[start];
  let depth = 0;
  let opened = false;
  let quote = null;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (quote) {
        if (ch === '\\') c++;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === '/' && line[c + 1] === '/') break;
      if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
      if (ch === '{') { depth++; opened = true; }
      if (ch === '}') depth--;
      if (opened && depth === 0) return lines.slice(start, i + 1).join('\n');
    }
  }
  throw new Error(`${name} has no closing brace`);
}

const CONSTS = ['GOALS_STORAGE_KEY', 'GOALS_TOMBSTONES_KEY', 'GOALS_BASE_KEY', 'GOAL_MERGE_FIELDS', 'GOAL_CLAIM_FIELDS'];
const FUNCTIONS = [
  'goalKey', 'hasOwnKey', 'goalFieldText', 'loadGoalTombstones', 'saveGoalTombstones',
  'recordGoalDeletion', 'unrecordGoalDeletion', 'loadGoalsBase', 'saveGoalsBase', 'goalsByKey',
  'loadGoals', 'saveGoals', 'goalSortDeadline', 'goalHistoryKey', 'mergeGoals3Way',
  'rollSurplusToNextGoal', 'describeRollover', 'extractOrderNumber',
  'ledgerRowHasCollected', 'collectedIncomeOf',
  'goalsFromSheetRows', 'goalToSheetRow', 'writeGoalsToSheet', 'reconcileGoals',
];
const EXPOSED = ['goalKey', 'recordGoalDeletion', 'unrecordGoalDeletion', 'loadGoals', 'saveGoals', 'mergeGoals3Way', 'rollSurplusToNextGoal', 'describeRollover', 'extractOrderNumber'];

function loadApp() {
  const store = new Map();
  const sandbox = {
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
    },
    window: {},
    // Stand-ins for app.js globals the helpers call. Sheet calls do nothing unless a test replaces them.
    _sheetsSpreadsheetId: 'sheet-1',
    sheetsWrite: async () => {},
    sheetsClear: async () => {},
    parseMoneyNum: s => parseFloat(String(s || '').replace(/[^0-9.-]/g, '')) || 0,
    ReimbursableApi: () => Reimbursable,
  };
  const exposure = [...appSource.matchAll(/^window\.(\w+) = \1;$/gm)]
    .filter(m => EXPOSED.includes(m[1]))
    .map(m => m[0]);
  const assign = appSource.match(/^Object\.assign\(window, \{[^}]*\}\);$/m);
  const code = [
    ...CONSTS.map(declaration),
    ...FUNCTIONS.map(declaration),
    ...exposure,
    ...(assign ? [assign[0]] : []),
    `({ ${FUNCTIONS.join(', ')} })`,
  ].join('\n');
  const api = vm.runInNewContext(code, sandbox);
  return { api, sandbox, window: sandbox.window };
}

// Values built inside the sandbox come from another realm, so compare them as plain JSON.
const plain = v => JSON.parse(JSON.stringify(v));
const names = list => plain(list).map(g => g.name);

const goal = (over = {}) => ({
  name: 'Camera', amount: '500', amountReached: '0', deadline: '', notes: '', created: '2026-09-01',
  status: 'Active', claimDate: '', receiptNumber: '', receiptFilename: '', lastContributionDate: '', allocationPct: '0',
  ...over,
});

test('helpers are exposed on window for tests and the console', () => {
  const { window } = loadApp();
  for (const name of EXPOSED) assert.equal(typeof window[name], 'function', `window.${name}`);
});

test('a deleted goal does not come back from a remote copy that still has it', () => {
  const { api } = loadApp();
  const camera = goal({ name: 'Camera' });
  const shimbol = goal({ name: 'Shimbol' });
  api.saveGoals([camera, shimbol]);
  api.saveGoalsBase([camera, shimbol]);

  // Delete Camera here; the sheet has not been cleared yet, so it still holds Camera.
  api.recordGoalDeletion('Camera');
  api.saveGoals(api.loadGoals().filter(g => g.name !== 'Camera'));
  const merged = api.mergeGoals3Way(api.loadGoals(), [camera, shimbol], api.goalsByKey(api.loadGoalsBase()), api.loadGoalTombstones());
  assert.deepEqual(names(merged), ['Shimbol']);

  // A stale copy written back is filtered by the tombstone too.
  api.saveGoals([camera, shimbol]);
  assert.deepEqual(names(api.loadGoals()), ['Shimbol']);

  // Creating it again clears the tombstone.
  api.unrecordGoalDeletion('Camera');
  api.saveGoals([camera, shimbol]);
  assert.deepEqual(names(api.loadGoals()), ['Camera', 'Shimbol']);
});

test('a goal the sheet dropped goes away, unless this device edited it since the last sync', () => {
  const { api } = loadApp();
  const camera = goal({ name: 'Camera' });
  const shimbol = goal({ name: 'Shimbol' });
  const base = api.goalsByKey([camera, shimbol]);
  const tombs = {};

  // Unchanged here, removed from the sheet by another device.
  const gone = api.mergeGoals3Way([camera, shimbol], [shimbol], base, tombs);
  assert.deepEqual(names(gone), ['Shimbol']);

  // Edited here, so it is kept and pushed back up.
  const edited = goal({ name: 'Camera', amountReached: '50' });
  const kept = api.mergeGoals3Way([edited, shimbol], [shimbol], base, tombs);
  assert.deepEqual(names(kept), ['Camera', 'Shimbol']);
});

test('a Claimed status on the sheet is kept when this device still has an Active or Funded copy', () => {
  const { api } = loadApp();
  const baseGoal = goal({ name: 'Shimbol', amount: '500', amountReached: '200', status: 'Active' });
  const base = api.goalsByKey([baseGoal]);
  const remote = goal({
    name: 'Shimbol', amount: '500', amountReached: '500', status: 'Claimed',
    claimDate: '2026-10-20', receiptNumber: '113-9963653-2716250', receiptFilename: 'https://drive.google.com/file/d/abc/view',
  });

  for (const localStatus of ['Active', 'Funded']) {
    const local = goal({ name: 'Shimbol', amount: '500', amountReached: localStatus === 'Funded' ? '500' : '200', status: localStatus });
    const [merged] = plain(api.mergeGoals3Way([local], [remote], base, {}));
    assert.equal(merged.status, 'Claimed', `local ${localStatus}`);
    assert.equal(merged.claimDate, '2026-10-20');
    assert.equal(merged.receiptNumber, '113-9963653-2716250');
    assert.equal(merged.receiptFilename, 'https://drive.google.com/file/d/abc/view');
    assert.equal(merged.amountReached, '500', 'the sheet changed amountReached, so it wins');
  }
});

test('a Claimed copy on this device keeps its receipt when the sheet is stale', () => {
  const { api } = loadApp();
  const baseGoal = goal({ name: 'Shimbol', amount: '500', amountReached: '500', status: 'Funded' });
  const local = goal({ name: 'Shimbol', amount: '500', amountReached: '500', status: 'Claimed', claimDate: '2026-10-21', receiptNumber: 'LOCAL-REF' });
  const remote = goal({ name: 'Shimbol', amount: '500', amountReached: '500', status: 'Funded' });
  const [merged] = plain(api.mergeGoals3Way([local], [remote], api.goalsByKey([baseGoal]), {}));
  assert.equal(merged.status, 'Claimed');
  assert.equal(merged.receiptNumber, 'LOCAL-REF');
  assert.equal(merged.claimDate, '2026-10-21');
});

test('field edits on each side merge, and history is the union without duplicates', () => {
  const { api } = loadApp();
  const baseGoal = goal({ name: 'Camera', amount: '500', notes: 'old' });
  const local = goal({ name: 'Camera', amount: '500', notes: 'new notes', history: [{ date: '2026-10-01', amount: 100, invoiceNumber: '261001A' }] });
  const remote = goal({ name: 'Camera', amount: '650', notes: 'old', history: [
    { date: '2026-10-01', amount: 100, invoiceNumber: '261001A' },
    { date: '2026-10-05', amount: 40, invoiceNumber: '261005A' },
  ] });
  const [merged] = plain(api.mergeGoals3Way([local], [remote], api.goalsByKey([baseGoal]), {}));
  assert.equal(merged.notes, 'new notes', 'local edit kept');
  assert.equal(merged.amount, '650', 'remote edit kept');
  assert.deepEqual(merged.history.map(h => h.invoiceNumber), ['261001A', '261005A']);
});

test('lowering a target rolls the exact surplus to the next open goals, soonest deadline first', () => {
  const { api } = loadApp();
  const mic = goal({ name: 'Mic', amount: '100', amountReached: '100.00', status: 'Funded', deadline: '2026-12-01' });
  const stand = goal({ name: 'Stand', amount: '50', amountReached: '20', deadline: '2026-11-15' });
  const cable = goal({ name: 'Cable', amount: '200', amountReached: '0', deadline: '' });
  const old = goal({ name: 'Old', amount: '10', amountReached: '10', status: 'Claimed', deadline: '2026-11-01' });
  const goals = [mic, stand, cable, old];

  mic.amount = '60.10'; // lowered, as the target edit does before rolling
  const result = plain(api.rollSurplusToNextGoal(goals, mic, 100));

  // Surplus is 39.90: Stand needs 30 and is soonest, Cable takes the remaining 9.90.
  assert.equal(mic.amountReached, '60.1');
  assert.equal(mic.status, 'Funded');
  assert.equal(stand.amountReached, '50');
  assert.equal(stand.status, 'Funded');
  assert.equal(cable.amountReached, '9.9');
  assert.equal(cable.status, 'Active');
  assert.equal(old.amountReached, '10', 'claimed goals are skipped');
  assert.equal(result.leftoverCents, 0);
  assert.deepEqual(result.recipients, [{ name: 'Stand', cents: 3000 }, { name: 'Cable', cents: 990 }]);
  assert.deepEqual(plain(mic.history).map(h => h.amount), [-30, -9.9]);
  assert.equal(plain(stand.history).at(-1).rolledFrom, 'Mic');
});

test('a surplus that fits no open goal is reported as leftover, not silently moved', () => {
  const { api } = loadApp();
  const mic = goal({ name: 'Mic', amount: '100', amountReached: '80', status: 'Funded' });
  mic.amount = '50';
  const result = plain(api.rollSurplusToNextGoal([mic], mic, 100));
  assert.equal(result.leftoverCents, 3000);
  assert.equal(mic.amountReached, '50');
  assert.match(api.describeRollover(result), /no open goal/);
});

test('rolling does nothing when the target was not lowered, and avoids float drift', () => {
  const { api } = loadApp();
  const mic = goal({ name: 'Mic', amount: '100', amountReached: '80' });
  assert.deepEqual(plain(api.rollSurplusToNextGoal([mic], mic, 100).recipients), [], 'target not lowered');

  // 10.20 - 0.10 is not exactly 10.10 in floating point; in cents it is.
  const tiny = goal({ name: 'Tiny', amount: '0.10', amountReached: '10.20' });
  const next = goal({ name: 'Next', amount: '10.10', amountReached: '0' });
  const res = plain(api.rollSurplusToNextGoal([tiny, next], tiny, 10.2));
  assert.equal(next.amountReached, '10.1');
  assert.equal(next.status, 'Funded');
  assert.equal(res.leftoverCents, 0);
});

test('extractOrderNumber pulls the Amazon order number out of goal notes', () => {
  const { api } = loadApp();
  assert.equal(api.extractOrderNumber('Amazon order 113-9963653-2716250, Shimbol TP-Mini'), '113-9963653-2716250');
  assert.equal(api.extractOrderNumber('Order #113-9963653-2716250'), '113-9963653-2716250');
  assert.equal(api.extractOrderNumber('https://www.amazon.com/gp/your-account/order-details?orderID=113-9963653-2716250'), '113-9963653-2716250');
  assert.equal(api.extractOrderNumber('receipt: AB12-345678'), 'AB12-345678');
  assert.equal(api.extractOrderNumber('bought a magic arm'), '');
  assert.equal(api.extractOrderNumber(undefined), '');
});

test('a deposit counts only what has been paid on it, net of reimbursable cost', () => {
  const { api } = loadApp();
  const deposit = { receipt: 'R1', status: '💰 Deposit', amountDue: 'JMD 10,000', amountPaid: 'JMD 4,000', projectTotal: 'JMD 10,000' };
  assert.equal(api.ledgerRowHasCollected(deposit), true);
  assert.equal(api.collectedIncomeOf(deposit, new Map()), 4000);
  // 40% of the 1,500 reimbursable cost belongs to the 4,000 deposit: 600 comes off.
  assert.equal(api.collectedIncomeOf(deposit, new Map([['R1', 1500]])), 3400);

  const unpaid = { ...deposit, amountPaid: '' };
  assert.equal(api.ledgerRowHasCollected(unpaid), false);
  assert.equal(api.collectedIncomeOf(unpaid, new Map()), 0);

  const paid = { receipt: 'R2', status: '✅ Paid', amountDue: 'JMD 10,000', amountPaid: '', projectTotal: 'JMD 10,000' };
  assert.equal(api.collectedIncomeOf(paid, new Map()), 10000);
});

test('a failed sheet write does not advance the base, so the next sync keeps the unsynced goal', async () => {
  const { api, sandbox } = loadApp();
  const camera = goal({ name: 'Camera' });
  const shimbol = goal({ name: 'Shimbol' });
  const lens = goal({ name: 'Lens' });
  const remoteRows = plain([camera, shimbol].map(g => api.goalToSheetRow(g)));
  api.saveGoalsBase([camera, shimbol]);
  api.saveGoals([camera, shimbol, lens]);

  sandbox.sheetsWrite = async () => { throw new Error('offline'); };
  await assert.rejects(api.reconcileGoals(api.loadGoals(), remoteRows), /offline/);
  assert.deepEqual(names(api.loadGoalsBase()), ['Camera', 'Shimbol']);
  assert.deepEqual(names(api.loadGoals()), ['Camera', 'Shimbol', 'Lens']);

  // Retry once the sheet answers: Lens is pushed and the base catches up.
  const writes = [];
  sandbox.sheetsWrite = async (id, range, rows) => { writes.push({ range, rows: plain(rows) }); };
  await api.reconcileGoals(api.loadGoals(), remoteRows);
  assert.equal(writes[0].range, 'Goals!A2:L4');
  assert.equal(writes[0].rows[2][0], 'Lens');
  assert.deepEqual(names(api.loadGoalsBase()), ['Camera', 'Shimbol', 'Lens']);
});

test('a shorter goal list clears the old rows left below it', async () => {
  const { api, sandbox } = loadApp();
  const cleared = [];
  sandbox.sheetsClear = async (id, range) => { cleared.push(range); };
  await api.writeGoalsToSheet([goal({ name: 'Camera' })], 3);
  assert.deepEqual(cleared, ['Goals!A3:L4']);
});
