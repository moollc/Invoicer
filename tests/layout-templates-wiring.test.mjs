/**
 * Structural wiring checks for Slice A layout + user templates.
 * Run: node --test tests/layout-templates-wiring.test.mjs  (from Invoicer/)
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(join(root, 'app.js'), 'utf8');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const css = readFileSync(join(root, 'styles.css'), 'utf8');

const BLOCK_IDS = ['header', 'line_items', 'notes', 'totals', 'pay_period', 'footer'];

test('HTML has all layout blocks and party slots', () => {
  for (const id of BLOCK_IDS) {
    assert.match(html, new RegExp(`data-layout-id="${id}"`), `missing layout block ${id}`);
  }
  assert.match(html, /data-layout-slot="logo"/);
  assert.match(html, /data-layout-slot="from"/);
  assert.match(html, /data-layout-slot="to"/);
  assert.match(html, /id="invoice-right-col"/);
  assert.match(html, /id="templates-list"/);
});

test('app.js exports layout + template API surface', () => {
  const fns = [
    'defaultInvoiceLayout',
    'normalizeInvoiceLayout',
    'loadInvoiceLayout',
    'saveInvoiceLayout',
    'mergeInvoiceLayout',
    'applyInvoiceLayout',
    'loadUserTemplates',
    'saveUserTemplates',
    'saveCurrentAsUserTemplate',
    'applyUserTemplate',
    'deleteUserTemplate',
    'openTemplatesModal',
  ];
  for (const fn of fns) {
    assert.match(app, new RegExp(`function ${fn}\\(`), `missing ${fn}`);
  }
});

test('render applies layout; storage keys present', () => {
  assert.match(app, /applyInvoiceLayout\(loadInvoiceLayout\(\)\)/);
  assert.match(app, /invoice-current-layout/);
  assert.match(app, /invoice-user-templates/);
  assert.match(app, /LAYOUT_REQUIRED/);
  assert.match(app, /line_items/);
  assert.match(app, /totals/);
});

test('chat actions wired for layout templates', () => {
  assert.match(app, /patch\._setLayout/);
  assert.match(app, /patch\._saveTemplate/);
  assert.match(app, /patch\._applyTemplate/);
  assert.match(app, /"_setLayout"/);
  assert.match(app, /"_saveTemplate"/);
  assert.match(app, /"_applyTemplate"/);
  assert.match(app, /mergeInvoiceLayout\(patch\._setLayout\)/);
  assert.match(app, /saveCurrentAsUserTemplate/);
});

test('CSS has layout modifiers', () => {
  assert.match(css, /layout-header-swap/);
  assert.match(css, /layout-density-compact/);
  assert.match(css, /\.layout-block/);
});

test('normalize-like defaults: required blocks cannot be omitted from catalog', () => {
  for (const id of BLOCK_IDS) {
    assert.match(app, new RegExp(`'${id}'`));
  }
});

test('templates modal has Create template entry and model tip', () => {
  assert.match(app, /Create template/);
  assert.match(app, /tmpl-create-btn/);
  assert.match(app, /TEMPLATE_AI_MODEL_TIP/);
  assert.match(app, /Claude Sonnet/);
  assert.match(app, /GPT-4o/);
  assert.match(app, /Composer 2\.5/);
  assert.match(css, /\.tmpl-create-card/);
});

test('Slice B: portable format + Drive Templates API surface', () => {
  assert.match(app, /mooInvoicer\.template/);
  assert.match(app, /invoicer-template\.json/);
  assert.match(app, /function templateToPortable/);
  assert.match(app, /function parsePortableTemplate/);
  assert.match(app, /function importPortableToLocal/);
  assert.match(app, /function downloadUserTemplateFile/);
  assert.match(app, /function ensureTemplatesDriveFolder/);
  assert.match(app, /function uploadUserTemplateToDrive/);
  assert.match(app, /function listDriveTemplates/);
  assert.match(app, /function importTemplateFromDrive/);
  assert.match(app, /function importTemplateFromFileText/);
  assert.match(app, /name = 'Templates'/);
  assert.match(app, /patch\._uploadTemplate/);
  assert.match(app, /patch\._importDriveTemplate/);
  assert.match(app, /Import file/);
  assert.match(app, /Drive Templates/);
});
