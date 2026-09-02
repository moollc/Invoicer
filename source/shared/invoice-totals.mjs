/**
 * Public invoice totals API — facade over the split totals modules.
 * Loaded in the browser via boot/invoice-totals.js; tested with node --test.
 * No DOM. Pure money helpers live in invoice-totals-money.mjs; healing and
 * verification policy live in invoice-totals-sync.mjs.
 */

export {
  formatTotalAmountDisplay,
  parseMoneyNum,
  sumLineItemsTotal,
  sumPayments,
} from './invoice-totals-money.mjs';

export {
  assertTotalsConsistent,
  expectedAmountDue,
  hasAmountDueOverride,
  prepareInvoiceForArchive,
  syncTotalsFromLineItems,
} from './invoice-totals-sync.mjs';
