
// ── Font selector ────────────────────────────────────────────

function changeTitleFont(fontName) {
  const titleEl = document.querySelector('.invoice-word');
  const fromNameEl = document.querySelector('.party.from .name');
  const thankYouEl = document.querySelector('.thank-you');
  const isSerif = ['Playfair Display', 'Georgia'].includes(fontName);
  const fallback = isSerif ? 'serif' : 'sans-serif';
  const family = `'${fontName}', ${fallback}`;
  if (titleEl) titleEl.style.fontFamily = family;
  if (fromNameEl) fromNameEl.style.fontFamily = family;
  if (thankYouEl) thankYouEl.style.fontFamily = family;
  localStorage.setItem('invoice-title-font', fontName);
  syncSettingsToSheet();
}

function restoreTitleFont() {
  const saved = localStorage.getItem('invoice-title-font') || 'Bebas Neue';
  document.getElementById('font-selector').value = saved;
  changeTitleFont(saved);
}

function changeTheme(themeName) {
  document.body.classList.remove('theme-modern', 'theme-minimal');
  if (themeName !== 'classic') {
    document.body.classList.add(`theme-${themeName}`);
  }
  localStorage.setItem('invoice-theme', themeName);
  syncSettingsToSheet();
}

function restoreTheme() {
  const saved = localStorage.getItem('invoice-theme') || 'classic';
  document.getElementById('theme-selector').value = saved;
  changeTheme(saved);
}

function applyTitleSize(px) {
  const titleEl = document.querySelector('.invoice-word');
  if (!titleEl) return;
  titleEl.style.fontSize = px + 'px';
  document.getElementById('title-size-label').textContent = px + 'px';
  localStorage.setItem('invoice-title-size', px);
}

function restoreTitleSize() {
  const saved = localStorage.getItem('invoice-title-size');
  if (!saved) return;
  const slider = document.getElementById('title-size-slider');
  if (slider) slider.value = saved;
  applyTitleSize(saved);
}

// ── Date & Receipt helpers ────────────────────────────────────

function todayFormatted() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return { dd, mm, yy, yyyy: d.getFullYear() };
}

// Receipt format: YYMMDD + suffix letter (A, B, C…)
// Suffix is stored in sessionStorage so refreshing the same day keeps it stable.
// To get B on the same day, change receiptOverride in the JSON.
function nextReceiptNumber(current) {
  if (!current) return autoReceiptNumber();
  // Match trailing uppercase letter(s), e.g. "260601A" → base "260601", suffix "A"
  const m = current.match(/^(.*?)([A-Z]+)$/);
  if (!m) return autoReceiptNumber();
  const base = m[1], suffix = m[2];
  // Increment letter sequence: A→B, Z→AA, AZ→BA
  let carry = true;
  const chars = suffix.split('').reverse();
  for (let i = 0; i < chars.length && carry; i++) {
    if (chars[i] < 'Z') { chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1); carry = false; }
    else { chars[i] = 'A'; }
  }
  if (carry) chars.push('A');
  return base + chars.reverse().join('');
}

function autoReceiptNumber() {
  const { dd, mm, yy } = todayFormatted();
  const dateSegment = `${yy}${mm}${dd}`;
  const customPrefix = (localStorage.getItem('invoice-receipt-prefix') || '').trim();
  const fullPrefix = customPrefix + dateSegment;
  const rows = loadLedgerRows();
  const used = rows
    .map(r => (r.receipt || '').toUpperCase())
    .filter(r => r.startsWith(fullPrefix.toUpperCase()))
    .map(r => r.slice(fullPrefix.length))
    .filter(s => /^[A-Z]$/.test(s))
    .map(s => s.charCodeAt(0));
  const next = used.length ? Math.max(...used) + 1 : 65; // 65 = 'A'
  return fullPrefix + String.fromCharCode(Math.min(next, 90)); // cap at Z
}

function autoDate() {
  const { dd, mm, yyyy } = todayFormatted();
  return `${dd} / ${mm} / ${yyyy}`;
}

// ── Toast Notifications ──────────────────────────────────────

(function() {
  const style = document.createElement('style');
  style.textContent = `
    #toast-container { position:fixed; bottom:28px; left:50%; transform:translateX(-50%); z-index:10100; display:flex; flex-direction:column; align-items:center; gap:8px; pointer-events:none; }
    .toast { font-family:'Roboto',sans-serif; font-size:12.5px; padding:11px 18px; border-radius:10px; box-shadow:0 4px 20px rgba(0,0,0,0.3); display:flex; align-items:center; gap:10px; pointer-events:all; max-width:420px; animation:toastIn 0.2s ease; }
    .toast.info    { background:#14202e; color:#fff; }
    .toast.success { background:#1a7a4a; color:#fff; }
    .toast.error   { background:#c0211a; color:#fff; }
    .toast.warning { background:#e07b00; color:#fff; }
    .toast .toast-close { background:none; border:none; color:inherit; opacity:0.6; font-size:16px; cursor:pointer; padding:0; line-height:1; flex-shrink:0; }
    .toast .toast-close:hover { opacity:1; }
    .toast-confirm { background:#14202e; color:#fff; font-family:'Roboto',sans-serif; font-size:12.5px; padding:14px 18px; border-radius:10px; box-shadow:0 4px 24px rgba(0,0,0,0.4); display:flex; flex-direction:column; gap:10px; pointer-events:all; max-width:380px; }
    .toast-confirm .toast-msg { line-height:1.5; }
    .toast-confirm .toast-actions { display:flex; gap:8px; justify-content:flex-end; }
    .toast-confirm .toast-actions button { font-family:'Roboto',sans-serif; font-size:11.5px; padding:6px 14px; border-radius:6px; border:none; cursor:pointer; font-weight:600; }
    .toast-confirm .btn-cancel { background:rgba(255,255,255,0.12); color:#fff; }
    .toast-confirm .btn-confirm { background:#d0241b; color:#fff; }
    .toast-confirm .btn-confirm.safe { background:#1a7a4a; }
    @keyframes toastIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
  `;
  document.head.appendChild(style);
  const container = document.createElement('div');
  container.id = 'toast-container';
  document.body.appendChild(container);
})();
function triggerConfetti() {
  const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#00bcd4', '#4CAF50', '#FFEB3B', '#FF9800'];
  for (let i = 0; i < 150; i++) {
    const confetti = document.createElement('div');
    document.body.appendChild(confetti);
    const size = Math.random() * 8 + 5;
    const startLeft = 50;
    const startBottom = -5;
    const endLeft = 50 + (Math.random() - 0.5) * 100;
    const endBottom = 20 + Math.random() * 80;
    
    confetti.style.cssText = `
      position: fixed;
      width: ${size}px; height: ${size/1.5}px;
      background-color: ${colors[Math.floor(Math.random() * colors.length)]};
      left: ${startLeft}vw;
      bottom: ${startBottom}vh;
      opacity: 1;
      pointer-events: none;
      z-index: 10000;
      border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
      transform: rotate(0deg);
      transition: all ${2 + Math.random() * 1.5}s cubic-bezier(0.1, 0.8, 0.3, 1);
    `;
    
    confetti.getBoundingClientRect(); // Force reflow
    
    confetti.style.left = `${endLeft}vw`;
    confetti.style.bottom = `${endBottom}vh`;
    confetti.style.transform = `rotate(${Math.random() * 1080 - 540}deg)`;
    confetti.style.opacity = '0';
    
    setTimeout(() => confetti.remove(), 3500);
  }
}

function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span style="flex:1">${message}</span><button class="toast-close" onclick="this.parentElement.remove()">×</button>`;
  container.appendChild(toast);
  if (duration > 0) setTimeout(() => toast.remove(), duration);
  return toast;
}

function showConfirm(message, onConfirm, { confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = true } = {}) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast-confirm';
  toast.innerHTML = `
    <div class="toast-msg">${message}</div>
    <div class="toast-actions">
      <button class="btn-cancel">${cancelLabel}</button>
      <button class="btn-confirm${danger ? '' : ' safe'}">${confirmLabel}</button>
    </div>`;
  // Returns a Promise so callers can use await; also supports callback for legacy use
  let resolve;
  const p = new Promise(res => { resolve = res; });
  toast.querySelector('.btn-cancel').onclick = () => { toast.remove(); resolve(false); if (typeof onConfirm !== 'function') return; };
  toast.querySelector('.btn-confirm').onclick = () => { toast.remove(); resolve(true); if (typeof onConfirm === 'function') onConfirm(); };
  container.appendChild(toast);
  return p;
}

function showPrompt(message, { placeholder = '', defaultValue = '', confirmLabel = 'Save', cancelLabel = 'Cancel' } = {}) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast-confirm';
  toast.innerHTML = `
    <div class="toast-msg">${message}</div>
    <input type="text" style="width:100%;box-sizing:border-box;padding:7px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#fff;font-size:12.5px;font-family:'Roboto',sans-serif;outline:none;" placeholder="${placeholder}" value="${defaultValue}">
    <div class="toast-actions">
      <button class="btn-cancel">${cancelLabel}</button>
      <button class="btn-confirm safe">${confirmLabel}</button>
    </div>`;
  let resolve;
  const p = new Promise(res => { resolve = res; });
  const input = toast.querySelector('input');
  toast.querySelector('.btn-cancel').onclick = () => { toast.remove(); resolve(null); };
  toast.querySelector('.btn-confirm').onclick = () => { const v = input.value.trim(); toast.remove(); resolve(v || null); };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { const v = input.value.trim(); toast.remove(); resolve(v || null); } if (e.key === 'Escape') { toast.remove(); resolve(null); } });
  container.appendChild(toast);
  setTimeout(() => input.focus(), 50);
  return p;
}

// ── Data ─────────────────────────────────────────────────────

function getData() {
  const raw = JSON.parse(document.getElementById('invoice-data').textContent);
  raw.date          = raw.dateOverride    || autoDate();
  raw.receiptNumber = raw.receiptOverride || autoReceiptNumber();
  // Migrate old single totalLabel to split fields
  if (raw.totalLabel && !raw.totalLabelTop) {
    const parts = raw.totalLabel.split(' ');
    raw.totalLabelTop    = parts[0] || 'Deposit';
    raw.totalLabelBottom = parts.slice(1).join(' ') || 'Due';
    delete raw.totalLabel;
  }
  // Heal swapped email/phone — if email field looks like a phone, swap them back
  const looksLikeEmail = v => v && v.includes('@');
  const looksLikePhone = v => v && !v.includes('@') && /[\d\s\(\)\+\-\/]/.test(v);
  for (const party of [raw.from, raw.to]) {
    if (party && looksLikePhone(party.email) && looksLikeEmail(party.phone)) {
      [party.email, party.phone] = [party.phone, party.email];
    }
  }
  return raw;
}

function get(obj, path) {
  if (!obj) return undefined;
  return path.split('.').reduce((o, k) => (o || {})[k], obj);
}

// ── Render ───────────────────────────────────────────────────

function safeText(el, ...lines) {
  el.innerHTML = '';
  lines.forEach((line, i) => {
    el.appendChild(document.createTextNode(line));
    if (i < lines.length - 1) el.appendChild(document.createElement('br'));
  });
}

function render(data) {
  // Persist invoice state so it survives page refresh
  try { localStorage.setItem('invoice-last-state', JSON.stringify(data)); } catch(e) {}

  const fromSub = document.getElementById('from-sub');
  if (fromSub) {
    const fromLines = [data.from.address, [data.from.email, data.from.phone].filter(Boolean).join(' · ')].filter(Boolean);
    fromSub.textContent = fromLines.join('\n');
  }

  const toSub = document.getElementById('to-sub');
  if (toSub) toSub.textContent = [data.to.address, data.to.email, data.to.phone].filter(Boolean).join(' · ');

  const pn = document.getElementById('payment-note-el');
  if (pn) pn.textContent = data.paymentNote || '';

  const notesEl   = document.getElementById('invoice-notes-el');
  const notesWrap = document.getElementById('invoice-notes-wrap');
  if (notesEl && notesWrap) {
    const notes = data.invoiceNotes || '';
    notesEl.textContent = notes;
    notesWrap.style.display = notes ? 'block' : 'none';
  }

  document.querySelectorAll('[data-field]').forEach(el => {
    const val = get(data, el.dataset.field);
    if (val !== undefined) el.textContent = val;
  });

  renderPaymentsDisplay(data.payments || [], data);

  const badge = document.getElementById('status-badge');
  const overdueBadge = document.getElementById('overdue-badge');
  if (badge && overdueBadge) {
    let statusStr = '';
    let isOverdue = false;
    try {
      const rows = loadLedgerRows();
      const match = rows.find(h => h.receipt === data.receiptNumber);
      if (match && match.status) {
        statusStr = match.status;
        if ((statusStr === '⬜ Unpaid' || statusStr === '📤 Sent') && match.date) {
          const dateParts = match.date.split('/').map(s => s.trim());
          if (dateParts.length === 3) {
            const invDate = new Date(`${dateParts[2]}-${dateParts[1]}-${dateParts[0]}T00:00:00`);
            const daysOld = (new Date() - invDate) / (1000 * 60 * 60 * 24);
            if (daysOld > 30) isOverdue = true;
          }
        }
      }
    } catch(e) {}
    
    if (statusStr) {
      const statusKey = statusStr.replace(/[^a-zA-Z]/g, '').toLowerCase();
      badge.textContent = statusStr.replace(/^[^\w]+/, '').trim();
      badge.style.display = 'inline-block';
      badge.className = 'status-badge status-' + statusKey;
    } else {
      badge.style.display = 'none';
    }
    overdueBadge.style.display = isOverdue ? 'inline-block' : 'none';
    
    const watermark = document.getElementById('invoice-watermark');
    if (watermark) {
      watermark.classList.remove('watermark-draft');
      if (statusStr === '✅ Paid') {
        watermark.textContent = 'PAID';
        watermark.style.display = 'block';
        watermark.style.color = '#2a8c55'; // Using explicit color to ensure visibility on print
      } else if (!statusStr) {
        watermark.textContent = 'DRAFT';
        watermark.style.display = 'block';
        watermark.style.color = 'var(--ink)';
        watermark.classList.add('watermark-draft');
      } else {
        watermark.style.display = 'none';
      }
    }
  }

  const tbody = document.getElementById('line-items');
  tbody.innerHTML = '';
  data.lineItems.forEach((item, i) => {
    const rates = Array.isArray(item.rates) ? item.rates : [];
    const costs = Array.isArray(item.costs) ? item.costs : [];
    const ratesHtml = rates.map((r, ri) =>
      `<span class="rate-tag" data-field="lineItems.${i}.rates.${ri}">${r}</span>`
    ).join('');
    const costsHtml = costs.map((c, ci) =>
      `<span class="cost-amt" data-field="lineItems.${i}.costs.${ci}">${c}</span>`
    ).join('');
    const tipLines = rates.length > 1
      ? rates.map((r, ri) => `${r}  ×  ${costs[ri] || '—'}`).join('\n')
      : '';
    const costRowsTip = tipLines ? ` data-tip="${tipLines.replace(/"/g, '&quot;')}"` : '';
    tbody.innerHTML += `
      <tr>
        <td class="col-service"><div class="service-name" data-field="lineItems.${i}.service">${item.service}</div></td>
        <td class="col-details" data-field="lineItems.${i}.details">${item.details}</td>
        <td class="col-rate"><div class="rate-rows" id="rate-rows-${i}">${ratesHtml}</div></td>
        <td class="col-cost num"><div class="cost-rows" id="cost-rows-${i}"${costRowsTip}>${costsHtml}</div></td>
      </tr>`;
  });

  // Dynamic document title
  const clientName = (data.to && data.to.name) ? data.to.name.split(' ')[0] : '';
  document.title = data.receiptNumber
    ? `${data.receiptNumber}${clientName ? ' · ' + clientName : ''} — moo Invoicer`
    : 'moo Invoicer';

  // Due date — auto-calculate from invoice date + payPeriod
  const dueDateLabel = document.getElementById('due-date-label');
  const dueDateValue = document.getElementById('due-date-value');
  const agingChip    = document.getElementById('aging-chip');
  if (dueDateLabel && dueDateValue) {
    const pp = (data.payPeriod || '').trim();
    const netDays = parseInt(pp.replace(/[^0-9]/g, ''));
    if (!isNaN(netDays) && netDays > 0 && data.date) {
      const parts = data.date.split('/').map(s => s.trim());
      let invoiceDate;
      if (parts.length === 3) invoiceDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T12:00:00`);
      if (invoiceDate && !isNaN(invoiceDate)) {
        const due = new Date(invoiceDate);
        due.setDate(due.getDate() + netDays);
        const dd = String(due.getDate()).padStart(2, '0');
        const mm = String(due.getMonth() + 1).padStart(2, '0');
        const yyyy = due.getFullYear();
        dueDateValue.textContent = `${dd} / ${mm} / ${yyyy}`;
        dueDateLabel.style.display = '';
        dueDateValue.style.display = '';
        // Aging chip — hide if Paid, otherwise colour by urgency
        if (agingChip) {
          let isPaid = false;
          try {
            const ledgerRows = loadLedgerRows();
            const match = ledgerRows.find(r => r.receipt === data.receiptNumber);
            if (match && match.status === '✅ Paid') isPaid = true;
          } catch(e) {}
          if (isPaid) {
            agingChip.style.display = 'none';
          } else {
            const today = new Date(); today.setHours(0,0,0,0);
            const dueDay = new Date(due); dueDay.setHours(0,0,0,0);
            const diff = Math.round((dueDay - today) / (1000 * 60 * 60 * 24));
            let chipText, chipBg, chipColor;
            if (diff > 0) {
              chipText = `Due in ${diff}d`;
              chipBg = '#e8f5e9'; chipColor = '#2e7d32';
            } else if (diff === 0) {
              chipText = 'Due today';
              chipBg = '#fff8e1'; chipColor = '#f57f17';
            } else {
              chipText = `${Math.abs(diff)}d overdue`;
              chipBg = '#ffebee'; chipColor = '#c62828';
            }
            agingChip.textContent = chipText;
            agingChip.style.background = chipBg;
            agingChip.style.color = chipColor;
            agingChip.style.display = 'inline';
          }
        }
      } else {
        dueDateLabel.style.display = 'none';
        dueDateValue.style.display = 'none';
        if (agingChip) agingChip.style.display = 'none';
      }
    } else {
      dueDateLabel.style.display = 'none';
      dueDateValue.style.display = 'none';
      if (agingChip) agingChip.style.display = 'none';
    }
  }

  // Click-to-copy receipt number
  const receiptEl = document.querySelector('[data-field="receiptNumber"]');
  if (receiptEl && !receiptEl.dataset.copyWired) {
    receiptEl.dataset.copyWired = '1';
    receiptEl.style.cursor = 'pointer';
    receiptEl.title = 'Click to copy receipt number';
    receiptEl.addEventListener('click', () => {
      if (document.body.classList.contains('editing')) return;
      navigator.clipboard.writeText(receiptEl.textContent.trim())
        .then(() => showToast('Receipt number copied', 'success', 2000))
        .catch(() => showToast('Could not copy', 'error'));
    });
  }
}

// ── Edit mode ────────────────────────────────────────────────

let snapshot = '';

function formatCurrencyField(el) {
  if (!document.body.classList.contains('editing')) return;
  let text = el.innerText.trim();
  if (!text) return;
  const match = text.match(/^([^\d\.\-]*)([\d\.\-]+)(.*)$/);
  if (match) {
    let symbol = match[1].trim() || '$';
    let numStr = match[2];
    let suffix = match[3].trim();
    let num = parseFloat(numStr);
    if (!isNaN(num)) {
      let formattedNum = num.toLocaleString('en-US', {
        minimumFractionDigits: numStr.includes('.') ? 2 : 0,
        maximumFractionDigits: 2
      });
      el.innerText = `${symbol}${formattedNum}${suffix ? ' ' + suffix : ''}`;
    }
  }
}

function startEdit() {
  snapshot = document.getElementById('invoice-data').textContent;
  document.body.classList.add('editing');
  const bar = document.getElementById('edit-action-bar');
  if (bar) bar.style.display = 'flex';
  document.querySelectorAll('[data-field]').forEach(el => {
    if (el.dataset.field === 'date') {
      const current = el.textContent.trim();
      const ta = document.createElement('input');
      ta.type = 'date';
      ta.className = 'date-edit-input';
      ta.style.cssText = 'font-family: inherit; font-size: inherit; font-weight: inherit; color: inherit; border: 1.5px dashed var(--rule); border-radius: 4px; padding: 2px 4px; background: transparent; outline: none; width: 130px;';
      
      let d = new Date(current);
      if (isNaN(d) && current.includes('/')) {
        const parts = current.split('/').map(s => s.trim());
        if (parts.length === 3) d = new Date(`${parts[2]}-${parts[0]}-${parts[1]}T12:00:00`);
      }
      
      if (!isNaN(d)) {
        const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
        ta.value = iso;
      }
      el.innerHTML = '';
      el.appendChild(ta);
      el.contentEditable = 'false';
    } else {
      el.contentEditable = 'true';
      el.spellcheck = false;
      // Task #84: Show prompt if client details are empty
      if ((el.dataset.field === 'to._sub' || el.dataset.field === 'from._sub') && !el.textContent.trim()) {
        el.textContent = 'Add address / email...';
        el.style.color = 'rgba(20,32,46,0.4)';
        el.onfocus = function() {
          if (this.textContent === 'Add address / email...') {
            this.textContent = '';
            this.style.color = '';
          }
        };
        el.onblur = function() {
          if (!this.textContent.trim()) {
            this.textContent = 'Add address / email...';
            this.style.color = 'rgba(20,32,46,0.4)';
          }
        };
      }
    }
  });

  // Ensure prompt text isn't saved as actual data
  const originalExtract = extractEditData;
  window.extractEditData_patched = true;

  // Swap rate/cost span groups → textareas (Enter works natively in textarea)
  const editData = getData();
  editData.lineItems.forEach(function(item, i) {
    const rateWrap = document.getElementById('rate-rows-' + i);
    const costWrap = document.getElementById('cost-rows-' + i);
    if (rateWrap) {
      const ta = document.createElement('textarea');
      ta.className = 'rate-edit-ta';
      ta.value = item.rates.join('\n');
      ta.dataset.lineIndex = i;
      ta.rows = Math.max(item.rates.length, 1);
      rateWrap.innerHTML = '';
      rateWrap.appendChild(ta);
    }
    if (costWrap) {
      const ta = document.createElement('textarea');
      ta.className = 'cost-edit-ta';
      ta.value = item.costs.join('\n');
      ta.dataset.lineIndex = i;
      ta.rows = Math.max(item.costs.length, 1);
      ta.addEventListener('input', updateAutoSumHint);
      costWrap.innerHTML = '';
      costWrap.appendChild(ta);
    }
    
    const tr = rateWrap ? rateWrap.closest('tr') : costWrap.closest('tr');
    if (tr) {
      tr.style.position = 'relative';
      const delBtn = document.createElement('button');
      delBtn.innerHTML = '✕';
      delBtn.className = 'delete-row-btn';
      delBtn.title = 'Remove line item';
      delBtn.onclick = () => removeLineItem(i);
      tr.querySelector('.col-service').appendChild(delBtn);

      const moveLineItem = (fromIdx, dir) => {
        const d = extractEditData();
        const items = d.lineItems;
        const toIdx = fromIdx + dir;
        if (toIdx < 0 || toIdx >= items.length) return;
        [items[fromIdx], items[toIdx]] = [items[toIdx], items[fromIdx]];
        d.dateOverride = d.date;
        d.receiptOverride = d.receiptNumber;
        document.getElementById('invoice-data').textContent = JSON.stringify(d, null, 2);
        render(d);
        startEdit();
      };

      const upBtn = document.createElement('button');
      upBtn.textContent = '↑';
      upBtn.className = 'delete-row-btn';
      upBtn.title = 'Move up';
      upBtn.style.cssText = 'right:auto; left:calc(100% + 2px); top:8px; font-size:10px;';
      upBtn.onclick = () => moveLineItem(i, -1);

      const downBtn = document.createElement('button');
      downBtn.textContent = '↓';
      downBtn.className = 'delete-row-btn';
      downBtn.title = 'Move down';
      downBtn.style.cssText = 'right:auto; left:calc(100% + 22px); top:8px; font-size:10px;';
      downBtn.onclick = () => moveLineItem(i, 1);

      tr.querySelector('.col-service').appendChild(upBtn);
      tr.querySelector('.col-service').appendChild(downBtn);

      const dupBtn = document.createElement('button');
      dupBtn.innerHTML = '⎘';
      dupBtn.className = 'delete-row-btn';
      dupBtn.title = 'Duplicate line item';
      dupBtn.style.cssText = 'right:auto; left:calc(100% + 42px); top:8px; font-size:11px;';
      dupBtn.onclick = () => duplicateLineItem(i);
      tr.querySelector('.col-service').appendChild(dupBtn);

      // Drag handle for HTML5 drag-and-drop reordering
      const handle = document.createElement('span');
      handle.className = 'drag-handle';
      handle.textContent = '≡';
      handle.title = 'Drag to reorder';
      tr.querySelector('.col-service').insertBefore(handle, tr.querySelector('.col-service').firstChild);

      tr.draggable = true;
      tr.dataset.lineIdx = String(i);
      tr.addEventListener('dragstart', e => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(i));
        tr.style.opacity = '0.5';
      });
      tr.addEventListener('dragend', () => { tr.style.opacity = ''; tr.classList.remove('drag-over'); });
      tr.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; tr.classList.add('drag-over'); });
      tr.addEventListener('dragleave', () => tr.classList.remove('drag-over'));
      tr.addEventListener('drop', e => {
        e.preventDefault();
        tr.classList.remove('drag-over');
        const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
        const toIdx = i;
        if (fromIdx === toIdx) return;
        const d = extractEditData();
        const items = d.lineItems;
        const [moved] = items.splice(fromIdx, 1);
        items.splice(toIdx, 0, moved);
        d.dateOverride = d.date;
        d.receiptOverride = d.receiptNumber;
        document.getElementById('invoice-data').textContent = JSON.stringify(d, null, 2);
        render(d);
        startEdit();
      });
    }
  });
  const pn = document.getElementById('payment-note-el');
  if (pn) { pn.contentEditable = 'true'; pn.spellcheck = false; pn.dataset.field = 'paymentNote'; }

  // Invoice notes — always show wrap in edit mode so user can type into it
  const notesWrapEdit = document.getElementById('invoice-notes-wrap');
  const notesElEdit   = document.getElementById('invoice-notes-el');
  if (notesWrapEdit && notesElEdit) {
    notesWrapEdit.style.display = 'block';
    notesElEdit.contentEditable = 'true';
    notesElEdit.spellcheck = false;
    notesElEdit.placeholder = 'Invoice notes, payment terms, or bank details…';
    notesElEdit.style.minHeight = '32px';
    notesElEdit.style.outline = 'none';
    notesElEdit.style.color = '#14202e';
    // Char counter
    let notesCounter = document.getElementById('notes-char-counter');
    if (!notesCounter) {
      notesCounter = document.createElement('div');
      notesCounter.id = 'notes-char-counter';
      notesCounter.style.cssText = 'font-size:10px; color:#9aa2ac; text-align:right; margin-top:3px; font-family:Roboto,sans-serif;';
      notesWrapEdit.appendChild(notesCounter);
    }
    const updateCounter = () => {
      const text = notesElEdit.innerText || '';
      const chars = text.length;
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      notesCounter.textContent = `${chars} chars · ${words} words`;
    };
    notesElEdit.addEventListener('input', updateCounter);
    updateCounter();
  }
  // visibility handled by body.editing CSS class
  // Sync slider to current rendered font size
  const titleEl = document.querySelector('.invoice-word');
  if (titleEl) {
    const curPx = Math.min(120, Math.max(36, Math.round(parseFloat(getComputedStyle(titleEl).fontSize))));
    const slider = document.getElementById('title-size-slider');
    if (slider) { slider.value = curPx; document.getElementById('title-size-label').textContent = curPx + 'px'; }
  }
  // Pay Period quick-select
  const ppSpan = document.querySelector('[data-field="payPeriod"]');
  if (ppSpan && !ppSpan.querySelector('select')) {
    const currentPP = ppSpan.textContent.trim();
    const ppSel = document.createElement('select');
    ppSel.className = 'pay-period-select';
    ppSel.style.cssText = 'font-family:inherit; font-size:inherit; color:inherit; background:transparent; border:none; border-bottom:1.5px dashed var(--rule); outline:none; cursor:pointer; padding:0 2px;';
    ['Due on Receipt','Net 7','Net 14','Net 30','Net 60'].forEach(opt => {
      const o = document.createElement('option');
      o.value = opt; o.textContent = opt;
      if (opt === currentPP) o.selected = true;
      ppSel.appendChild(o);
    });
    ppSpan.contentEditable = 'false';
    ppSpan.textContent = '';
    ppSpan.appendChild(ppSel);
  }

  // Currency quick-select: only in the meta row (not the ptv display span)
  const metaCurrSpan = document.querySelector('.meta [data-field="currency"]');
  if (metaCurrSpan && !metaCurrSpan.querySelector('select')) {
    const current = metaCurrSpan.textContent.trim();
    const sel = document.createElement('select');
    sel.className = 'currency-select';
    sel.style.cssText = 'font-family:inherit; font-size:inherit; font-weight:inherit; color:inherit; background:transparent; border:none; border-bottom:1.5px dashed var(--rule); outline:none; cursor:pointer; padding:0 2px;';
    ['USD','JMD','EUR','GBP','CAD','AUD','TTD'].forEach(c => {
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = c;
      if (c === current) opt.selected = true;
      sel.appendChild(opt);
    });
    metaCurrSpan.contentEditable = 'false';
    metaCurrSpan.textContent = '';
    metaCurrSpan.appendChild(sel);
  }

  // Payments edit UI
  renderPaymentsEdit();

  updateAutoSumHint();
}

function renderPaymentsEdit() {
  const data = getData();
  const payments = Array.isArray(data.payments) ? data.payments : [];
  const listEl = document.getElementById('payments-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  if (!document.body.classList.contains('editing')) {
    renderPaymentsDisplay(payments, data);
    return;
  }

  const wrap = document.createElement('div');
  wrap.id = 'payments-edit-wrap';
  wrap.style.cssText = 'margin:6px 0 2px; font-family:Roboto,sans-serif;';

  payments.forEach((p, idx) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex; gap:6px; align-items:center; margin-bottom:4px;';
    const labelInp = document.createElement('input');
    labelInp.value = p.label || '';
    labelInp.placeholder = 'e.g. Deposit';
    labelInp.style.cssText = 'flex:1; font-family:Roboto,sans-serif; font-size:11px; padding:3px 6px; border:1px solid #ddd; border-radius:4px;';
    labelInp.oninput = () => { const d = getData(); if (d.payments[idx]) { d.payments[idx].label = labelInp.value; document.getElementById('invoice-data').textContent = JSON.stringify(d, null, 2); updateAutoSumHint(); renderPaymentsDisplay(d.payments, d); } };
    const amtInp = document.createElement('input');
    amtInp.value = p.amount || '';
    amtInp.placeholder = '0.00';
    amtInp.style.cssText = 'width:80px; font-family:Roboto,sans-serif; font-size:11px; padding:3px 6px; border:1px solid #ddd; border-radius:4px; text-align:right;';
    amtInp.oninput = () => { const d = getData(); if (d.payments[idx]) { d.payments[idx].amount = amtInp.value; document.getElementById('invoice-data').textContent = JSON.stringify(d, null, 2); updateAutoSumHint(); renderPaymentsDisplay(d.payments, d); } };
    const del = document.createElement('button');
    del.textContent = '✕';
    del.style.cssText = 'background:none; border:none; color:#9aa2ac; cursor:pointer; font-size:12px; padding:2px 4px;';
    del.onclick = () => { const d = getData(); d.payments.splice(idx, 1); document.getElementById('invoice-data').textContent = JSON.stringify(d, null, 2); renderPaymentsEdit(); updateAutoSumHint(); renderPaymentsDisplay(d.payments, d); };
    row.append(labelInp, amtInp, del);
    wrap.appendChild(row);
  });

  const addBtn = document.createElement('button');
  addBtn.textContent = '+ Add Payment / Deposit';
  addBtn.style.cssText = 'font-family:Roboto,sans-serif; font-size:10.5px; color:#6c7682; background:none; border:1px dashed #ccc; border-radius:4px; padding:3px 10px; cursor:pointer; margin-top:2px; width:100%;';
  addBtn.onclick = () => { const d = getData(); if (!Array.isArray(d.payments)) d.payments = []; d.payments.push({ label: 'Deposit', amount: '' }); document.getElementById('invoice-data').textContent = JSON.stringify(d, null, 2); renderPaymentsEdit(); };
  wrap.appendChild(addBtn);
  listEl.appendChild(wrap);
}

function renderPaymentsDisplay(payments, data) {
  const listEl = document.getElementById('payments-list');
  if (!listEl) return;
  if (!Array.isArray(payments) || !payments.length) { listEl.innerHTML = ''; return; }
  const parseAmt = s => parseFloat((s || '').toString().replace(/[^0-9.]/g, '')) || 0;
  const html = payments.map(p => {
    const amt = parseAmt(p.amount);
    if (!amt) return '';
    return `<div style="display:flex;justify-content:space-between;font-size:11.5px;color:#6c7682;padding:3px 0;font-family:Roboto,sans-serif;">
      <span>${p.label || 'Payment'}</span><span style="color:#2a8c55;">− ${data.currency || ''} ${amt.toLocaleString('en-US',{minimumFractionDigits:2})}</span>
    </div>`;
  }).join('');
  if (html) listEl.innerHTML = `<div style="border-top:1px dashed #ddd;padding:6px 0 2px;margin:4px 0;">${html}</div>`;
  else listEl.innerHTML = '';
}

const escapeHTML = (str) => {
  if (typeof str !== 'string') return str;
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
};

function extractEditData() {
  const data = getData();
  document.querySelectorAll('.rate-edit-ta').forEach(function(ta) {
    const i = parseInt(ta.dataset.lineIndex);
    const vals = escapeHTML(ta.value).split('\n').map(s => s.trim()).filter(Boolean);
    data.lineItems[i].rates = vals.length ? vals : [''];
  });
  document.querySelectorAll('.cost-edit-ta').forEach(function(ta) {
    const i = parseInt(ta.dataset.lineIndex);
    const vals = escapeHTML(ta.value).split('\n').map(s => s.trim()).filter(Boolean);
    data.lineItems[i].costs = vals.length ? vals : ['0'];
  });
  document.querySelectorAll('[data-field]').forEach(el => {
    const field = el.dataset.field;
    if (field === 'from._sub') {
      let text = el.textContent;
      if (text === 'Add address / email...') text = '';
      const lines = escapeHTML(text).split('\n').map(s => s.trim()).filter(Boolean);
      // Last line is "email · phone", everything before is address
      const contactLine = lines[lines.length - 1] || '';
      const contactParts = contactLine.split(' · ').map(s => s.trim());
      const addressLines = lines.length > 1 ? lines.slice(0, -1) : [];
      data.from.address = addressLines.join('\n');
      data.from.email = contactParts[0] || '';
      data.from.phone = contactParts[1] || '';
      return;
    }
    if (field === 'to._sub') {
      let text = el.textContent;
      if (text === 'Add address / email...') text = '';
      const parts = escapeHTML(text).split(' · ').map(s => s.trim());
      data.to.address = parts[0] || '';
      data.to.email   = parts[1] || '';
      data.to.phone   = parts[2] || '';
      return;
    }
    if (field === 'date') {
      const input = el.querySelector('input[type="date"]');
      if (input && input.value) {
        const parts = input.value.split('-'); // YYYY-MM-DD
        if (parts.length === 3) {
          const formatted = `${parts[1]} / ${parts[2]} / ${parts[0]}`;
          setNestedField(data, field, formatted);
        } else {
          setNestedField(data, field, escapeHTML(el.textContent.trim()));
        }
      } else {
        setNestedField(data, field, escapeHTML(el.textContent.trim()));
      }
      return;
    }
    // Currency — only read from the meta span's select; skip all other currency spans
    if (field === 'currency') {
      const sel = el.querySelector('select.currency-select');
      if (sel) setNestedField(data, field, sel.value);
      return;
    }
    // Pay Period — read from select if present
    if (field === 'payPeriod') {
      const sel = el.querySelector('select.pay-period-select');
      if (sel) { setNestedField(data, field, sel.value); return; }
      const txt = escapeHTML(el.textContent.trim());
      if (txt) setNestedField(data, field, txt);
      return;
    }
    setNestedField(data, field, escapeHTML(el.textContent.trim()));
  });
  // Invoice notes (contentEditable div, not a data-field element)
  const notesEl = document.getElementById('invoice-notes-el');
  if (notesEl && notesEl.isContentEditable) {
    data.invoiceNotes = notesEl.innerText.trim();
  }
  return data;
}

function saveEdit() {
  const data = extractEditData();
  // Strip line items where both service and details are blank
  if (Array.isArray(data.lineItems)) {
    data.lineItems = data.lineItems.filter(item => {
      const svc = (item.service || '').trim();
      const det = (item.details || '').trim();
      return svc !== '' || det !== '';
    });
  }
  // Persist overrides so edits stick
  data.dateOverride    = data.date;
  data.receiptOverride = data.receiptNumber;
  document.getElementById('invoice-data').textContent = JSON.stringify(data, null, 2);
  localStorage.removeItem('invoicer-autosave');
  // "Saved!" feedback on sticky bar before closing
  const saveBtn = document.getElementById('btn-save-changes');
  if (saveBtn) {
    saveBtn.textContent = '✓ Saved!';
    saveBtn.style.background = '#2a8c55';
    saveBtn.disabled = true;
    setTimeout(() => {
      stopEdit();
      render(data);
      saveBtn.textContent = 'Save Changes';
      saveBtn.style.background = '#d0241b';
      saveBtn.disabled = false;
    }, 800);
  } else {
    stopEdit();
    render(data);
  }
}

function addLineItem() {
  const data = extractEditData();
  data.lineItems.push({ service: 'New Service', details: 'Details...', rates: ['Rate'], costs: ['0'] });
  document.getElementById('invoice-data').textContent = JSON.stringify(data, null, 2);
  stopEdit();
  render(data);
  startEdit();
  
  const tbody = document.getElementById('line-items');
  if (tbody && tbody.lastElementChild) {
    tbody.lastElementChild.classList.add('animate-row-in');
  }
}

function removeLineItem(index) {
  const tbody = document.getElementById('line-items');
  const trs = tbody ? tbody.querySelectorAll('tr') : [];
  if (trs[index]) {
    trs[index].classList.add('animate-row-out');
    setTimeout(() => {
      _executeRemoveLineItem(index);
    }, 250);
  } else {
    _executeRemoveLineItem(index);
  }
}

function _executeRemoveLineItem(index) {
  const data = extractEditData();
  data.lineItems.splice(index, 1);
  if (data.lineItems.length === 0) {
    data.lineItems.push({ service: 'Service', details: '', rates: ['Rate'], costs: ['0'] });
  }
  document.getElementById('invoice-data').textContent = JSON.stringify(data, null, 2);
  stopEdit();
  render(data);
  startEdit();
}

function duplicateLineItem(index) {
  const data = extractEditData();
  if (data.lineItems[index]) {
    data.lineItems.splice(index + 1, 0, JSON.parse(JSON.stringify(data.lineItems[index])));
    document.getElementById('invoice-data').textContent = JSON.stringify(data, null, 2);
    stopEdit();
    render(data);
    startEdit();
  }
}

// Background auto-save for drafts
setInterval(() => {
  if (document.body.classList.contains('editing')) {
    const data = extractEditData();
    localStorage.setItem('invoicer-autosave', JSON.stringify(data));
  }
}, 5000);

function cancelEdit() {
  document.getElementById('invoice-data').textContent = snapshot;
  stopEdit();
  render(getData());
}

function stopEdit() {
  document.body.classList.remove('editing');
  document.querySelectorAll('[data-field]').forEach(el => {
    el.contentEditable = 'false';
  });
  const hint = document.getElementById('autosum-hint');
  if (hint) hint.style.display = 'none';
  const bar = document.getElementById('edit-action-bar');
  if (bar) bar.style.display = 'none';
  const counter = document.getElementById('notes-char-counter');
  if (counter) counter.remove();
}

function formatCurrencyNative(amount, currencyCode = 'USD', decimals = 2) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(amount);
  } catch (e) {
    return `${currencyCode} ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
  }
}

function updateAutoSumHint() {
  const hint = document.getElementById('autosum-hint');
  if (!hint) return;
  const tas = document.querySelectorAll('.cost-edit-ta');
  if (!tas.length) { hint.style.display = 'none'; return; }
  let total = 0;
  tas.forEach(ta => {
    ta.value.split('\n').forEach(line => {
      total += parseFloat(line.replace(/[^0-9.]/g, '')) || 0;
    });
  });
  const currencyEl = document.querySelector('[data-field="currency"]');
  const currencyCode = currencyEl ? currencyEl.textContent.trim() : 'USD';
  const formattedTotal = formatCurrencyNative(total, currencyCode);
  hint.textContent = `Line items sum to ${formattedTotal}`;
  hint.style.display = 'block';

  const ptEl = document.querySelector('[data-field="projectTotal"]');
  if (ptEl && ptEl.textContent !== formattedTotal && document.body.classList.contains('editing')) {
    ptEl.textContent = formattedTotal;
    ptEl.classList.remove('flash-success');
    void ptEl.offsetWidth; // trigger reflow
    ptEl.classList.add('flash-success');
  }
}

function setNestedField(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = isNaN(keys[i]) ? keys[i] : Number(keys[i]);
    cur = cur[k];
    if (!cur) return;
  }
  const last = isNaN(keys[keys.length - 1]) ? keys[keys.length - 1] : Number(keys[keys.length - 1]);
  cur[last] = value;
}

// ── Print & Ledger ───────────────────────────────────────────

const STATUSES = [
  { value: '⬜ Unpaid',  label: '⬜ Unpaid'  },
  { value: '💰 Deposit', label: '◑ Deposit'  },
  { value: '📤 Sent',    label: '📤 Sent'    },
  { value: '✅ Paid',    label: '✅ Paid'    },
];

// Ledger lives entirely in localStorage as an array of row objects
function loadLedgerRows() {
  return JSON.parse(localStorage.getItem('invoice-ledger-rows') || '[]');
}
function saveLedgerRows(rows) {
  localStorage.setItem('invoice-ledger-rows', JSON.stringify(rows));
}

function markReceiptAsSent() {
  const data = getData();
  // Read receipt from rendered DOM — avoids autoReceiptNumber() re-incrementing
  const receiptEl = document.querySelector('[data-field="receiptNumber"]');
  const receipt = (receiptEl && receiptEl.textContent.trim()) || data.receiptNumber;
  const rows = loadLedgerRows();
  const idx = rows.findIndex(r => r.receipt === receipt);
  if (idx >= 0) {
    if (rows[idx].status !== '✅ Paid') rows[idx].status = '📤 Sent';
  } else {
    const services = data.lineItems.map(l => l.service).join(', ');
    rows.push({
      receipt:      receipt,
      date:         data.date,
      client:       data.to.name,
      service:      services,
      projectTotal: `${data.currency} ${data.projectTotal}`,
      amountDue:    `${data.currency} ${data.totalAmount.replace(/[^0-9.,]/g, '').trim()}`,
      status:       '📤 Sent',
    });
  }
  saveLedgerRows(rows);
  updateLedgerStatusOnSheet(receipt, '📤 Sent');
}

let _pendingRow = null; // the row object for the current invoice, set on dialog open

async function confirmPrint() {
  const data = getData();
  const services = data.lineItems.map(l => l.service).join(', ');
  _pendingRow = {
    receipt:      data.receiptNumber,
    date:         data.date,
    client:       data.to.name,
    service:      services,
    projectTotal: `${data.currency} ${data.projectTotal}`,
    amountDue:    `${data.currency} ${data.totalAmount.replace(/[^0-9.,]/g, '').trim()}`,
    status:       '⬜ Unpaid',
  };

  // Show the row that will be added
  const preview = `| ${_pendingRow.receipt} | ${_pendingRow.date} | ${_pendingRow.client} | ${_pendingRow.service} | ${_pendingRow.projectTotal} | ${_pendingRow.amountDue} | ${_pendingRow.status} |`;
  document.getElementById('ledger-preview').textContent = preview;
  document.getElementById('ledger-confirm').style.display = 'none';

  await renderLedgerHistory();
  renderFilenamePresets();
  renderTemplateSelect();
  refreshGmailIdStatus();
  refreshSheetsIdStatus();

  // Focus the search input so it's ready for filtering
  setTimeout(() => {
    const searchInput = document.getElementById('ledger-search');
    if (searchInput) searchInput.focus();
  }, 50);

  document.getElementById('print-overlay').style.display = 'flex';
}

async function renderLedgerHistory() {
  // Load from sheet if token is valid, otherwise fall back to localStorage
  let rows = await loadLedgerFromSheet();

  // Fallback to localStorage if sheet unavailable
  if (!rows) {
    rows = loadLedgerRows();
  } else {
    saveLedgerRows(rows); // warm localStorage cache so dashboard works on new devices
  }

  const histEl = document.getElementById('ledger-history');
  const listEl = document.getElementById('ledger-rows-list');
  listEl.innerHTML = '';

  if (!rows.length) { histEl.style.display = 'none'; return; }
  histEl.style.display = 'block';

  // ── Summary bar (always rebuild) ──
  const parseAmount = str => parseFloat((str || '').replace(/[^0-9.]/g, '')) || 0;
  const getCurrency = str => { const m = (str || '').match(/^([a-zA-Z]{2,4})/); return m ? m[1].toUpperCase() : 'USD'; };
  const fmt = (n, cur) => formatCurrencyNative(n, cur);

  const totalsByCurrency = {};
  rows.forEach(r => {
    const cur = getCurrency(r.amountDue || '');
    if (!totalsByCurrency[cur]) totalsByCurrency[cur] = { paid: 0, outstanding: 0, overdue: 0 };
    
    if (r.status === '✅ Paid') {
      totalsByCurrency[cur].paid += parseAmount(r.amountDue);
    } else {
      totalsByCurrency[cur].outstanding += parseAmount(r.amountDue);
      
      const rowDate = typeof parseRowDate === 'function' ? parseRowDate(r.date) : new Date(r.date);
      const isOverdue = rowDate && !isNaN(rowDate.valueOf()) &&
        (new Date() - rowDate) / (1000 * 60 * 60 * 24) > (parseInt(r.payPeriod) || 30);
        
      if (isOverdue) totalsByCurrency[cur].overdue += parseAmount(r.amountDue);
    }
  });

  let summaryEl = document.getElementById('ledger-summary');
  if (!summaryEl) {
    summaryEl = document.createElement('div');
    summaryEl.id = 'ledger-summary';
    summaryEl.style.cssText = 'display:flex; gap:10px; flex-wrap:wrap; margin-bottom:8px; align-items:center;';
    listEl.before(summaryEl);
  }
  
  let summaryHtml = '';
  for (const [cur, totals] of Object.entries(totalsByCurrency)) {
    if (totals.outstanding > 0) summaryHtml += `<span style="font-size:11px; background:#f6f6f4; color:#14202e; border-radius:4px; padding:3px 8px; font-weight:600;">Outstanding ${fmt(totals.outstanding, cur)}</span>\n`;
    if (totals.overdue > 0) summaryHtml += `<span style="font-size:11px; background:#ffebee; color:#c62828; border-radius:4px; padding:3px 8px; font-weight:600;">Overdue ${fmt(totals.overdue, cur)}</span>\n`;
    if (totals.paid > 0) summaryHtml += `<span style="font-size:11px; background:#e8f5e9; color:#2e7d32; border-radius:4px; padding:3px 8px; font-weight:600;">Paid ${fmt(totals.paid, cur)}</span>\n`;
  }
  if (!summaryHtml) {
    summaryHtml = `<span style="font-size:11px; background:#f6f6f4; color:#6c7682; border-radius:4px; padding:3px 8px; font-weight:600;">$0.00</span>\n`;
  }
  summaryHtml += `<span style="font-size:11px; color:#9aa2ac; padding:3px 0; margin-left: auto;">${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}</span>`;
  summaryEl.innerHTML = summaryHtml;

  // ── Search filter & Export ──
  let searchContainer = document.getElementById('ledger-search-container');
  let searchEl = document.getElementById('ledger-search');
  if (!searchContainer) {
    searchContainer = document.createElement('div');
    searchContainer.id = 'ledger-search-container';
    searchContainer.style.cssText = 'display:flex; gap:8px; margin-bottom:8px;';

    searchEl = document.createElement('input');
    searchEl.id = 'ledger-search';
    searchEl.type = 'text';
    searchEl.placeholder = 'Filter by client or receipt…';
    searchEl.style.cssText = 'flex:1; font-family:Roboto,sans-serif; font-size:12px; padding:6px 10px; border:1.5px solid rgba(20,32,46,0.13); border-radius:6px; min-width:0; box-sizing:border-box; outline:none; color:#14202e;';
    searchEl.oninput = () => {
      const q = searchEl.value.toLowerCase();
      const sf = window.ledgerStatusFilter || 'all';
      const activeListEl = document.getElementById('ledger-rows-list');
      if (!activeListEl) return;
      activeListEl.querySelectorAll('.ledger-row').forEach(el => {
        const textMatch = el.dataset.search.includes(q);
        let statusMatch = true;
        if (sf !== 'all') {
          const rowStatus = (el.dataset.status || '');
          if (sf === 'paid') statusMatch = rowStatus.includes('✅');
          else if (sf === 'unpaid') statusMatch = !rowStatus.includes('✅');
          else if (sf === 'overdue') statusMatch = el.dataset.overdue === '1';
        }
        const match = textMatch && statusMatch;
        el.style.display = match ? '' : 'none';
        const textSpan = el.querySelector('.ledger-row-text');
        if (textSpan) {
          if (!q) {
            textSpan.innerHTML = textSpan.dataset.originalHtml;
          } else {
            const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(${escapeRegExp(q)})`, 'gi');
            const receipt = textSpan.dataset.receipt;
            const client = textSpan.dataset.client;
            const service = textSpan.dataset.service;
            const hlReceipt = receipt.replace(regex, '<mark style="background:#ffeb3b; padding:0 2px; border-radius:2px;">$1</mark>');
            const hlClient = client.replace(regex, '<mark style="background:#ffeb3b; padding:0 2px; border-radius:2px;">$1</mark>');
            const serviceText = (service || '').trim();
            const serviceTrunc = serviceText.length > 30 ? serviceText.substring(0, 30) + '…' : serviceText;
            const hlService = serviceTrunc.replace(regex, '<mark style="background:#ffeb3b; padding:0 2px; border-radius:2px;">$1</mark>');
            const serviceHtml = hlService ? `<br><span style="color:#9aa2ac; font-size:10px;">${hlService}</span>` : '';
            textSpan.innerHTML = `<strong>${hlReceipt}</strong> · ${hlClient}${serviceHtml ? serviceHtml : '<br>'}`;
          }
        }
      });
      const badge = document.getElementById('ledger-count-badge');
      if (badge) {
        let count = 0;
        activeListEl.querySelectorAll('.ledger-row').forEach(el => {
          if (el.style.display !== 'none') count++;
        });
        badge.textContent = count + (count === 1 ? ' entry' : ' entries');
        badge.style.display = 'inline-block';
      }
      if (typeof window._ledgerSyncSelectAll === 'function') window._ledgerSyncSelectAll();
    };
    
    const exportBtn = document.createElement('button');
    exportBtn.title = 'Export Ledger to CSV';
    exportBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>';
    exportBtn.style.cssText = 'display:flex; align-items:center; justify-content:center; padding:0 12px; background:#fff; border:1.5px solid rgba(20,32,46,0.13); border-radius:6px; color:#14202e; cursor:pointer; flex-shrink:0;';
    exportBtn.onclick = () => exportLedgerCsv();
    exportBtn.onmouseover = () => exportBtn.style.background = '#f5f5f5';
    exportBtn.onmouseout = () => exportBtn.style.background = '#fff';
    
    searchContainer.appendChild(searchEl);
    searchContainer.appendChild(exportBtn);
    summaryEl.after(searchContainer);

    const batchBar = document.createElement('div');
    batchBar.id = 'ledger-batch-bar';
    batchBar.style.cssText = 'display:none; align-items:center; gap:10px; padding:6px 10px; background:#e8f0fe; border-radius:6px; margin-bottom:8px; font-size:12px; font-family:Roboto,sans-serif;';
    batchBar.innerHTML = '<span id="ledger-batch-count"></span>';

    const batchPaidBtn = document.createElement('button');
    batchPaidBtn.textContent = '✅ Mark as Paid';
    batchPaidBtn.style.cssText = 'padding:4px 12px; background:#14202e; color:#fff; border:none; border-radius:5px; font-size:11px; font-weight:600; cursor:pointer; font-family:Roboto,sans-serif;';
    batchPaidBtn.onclick = () => {
      const checked = document.querySelectorAll('.ledger-row-check:checked');
      if (!checked.length) return;
      const lrows = loadLedgerRows();
      checked.forEach(cb => {
        const idx = parseInt(cb.dataset.idx);
        if (!isNaN(idx) && lrows[idx]) lrows[idx].status = '✅ Paid';
      });
      saveLedgerRows(lrows);
      renderLedgerHistory();
    };
    const batchClearBtn = document.createElement('button');
    batchClearBtn.textContent = 'Clear';
    batchClearBtn.style.cssText = 'padding:4px 10px; background:transparent; color:#14202e; border:1.5px solid rgba(20,32,46,0.2); border-radius:5px; font-size:11px; cursor:pointer; font-family:Roboto,sans-serif;';
    batchClearBtn.onclick = () => {
      document.querySelectorAll('.ledger-row-check').forEach(cb => { cb.checked = false; });
      const sa = document.getElementById('ledger-select-all');
      if (sa) { sa.checked = false; sa.indeterminate = false; }
      document.getElementById('ledger-batch-bar').style.display = 'none';
    };
    batchBar.appendChild(batchPaidBtn);
    batchBar.appendChild(batchClearBtn);
    searchContainer.after(batchBar);

    const selectAllRow = document.createElement('div');
    selectAllRow.id = 'ledger-select-all-row';
    selectAllRow.style.cssText = 'display:flex; align-items:center; gap:6px; padding:2px 2px 6px; font-size:11px; color:#6c7682;';
    const selectAllCb = document.createElement('input');
    selectAllCb.type = 'checkbox';
    selectAllCb.id = 'ledger-select-all';
    selectAllCb.title = 'Select all visible rows';
    selectAllCb.style.cssText = 'cursor:pointer; accent-color:#14202e; width:14px; height:14px; margin:0;';
    const syncSelectAll = () => {
      const lEl = document.getElementById('ledger-rows-list');
      if (!lEl) return;
      const visibleCbs = lEl.querySelectorAll('.ledger-row:not([style*="display: none"]):not([style*="display:none"]) .ledger-row-check');
      const visibleChecked = [...visibleCbs].filter(c => c.checked).length;
      selectAllCb.indeterminate = visibleChecked > 0 && visibleChecked < visibleCbs.length;
      selectAllCb.checked = visibleCbs.length > 0 && visibleChecked === visibleCbs.length;
    };
    window._ledgerSyncSelectAll = syncSelectAll;
    selectAllCb.addEventListener('change', () => {
      const lEl = document.getElementById('ledger-rows-list');
      if (!lEl) return;
      const visibleCbs = lEl.querySelectorAll('.ledger-row:not([style*="display: none"]):not([style*="display:none"]) .ledger-row-check');
      visibleCbs.forEach(c => { c.checked = selectAllCb.checked; });
      const bar = document.getElementById('ledger-batch-bar');
      const countEl = document.getElementById('ledger-batch-count');
      const checkedCount = lEl.querySelectorAll('.ledger-row-check:checked').length;
      if (checkedCount > 0) {
        bar.style.display = 'flex';
        countEl.textContent = `${checkedCount} selected`;
      } else {
        bar.style.display = 'none';
      }
    });
    const selectAllLabel = document.createElement('label');
    selectAllLabel.htmlFor = 'ledger-select-all';
    selectAllLabel.textContent = 'Select all';
    selectAllLabel.style.cssText = 'cursor:pointer; user-select:none;';
    selectAllRow.appendChild(selectAllCb);
    selectAllRow.appendChild(selectAllLabel);
    batchBar.after(selectAllRow);

    const pillBar = document.createElement('div');
    pillBar.id = 'ledger-pill-bar';
    pillBar.style.cssText = 'display:flex; gap:6px; margin-bottom:8px; flex-wrap:wrap;';
    const pillDefs = [
      { key: 'all', label: 'All' },
      { key: 'unpaid', label: 'Unpaid' },
      { key: 'paid', label: 'Paid' },
      { key: 'overdue', label: 'Overdue' },
    ];
    window.ledgerStatusFilter = window.ledgerStatusFilter || 'all';
    const pillEls = {};
    const activePillStyle = 'padding:3px 10px; border-radius:12px; font-size:11px; font-family:Roboto,sans-serif; cursor:pointer; border:1.5px solid #14202e; background:#14202e; color:#fff; font-weight:600; transition:all 0.12s;';
    const inactivePillStyle = 'padding:3px 10px; border-radius:12px; font-size:11px; font-family:Roboto,sans-serif; cursor:pointer; border:1.5px solid rgba(20,32,46,0.18); background:#fff; color:#6c7682; font-weight:400; transition:all 0.12s;';
    pillDefs.forEach(({ key, label }) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText = key === window.ledgerStatusFilter ? activePillStyle : inactivePillStyle;
      btn.onclick = () => {
        window.ledgerStatusFilter = key;
        Object.entries(pillEls).forEach(([k, el]) => {
          el.style.cssText = k === key ? activePillStyle : inactivePillStyle;
        });
        searchEl.oninput();
      };
      pillEls[key] = btn;
      pillBar.appendChild(btn);
    });
    selectAllRow.after(pillBar);
  } else {
    searchEl.value = '';
  }

  // ── Sort Control ──
  let sortCtrl = document.getElementById('ledger-sort-ctrl');
  if (!sortCtrl) {
    sortCtrl = document.createElement('div');
    sortCtrl.id = 'ledger-sort-ctrl';
    sortCtrl.style.cssText = 'display:flex; gap:12px; font-size:11px; color:#6c7682; margin-bottom:10px; padding:0 4px;';
    searchEl.after(sortCtrl);
  }
  
  window.ledgerSortConfig = window.ledgerSortConfig || { key: 'status', dir: 1 };
  const sortKeys = [
    { key: 'date', label: 'Date' },
    { key: 'client', label: 'Client' },
    { key: 'amount', label: 'Amount' },
    { key: 'status', label: 'Status' }
  ];
  
  window.ledgerGroupByClient = window.ledgerGroupByClient || false;
  sortCtrl.innerHTML = '';
  sortKeys.forEach(sk => {
    const btn = document.createElement('div');
    const isActive = window.ledgerSortConfig.key === sk.key;
    const arrow = isActive ? (window.ledgerSortConfig.dir === 1 ? '↓' : '↑') : '';
    btn.textContent = `${sk.label} ${arrow}`;
    btn.style.cssText = `cursor:pointer; font-weight:${isActive ? 700 : 500}; color:${isActive ? '#14202e' : '#6c7682'}; transition:color 0.15s;`;
    btn.onclick = () => {
      window.ledgerGroupByClient = false;
      if (window.ledgerSortConfig.key === sk.key) {
        window.ledgerSortConfig.dir *= -1;
      } else {
        window.ledgerSortConfig.key = sk.key;
        window.ledgerSortConfig.dir = 1;
      }
      renderLedgerHistory();
    };
    sortCtrl.appendChild(btn);
  });
  // By Client toggle
  const groupBtn = document.createElement('div');
  groupBtn.textContent = 'By Client';
  groupBtn.style.cssText = `cursor:pointer; font-weight:${window.ledgerGroupByClient ? 700 : 500}; color:${window.ledgerGroupByClient ? '#14202e' : '#6c7682'}; margin-left:auto; transition:color 0.15s;`;
  groupBtn.onclick = () => { window.ledgerGroupByClient = !window.ledgerGroupByClient; renderLedgerHistory(); };
  sortCtrl.appendChild(groupBtn);

  // ── By Client grouped view ──
  if (window.ledgerGroupByClient) {
    const parseAmount = str => parseFloat((str || '').replace(/[^0-9.]/g, '')) || 0;
    const grouped = {};
    rows.forEach((row, idx) => {
      const key = (row.client || 'Unknown').trim();
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push({ row, idx });
    });
    Object.keys(grouped).sort((a, b) => a.localeCompare(b)).forEach(client => {
      const entries = grouped[client];
      const paid = entries.filter(e => e.row.status === '✅ Paid').reduce((s, e) => s + parseAmount(e.row.amountDue), 0);
      const outstanding = entries.filter(e => e.row.status !== '✅ Paid').reduce((s, e) => s + parseAmount(e.row.amountDue), 0);
      // Client header
      const header = document.createElement('div');
      header.style.cssText = 'display:flex; align-items:center; gap:8px; padding:6px 4px 4px; margin-top:6px; border-bottom:1.5px solid rgba(20,32,46,0.08); cursor:pointer;';
      const nameSpan = document.createElement('span');
      nameSpan.textContent = client;
      nameSpan.style.cssText = 'font-size:11.5px; font-weight:700; color:#14202e; flex:1;';
      const totalsSpan = document.createElement('span');
      totalsSpan.style.cssText = 'font-size:10.5px; color:#6c7682;';
      const cur = getCurrency(entries[0].row.amountDue || '');
      const parts = [];
      if (paid > 0) parts.push(`Paid ${formatCurrencyNative(paid, cur)}`);
      if (outstanding > 0) parts.push(`Due ${formatCurrencyNative(outstanding, cur)}`);
      totalsSpan.textContent = parts.join(' · ') || '—';
      const toggle = document.createElement('span');
      toggle.textContent = '▾';
      toggle.style.cssText = 'font-size:10px; color:#9aa2ac; transition:transform 0.15s;';
      header.append(nameSpan, totalsSpan, toggle);
      listEl.appendChild(header);
      // Rows container (collapsible)
      const rowsWrap = document.createElement('div');
      rowsWrap.style.cssText = 'display:flex; flex-direction:column; gap:4px; padding-top:4px;';
      listEl.appendChild(rowsWrap);
      header.addEventListener('click', () => {
        const collapsed = rowsWrap.style.display === 'none';
        rowsWrap.style.display = collapsed ? 'flex' : 'none';
        toggle.style.transform = collapsed ? '' : 'rotate(-90deg)';
      });
      entries.forEach(({ row, idx: realIdx }) => {
        const rowDiv = document.createElement('div');
        rowDiv.style.cssText = `font-size:11px; color:#6c7682; padding:3px 8px; background:#f6f6f4; border-radius:4px; display:flex; justify-content:space-between;`;
        rowDiv.textContent = `${row.receipt} — ${row.date}`;
        const amt = document.createElement('span');
        amt.style.cssText = `font-weight:600; color:${row.status === '✅ Paid' ? '#2a8c55' : '#14202e'};`;
        amt.textContent = `${row.amountDue} ${row.status.replace(/[^\w\s]/g, '').trim()}`;
        rowDiv.appendChild(amt);
        rowsWrap.appendChild(rowDiv);
      });
    });
    const badge = document.getElementById('ledger-count-badge');
    if (badge) {
      badge.textContent = rows.length + (rows.length === 1 ? ' entry' : ' entries');
      badge.style.display = 'inline-block';
    }
    return;
  }

  // ── Row colour helper ──
  const rowBg = (row, isOverdue) => {
    if (row.status === '✅ Paid') return '#edf7f0';
    if (row.status === '💰 Deposit') return '#fff8e1';
    if (row.status === '📤 Sent') return '#eef2fb';
    if (isOverdue) return '#fdecea';
    return '#f6f6f4';
  };

  const statusWeight = s => s === '✅ Paid' ? 1 : 0;
  const sorted = rows
    .map((row, idx) => ({ row, idx }))
    .sort((a, b) => {
      let cmp = 0;
      if (window.ledgerSortConfig.key === 'date') {
        const da = typeof parseRowDate === 'function' ? parseRowDate(a.row.date) : new Date(a.row.date);
        const db = typeof parseRowDate === 'function' ? parseRowDate(b.row.date) : new Date(b.row.date);
        cmp = (da - db) || 0;
      } else if (window.ledgerSortConfig.key === 'client') {
        cmp = (a.row.client || '').localeCompare(b.row.client || '');
      } else if (window.ledgerSortConfig.key === 'amount') {
        cmp = parseAmount(a.row.amountDue) - parseAmount(b.row.amountDue);
      } else { // status
        cmp = statusWeight(a.row.status) - statusWeight(b.row.status);
      }
      if (cmp === 0) cmp = b.idx - a.idx;
      return cmp * window.ledgerSortConfig.dir;
    });

  sorted.forEach(({ row, idx: realIdx }) => {

    const rowDate = typeof parseRowDate === 'function' ? parseRowDate(row.date) : new Date(row.date);
    const isOverdue = row.status !== '✅ Paid' && rowDate && !isNaN(rowDate.valueOf()) &&
      (new Date() - rowDate) / (1000 * 60 * 60 * 24) > (parseInt(row.payPeriod) || 30);

    const wrap = document.createElement('div');
    wrap.className = 'ledger-row';
    wrap.dataset.search = `${(row.receipt || '').toLowerCase()} ${(row.client || '').toLowerCase()} ${(row.service || '').toLowerCase()}`;
    wrap.dataset.status = (row.status || '').toLowerCase();
    wrap.dataset.overdue = isOverdue ? '1' : '0';
    wrap.style.cssText = `display:flex; flex-direction:column; background:${rowBg(row, isOverdue)}; border-radius:6px; padding:8px 12px; gap:0;${isOverdue ? ' border-left:3px solid #e6a817;' : ''}`;

    const rowMain = document.createElement('div');
    rowMain.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px;';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'ledger-row-check';
    cb.dataset.idx = String(realIdx);
    cb.style.cssText = 'flex-shrink:0; cursor:pointer; accent-color:#14202e; width:14px; height:14px;';
    cb.addEventListener('change', () => {
      const bar = document.getElementById('ledger-batch-bar');
      const countEl = document.getElementById('ledger-batch-count');
      const checkedCount = document.querySelectorAll('.ledger-row-check:checked').length;
      if (checkedCount > 0) {
        bar.style.display = 'flex';
        countEl.textContent = `${checkedCount} selected`;
      } else {
        bar.style.display = 'none';
      }
      if (typeof window._ledgerSyncSelectAll === 'function') window._ledgerSyncSelectAll();
    });
    rowMain.appendChild(cb);

    const info = document.createElement('div');
    info.className = 'ledger-row-info';
    info.style.cssText = 'font-size:11.5px; color:#14202e; line-height:1.5; min-width:0; flex:1;';
    
    let overdueFlag = '';
    if (row.status !== '✅ Paid' && rowDate && !isNaN(rowDate.valueOf())) {
      const daysDiff = Math.round((new Date() - rowDate) / (1000 * 60 * 60 * 24));
      const graceDays = parseInt(row.payPeriod) || 30;
      if (daysDiff > graceDays) {
        const daysOver = daysDiff - graceDays;
        overdueFlag = `<span class="ledger-row-subtext" style="color:#d0241b; font-size:10px; font-weight:700; margin-left:6px; letter-spacing:0.3px; background:#fdecea; border-radius:3px; padding:1px 5px;">${daysOver}d overdue</span>`;
      } else if (daysDiff >= 0) {
        const daysLeft = graceDays - daysDiff;
        if (daysLeft <= 7) {
          overdueFlag = `<span class="ledger-row-subtext" style="color:#b45309; font-size:10px; font-weight:600; margin-left:6px; background:#fff8e1; border-radius:3px; padding:1px 5px;">Due in ${daysLeft}d</span>`;
        }
      }
    }

    const amountSpan = document.createElement('span');
    amountSpan.style.cssText = 'color:#6c7682; cursor:pointer; border-bottom:1px dashed transparent; transition:border-color 0.15s;';
    amountSpan.title = 'Click to edit amount';
    amountSpan.textContent = row.amountDue;
    amountSpan.addEventListener('mouseenter', () => amountSpan.style.borderBottomColor = '#9aa2ac');
    amountSpan.addEventListener('mouseleave', () => amountSpan.style.borderBottomColor = 'transparent');
    amountSpan.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = row.amountDue;
      input.style.cssText = 'font-family:Roboto,sans-serif; font-size:11.5px; color:#14202e; border:none; border-bottom:1.5px solid #1a73e8; outline:none; background:transparent; width:90px; padding:0;';
      amountSpan.replaceWith(input);
      input.focus();
      input.select();
      const commit = () => {
        const val = input.value.trim() || row.amountDue;
        rows[realIdx].amountDue = val;
        saveLedgerRows(rows);
        amountSpan.textContent = val;
        row.amountDue = val;
        input.replaceWith(amountSpan);
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') input.replaceWith(amountSpan); });
    });

    const textSpan = document.createElement('span');
    textSpan.className = 'ledger-row-text';
    textSpan.dataset.receipt = row.receipt || '';
    textSpan.dataset.client = row.client || '';
    textSpan.dataset.service = row.service || '';
    const serviceText = (row.service || '').trim();
    const serviceTrunc = serviceText.length > 30 ? serviceText.substring(0, 30) + '…' : serviceText;
    const serviceHtml = serviceTrunc ? `<br><span style="color:#9aa2ac; font-size:10px;">${serviceTrunc}</span>` : '';
    textSpan.dataset.originalHtml = `<strong>${row.receipt}</strong> · ${row.client}${serviceHtml ? serviceHtml : '<br>'}`;
    textSpan.innerHTML = textSpan.dataset.originalHtml;
    info.appendChild(textSpan);
    const datePart = document.createTextNode(` — ${row.date}`);
    info.appendChild(amountSpan);
    info.appendChild(datePart);
    if (overdueFlag) {
      const flag = document.createElement('span');
      flag.innerHTML = overdueFlag;
      info.appendChild(flag);
    }

    const sel = document.createElement('select');
    sel.setAttribute('aria-label', 'Ledger status for invoice ' + row.receipt);
    sel.style.cssText = 'font-family:Roboto,sans-serif; font-size:12px; padding:4px 8px; border:1.5px solid #ddd; border-radius:5px; background:#fff; color:#14202e; cursor:pointer; flex-shrink:0;';
    STATUSES.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.value;
      opt.textContent = s.label;
      if (s.value === row.status) opt.selected = true;
      sel.appendChild(opt);
    });

    const allocWrap = document.createElement('div');
    allocWrap.style.cssText = 'display:none; flex-direction:column; gap:8px; margin-top:10px; padding-top:10px; border-top:1px dashed #ccc;';

    sel.addEventListener('change', async () => {
      sel.disabled = true;
      try {
        rows[realIdx].status = sel.value;
        // When marking Paid, amountDue should reflect the full project total
        if (sel.value === '✅ Paid' && rows[realIdx].projectTotal) {
          rows[realIdx].amountDue = rows[realIdx].projectTotal;
          amountSpan.textContent = rows[realIdx].amountDue;
        }
        wrap.style.background = rowBg(rows[realIdx], false);
        saveLedgerRows(rows);
        const paidAmountDue = sel.value === '✅ Paid' ? rows[realIdx].amountDue : null;
        await updateLedgerStatusOnSheet(rows[realIdx].receipt, sel.value, paidAmountDue);
        if (sel.value === '✅ Paid') {
          renderAllocationUI(allocWrap, rows[realIdx]);
          allocWrap.style.display = 'flex';
        } else {
          allocWrap.style.display = 'none';
          allocWrap.innerHTML = '';
        }
      } finally {
        sel.disabled = false;
      }
    });

    // If already Paid when modal opens, show allocation UI immediately
    if (row.status === '✅ Paid') {
      renderAllocationUI(allocWrap, rows[realIdx]);
      allocWrap.style.display = 'flex';
    }

    // ── Row note ──
    const noteDisplay = document.createElement('div');
    noteDisplay.style.cssText = 'font-size:10.5px; color:#9aa2ac; margin-top:2px; font-style:italic; display:' + (row.note ? 'block' : 'none') + ';';
    noteDisplay.textContent = row.note || '';
    info.appendChild(noteDisplay);

    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.placeholder = 'Add a note…';
    noteInput.maxLength = 200;
    noteInput.value = row.note || '';
    noteInput.style.cssText = 'display:none; font-family:Roboto,sans-serif; font-size:11px; color:#14202e; border:none; border-bottom:1.5px solid #1a73e8; outline:none; background:transparent; width:100%; padding:2px 0; margin-top:4px;';
    info.appendChild(noteInput);

    const noteBtn = document.createElement('button');
    noteBtn.textContent = '✎';
    noteBtn.title = row.note ? 'Edit note' : 'Add note';
    noteBtn.style.cssText = 'background:none; border:none; cursor:pointer; font-size:11px; color:#9aa2ac; padding:2px 4px; border-radius:4px; flex-shrink:0; transition:color 0.15s;';
    noteBtn.addEventListener('mouseenter', () => noteBtn.style.color = '#14202e');
    noteBtn.addEventListener('mouseleave', () => noteBtn.style.color = row.note ? '#14202e' : '#9aa2ac');
    if (row.note) noteBtn.style.color = '#14202e';

    let noteOpen = false;
    const toggleNote = () => {
      noteOpen = !noteOpen;
      noteInput.style.display = noteOpen ? 'block' : 'none';
      noteDisplay.style.display = (!noteOpen && row.note) ? 'block' : 'none';
      if (noteOpen) { noteInput.focus(); noteInput.select(); }
    };
    noteBtn.addEventListener('click', toggleNote);

    const commitNote = () => {
      const val = noteInput.value.trim();
      rows[realIdx].note = val || '';
      row.note = val || '';
      saveLedgerRows(rows);
      noteDisplay.textContent = val;
      noteDisplay.style.display = val ? 'block' : 'none';
      noteBtn.title = val ? 'Edit note' : 'Add note';
      noteBtn.style.color = val ? '#14202e' : '#9aa2ac';
      noteOpen = false;
      noteInput.style.display = 'none';
    };
    noteInput.addEventListener('blur', commitNote);
    noteInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commitNote(); }
      if (e.key === 'Escape') { noteInput.value = row.note || ''; noteOpen = false; noteInput.style.display = 'none'; noteDisplay.style.display = row.note ? 'block' : 'none'; }
    });

    const loadBtn = document.createElement('button');
    loadBtn.textContent = '📋 Duplicate';
    loadBtn.title = 'Duplicate as new draft';
    loadBtn.style.cssText = 'font-family:Roboto,sans-serif; font-size:11px; padding:4px 8px; border:1.5px solid rgba(20,32,46,0.18); border-radius:5px; background:#fff; color:#14202e; cursor:pointer; flex-shrink:0;';
    loadBtn.addEventListener('click', () => loadInvoiceFromLedger(row));

    const delBtn = document.createElement('button');
    delBtn.textContent = '🗑';
    delBtn.title = 'Delete ledger entry';
    delBtn.style.cssText = 'background:none; border:none; cursor:pointer; font-size:12px; color:#9aa2ac; padding:4px; border-radius:4px; flex-shrink:0; transition:color 0.15s; margin-left:4px;';
    delBtn.addEventListener('mouseenter', () => delBtn.style.color = '#d0241b');
    delBtn.addEventListener('mouseleave', () => delBtn.style.color = '#9aa2ac');
    delBtn.addEventListener('click', () => {
      if (confirm(`Delete ledger entry for ${row.receipt}?`)) {
        rows.splice(realIdx, 1);
        saveLedgerRows(rows);
        renderLedgerHistory();
      }
    });

    // ── Row expand panel (click info to toggle) ──
    const expandPanel = document.createElement('div');
    expandPanel.style.cssText = 'display:none; flex-direction:column; gap:6px; margin-top:8px; padding-top:8px; border-top:1px solid rgba(20,32,46,0.08); font-size:11px; color:#6c7682;';

    const detailsGrid = document.createElement('div');
    detailsGrid.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:4px 16px;';
    const field = (label, value) => {
      const d = document.createElement('div');
      d.innerHTML = `<span style="color:#9aa2ac; font-size:10px; text-transform:uppercase; letter-spacing:0.5px;">${label}</span><br><span style="color:#14202e; font-weight:500;">${value || '—'}</span>`;
      return d;
    };
    detailsGrid.append(
      field('Project Total', row.projectTotal || row.amountDue),
      field('Amount Due', row.amountDue),
      field('Service', row.service || '—'),
      field('Pay Period', row.payPeriod || '—')
    );

    const openBtn = document.createElement('button');
    openBtn.textContent = '↗ Open Invoice';
    openBtn.style.cssText = 'align-self:flex-start; font-family:Roboto,sans-serif; font-size:11px; padding:4px 10px; background:#14202e; color:#fff; border:none; border-radius:5px; cursor:pointer; margin-top:2px;';
    openBtn.addEventListener('click', e => { e.stopPropagation(); loadInvoiceFromLedger(row); document.getElementById('print-overlay').style.display = 'none'; });

    expandPanel.append(detailsGrid, openBtn);

    let expanded = false;
    info.style.cursor = 'pointer';
    info.title = 'Click to expand';
    info.addEventListener('click', () => {
      expanded = !expanded;
      expandPanel.style.display = expanded ? 'flex' : 'none';
    });

    rowMain.append(info, noteBtn, loadBtn, sel, delBtn);
    wrap.append(rowMain, expandPanel, allocWrap);
    listEl.appendChild(wrap);
  });
  if (searchEl && searchEl.oninput) searchEl.oninput();
}

async function updateLedger() {
  const rows = loadLedgerRows();
  const data = getData();

  // Add new row if not already present
  if (!rows.find(r => r.receipt === _pendingRow.receipt)) {
    rows.push({ ..._pendingRow });
    saveLedgerRows(rows);
  }

  // Save client to address book
  if (data.to?.name) {
    upsertClient({ name: data.to.name, address: data.to.address || '', email: data.to.email || '', phone: data.to.phone || '' });
    renderClientChips();
  }

  // Sync to Google Sheets if configured
  if (_sheetsSpreadsheetId && _gmailToken) {
    await syncToGoogleSheets(data);
  }

  // Re-render history so the new row appears with a status selector
  renderLedgerHistory();

  const confirmEl = document.getElementById('ledger-confirm');
  confirmEl.style.display = 'block';
  confirmEl.style.color   = '#2a8c55';
  confirmEl.textContent   = `✓ Saved — ${rows.length} entr${rows.length === 1 ? 'y' : 'ies'} in ledger${_sheetsSpreadsheetId ? ' & synced to Sheets' : ''}.`;
}

function loadInvoiceFromLedger(row) {
  const existing = getData();
  // Parse amountDue — strip currency prefix, keep numeric string
  const rawAmt = (row.amountDue || '').replace(/^[a-zA-Z$]+\s*/i, '').trim();
  const prevReceipt = existing.receiptOverride || existing.receiptNumber || '';
  const newReceipt = nextReceiptNumber(prevReceipt ? prevReceipt.trim() : '');

  const draft = {
    ...existing,
    dateOverride:    '',
    receiptOverride: newReceipt,
    to: {
      name:    row.client  || existing.to.name,
      address: existing.to.address || '',
      email:   existing.to.email   || '',
      phone:   existing.to.phone   || '',
    },
    lineItems: [{
      service: row.service || 'Service',
      details: '',
      rates:   ['Rate'],
      costs:   [rawAmt || '0'],
    }],
    projectTotal:     rawAmt || '0',
    totalAmount:      row.amountDue || existing.totalAmount,
  };
  document.getElementById('invoice-data').textContent = JSON.stringify(draft, null, 2);
  render(getData());
  closeDialog();
  showToast(`Loaded ${row.client} — ready to edit`, 'success');
}

// ── Invoice Templates ──────────────────────────────────────────────────────────
const TEMPLATE_KEY = 'invoice-templates';
const TEMPLATE_FIELDS = ['lineItems','paymentNote','payPeriod','currency','projectTotal','totalAmount','totalLabelTop','totalLabelBottom'];

function loadTemplates() {
  try { return JSON.parse(localStorage.getItem(TEMPLATE_KEY) || '[]'); } catch { return []; }
}
function saveTemplates(list) { localStorage.setItem(TEMPLATE_KEY, JSON.stringify(list)); }

function renderTemplateSelect() {
  const sel = document.getElementById('template-select');
  if (!sel) return;
  const list = loadTemplates();
  sel.innerHTML = '<option value="">— select a template —</option>';
  list.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    sel.appendChild(opt);
  });
}

function saveInvoiceTemplate() {
  const nameInput = document.getElementById('template-name-input');
  const name = (nameInput?.value || '').trim();
  if (!name) { showToast('Enter a template name first', 'info'); nameInput?.focus(); return; }
  const data = getData();
  const snapshot = {};
  TEMPLATE_FIELDS.forEach(k => { if (data[k] !== undefined) snapshot[k] = data[k]; });
  const list = loadTemplates();
  const existing = list.findIndex(t => t.name.toLowerCase() === name.toLowerCase());
  const entry = { id: Date.now().toString(36), name, data: snapshot };
  if (existing >= 0) { list[existing] = entry; } else { list.push(entry); }
  saveTemplates(list);
  renderTemplateSelect();
  document.getElementById('template-select').value = entry.id;
  if (nameInput) nameInput.value = '';
  showToast(`Template "${name}" saved`, 'success');
}

function loadInvoiceTemplate() {
  const sel = document.getElementById('template-select');
  const id = sel?.value;
  if (!id) { showToast('Select a template first', 'info'); return; }
  const list = loadTemplates();
  const tpl = list.find(t => t.id === id);
  if (!tpl) { showToast('Template not found', 'info'); return; }
  const current = getData();
  TEMPLATE_FIELDS.forEach(k => { if (tpl.data[k] !== undefined) current[k] = tpl.data[k]; });
  document.getElementById('invoice-data').textContent = JSON.stringify(current, null, 2);
  closeDialog();
  render(current);
  showToast(`Template "${tpl.name}" loaded`, 'success');
  startEdit();
}

function deleteInvoiceTemplate() {
  const sel = document.getElementById('template-select');
  const id = sel?.value;
  if (!id) { showToast('Select a template to delete', 'info'); return; }
  const list = loadTemplates();
  const tpl = list.find(t => t.id === id);
  if (!tpl) return;
  if (!confirm(`Delete template "${tpl.name}"?`)) return;
  saveTemplates(list.filter(t => t.id !== id));
  renderTemplateSelect();
  showToast(`Template "${tpl.name}" deleted`, 'info');
}

function getExportRows() {
  const filter = (document.getElementById('ledger-export-filter')?.value || '').trim();
  const all = loadLedgerRows();
  return filter ? all.filter(r => r.status === filter) : all;
}

function exportLedger() {
  const rows = getExportRows();
  const header = `# Invoice Ledger\n\n> Auto-updated when invoices are printed/saved to PDF.\n> Set status to \`✅ Paid\` once payment is confirmed.\n\n| Receipt # | Date | Client | Service | Project Total | Amount Due | Status | Note |\n|-----------|------|--------|---------|---------------|------------|--------|------|\n`;
  const body   = rows.map(r => `| ${r.receipt} | ${r.date} | ${r.client} | ${r.service} | ${r.projectTotal} | ${r.amountDue} | ${r.status} | ${(r.note || '').replace(/\|/g, '\\|')} |`).join('\n');
  const blob   = new Blob([header + body + '\n'], { type: 'text/markdown' });
  const a      = document.createElement('a');
  a.href       = URL.createObjectURL(blob);
  a.download   = 'InvoiceLedger.md';
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportLedgerCsv() {
  const rows = getExportRows();
  const escape = v => `"${String(v || '').replace(/"/g, '""')}"`;
  const headers = ['Receipt #', 'Date', 'Client', 'Service', 'Project Total', 'Amount Due', 'Status', 'Note'];
  const lines = [
    headers.map(escape).join(','),
    ...rows.map(r => [r.receipt, r.date, r.client, r.service, r.projectTotal, r.amountDue, r.status, r.note || ''].map(escape).join(','))
  ];
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const filter = (document.getElementById('ledger-export-filter')?.value || '').replace(/[^a-zA-Z]/g, '').toLowerCase();
  a.download = `invoicer-ledger${filter ? '-' + filter : ''}-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast(`Ledger exported as CSV${rows.length < loadLedgerRows().length ? ' (' + rows.length + ' rows)' : ''}`, 'success');
}

function copyShareLink(btn) {
  const data = getData();
  const json = JSON.stringify(data);
  const base64 = btoa(encodeURIComponent(json));
  const url = window.location.origin + window.location.pathname + '#data=' + base64;
  navigator.clipboard.writeText(url).then(() => {
    const orig = btn.innerHTML;
    btn.innerHTML = '✓ Copied!';
    setTimeout(() => { btn.innerHTML = orig; }, 2000);
  }).catch(e => {
    console.error('Failed to copy', e);
    showToast('Failed to copy to clipboard', 'error');
  });
}

// ── Filename ─────────────────────────────────────────────────

const FILENAME_PRESETS = [
  { id: 'hyphen',     build: (d, pfx) => `${pfx}INV-${d.receipt}-${firstName(d.client)}-${serviceSlug(d.service)}` },
  { id: 'underscore', build: (d, pfx) => `${pfx}${d.receipt}_${fullNameSlug(d.client)}_${serviceSlug(d.service)}` },
  { id: 'readable',   build: (d, pfx) => `${pfx}${slug(d.from, ' ')} ${slug(d.client, ' ')} ${slug(d.service, ' ')} ${d.receipt}` },
];

function firstName(name)    { return name.split(' ')[0]; }
function fullNameSlug(name) { return name.replace(/\s+/g, ''); }
function serviceSlug(str) {
  return str
    .split(/[,]+/)                                           // split on commas — each is a distinct service
    .map(s => s.trim()
      .split(/[\s\/&+]+/)                                    // split service words on spaces, /, &, +
      .filter(w => w && /[a-zA-Z0-9]/.test(w))              // drop empty and symbol-only tokens
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()) // CamelCase each word
      .join('')                                              // join words within a service — no separator
    )
    .filter(Boolean)
    .join('_');                                              // underscore between distinct services
}
function slug(str, sep='-') { return str.replace(/[^a-zA-Z0-9]+/g, sep).replace(new RegExp(`^${sep}|${sep}$`,'g'),''); }

function getCompanyPrefix() {
  const val = localStorage.getItem('invoice-company-prefix') || '';
  return val.trim() ? val.trim() + '-' : '';
}
function saveCompanyPrefix() {
  const val = document.getElementById('company-prefix').value;
  localStorage.setItem('invoice-company-prefix', val);
  syncSettingsToSheet();
}

function saveReceiptPrefix() {
  const val = document.getElementById('receipt-prefix-input').value;
  localStorage.setItem('invoice-receipt-prefix', val);
  syncSettingsToSheet();
}

function buildFilename(presetId, data) {
  const preset = FILENAME_PRESETS.find(p => p.id === presetId) || FILENAME_PRESETS[0];
  const pfx = getCompanyPrefix();
  const d = {
    receipt: data.receiptNumber,
    client:  data.to?.name || 'Client',
    service: data.lineItems.map(l => l.service).join(', ') || 'Invoice',
    from:    data.from?.name || '',
  };
  return preset.build(d, pfx);
}

function renderFilenamePresets() {
  const data      = getData();
  const saved     = localStorage.getItem('invoice-filename-preset') || 'hyphen';
  const container = document.getElementById('filename-presets');
  container.innerHTML = '';

  // Restore saved company prefix into field
  const prefixEl = document.getElementById('company-prefix');
  if (prefixEl) prefixEl.value = localStorage.getItem('invoice-company-prefix') || '';

  // Restore receipt number prefix
  const receiptPrefixEl = document.getElementById('receipt-prefix-input');
  if (receiptPrefixEl) receiptPrefixEl.value = localStorage.getItem('invoice-receipt-prefix') || '';

  FILENAME_PRESETS.forEach(p => {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex; align-items:center; gap:10px; padding:8px 12px; border-radius:8px; cursor:pointer; border:1.5px solid transparent; transition:border-color 0.12s, background 0.12s;';
    if (p.id === saved) row.style.cssText += 'border-color:#14202e; background:#f6f6f4;';

    const radio = document.createElement('input');
    radio.type  = 'radio';
    radio.name  = 'filename-preset';
    radio.value = p.id;
    radio.checked = p.id === saved;
    radio.style.accentColor = '#14202e';
    radio.onchange = () => {
      localStorage.setItem('invoice-filename-preset', p.id);
      document.querySelectorAll('#filename-presets label').forEach(l => {
        l.style.borderColor = 'transparent';
        l.style.background  = '';
      });
      row.style.borderColor = '#14202e';
      row.style.background  = '#f6f6f4';
      updateFilenamePreview();
    };

    const lbl = document.createElement('span');
    lbl.style.cssText  = 'font-size:12px; font-family:monospace; color:#14202e;';
    lbl.textContent    = buildFilename(p.id, data) + '.pdf';

    row.append(radio, lbl);
    container.appendChild(row);
  });

  updateFilenamePreview();
}

function updateFilenamePreview() {
  const data   = getData();
  const saved  = localStorage.getItem('invoice-filename-preset') || 'hyphen';
  const name   = buildFilename(saved, data) + '.pdf';
  document.getElementById('filename-preview').textContent = name;
  document.title = buildFilename(saved, data);
}

async function proceedPrint() {
  updateFilenamePreview();
  closeDialog();
  window.print();
  setTimeout(() => { document.title = 'moo Invoicer'; }, 2000);

  // Save to Drive after print completes, using a clone so live DOM is never touched
  if (gmailTokenValid() && _driveFolderId) {
    showToast('Generating PDF backup...', 'info');
    setTimeout(async () => {
      try {
        const data = getData();
        const filename = buildFilename(localStorage.getItem('invoice-filename-preset') || 'hyphen', data) + '.pdf';
        const clone = document.getElementById('invoice').cloneNode(true);
        clone.style.cssText = 'margin:0;box-shadow:none;border-radius:0;width:816px;background:#fff;';
        const cs = getComputedStyle(document.body);
        clone.style.setProperty('--red', cs.getPropertyValue('--red').trim());
        clone.style.setProperty('--rule', cs.getPropertyValue('--rule').trim());
        document.body.appendChild(clone);
        const opt = { margin: [10, 0], filename, pagebreak: { mode: 'css', avoid: ['tr', '.total-card'] }, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' } };
        const pdfBlob = await html2pdf().set(opt).from(clone).toPdf().output('blob');
        document.body.removeChild(clone);
        savePdfToDrive(pdfBlob, filename);
      } catch(e) { 
        console.error('Drive PDF save failed:', e.message); 
        showToast('Drive PDF save failed: ' + e.message, 'error');
      }
    }, 3000);
  }
}

function closeDialog() {
  document.getElementById('print-overlay').style.display = 'none';
}

function toggleShortcutsModal() {
  const modal = document.getElementById('shortcuts-modal');
  if (!modal) return;
  const isOpen = modal.style.display === 'flex';
  modal.style.display = isOpen ? 'none' : 'flex';
}

function openPrintPreview() {
  const frame = document.getElementById('preview-frame');
  const overlay = document.getElementById('preview-overlay');
  const clone = document.getElementById('invoice').cloneNode(true);
  clone.style.cssText = 'margin:0; box-shadow:none; border-radius:0; width:100%;';
  const cs = getComputedStyle(document.body);
  ['--red','--row','--ink','--rule'].forEach(v =>
    clone.style.setProperty(v, cs.getPropertyValue(v).trim())
  );
  // Strip edit-mode controls from clone
  clone.querySelectorAll('button, input, select, textarea, .watermark-draft').forEach(el => el.remove());
  frame.innerHTML = '';
  frame.appendChild(clone);
  overlay.style.display = 'flex';
  overlay.scrollTop = 0;
}
function sendInvoiceViaEmail() {
  const data = getData();
  const clientName = (data.to && data.to.name) ? data.to.name.trim() : 'Client';
  const clientEmail = (data.to && data.to.email) ? data.to.email.trim() : '';
  const bname = (data.from && data.from.name) ? data.from.name.trim() : 'Us';

  const totalAmount = (data.lineItems || []).reduce((sum, item) => {
    const costs = Array.isArray(item.costs) ? item.costs : [];
    return sum + costs.reduce((s, c) => s + (parseFloat(c) || 0), 0);
  }, 0);
  const currency = data.currency || localStorage.getItem('invoicer-default-currency') || 'USD';
  const amtFormatted = typeof formatCurrencyNative === 'function'
    ? formatCurrencyNative(totalAmount, currency)
    : `${currency} ${totalAmount.toFixed(2)}`;

  const subject = encodeURIComponent(`Invoice ${data.receiptNumber || ''} from ${bname}`);

  let dueDateStr = '';
  const dueEl = document.getElementById('due-date-value');
  if (dueEl && dueEl.style.display !== 'none' && dueEl.textContent.trim()) {
    dueDateStr = `\nDue: ${dueEl.textContent.trim()}`;
  }

  const body = encodeURIComponent(
    `Hi ${clientName},\n\nPlease find attached Invoice ${data.receiptNumber || ''} for ${amtFormatted}.${dueDateStr}\n\nLet me know if you have any questions.\n\nThanks,\n${bname}`
  );

  window.location.href = `mailto:${clientEmail}?subject=${subject}&body=${body}`;
}


async function downloadPdfFromPreview() {
  const data = getData();
  const filename = buildFilename(localStorage.getItem('invoice-filename-preset') || 'hyphen', data) + '.pdf';
  const clone = document.getElementById('invoice').cloneNode(true);
  clone.style.cssText = 'margin:0;box-shadow:none;border-radius:0;width:816px;background:#fff;';
  const cs = getComputedStyle(document.body);
  clone.style.setProperty('--red', cs.getPropertyValue('--red').trim());
  clone.style.setProperty('--rule', cs.getPropertyValue('--rule').trim());
  
  // Strip edit-mode controls from clone so it renders cleanly
  clone.querySelectorAll('button, input, select, textarea, .watermark-draft').forEach(el => el.remove());
  
  document.body.appendChild(clone);
  
  showToast('Generating PDF...', 'info');
  const opt = { margin: [10, 0], filename, pagebreak: { mode: 'css', avoid: ['tr', '.total-card'] }, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' } };
  
  try {
    await html2pdf().set(opt).from(clone).save();
    showToast('PDF downloaded successfully', 'success');
  } catch(e) {
    showToast('PDF generation failed: ' + e.message, 'error');
  } finally {
    document.body.removeChild(clone);
  }
}

// ── AI Chat ──────────────────────────────────────────────────

const PROVIDERS = {
  openai:     { label: 'OpenAI',     color: '#10a37f', emoji: '⬡',
                url: 'https://api.openai.com/v1/chat/completions',
                authHeader: k => ({ Authorization: `Bearer ${k}` }),
                defaultModel: 'gpt-4o',
                listModels: async k => {
                  const r = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${k}` } });
                  const j = await r.json();
                  if (!r.ok) throw new Error(j.error?.message || r.statusText);
                  return j.data.map(m => m.id).filter(id => id.startsWith('gpt-') || id.startsWith('o')).sort();
                }},
  anthropic:  { label: 'Anthropic',  color: '#c96442', emoji: '◈',
                url: 'https://api.anthropic.com/v1/messages',
                authHeader: k => ({ 'x-api-key': k, 'anthropic-version': '2023-06-01' }),
                defaultModel: 'claude-sonnet-4-6',
                listModels: async k => {
                  const r = await fetch('https://api.anthropic.com/v1/models', { headers: { 'x-api-key': k, 'anthropic-version': '2023-06-01' } });
                  const j = await r.json();
                  if (!r.ok) throw new Error(j.error?.message || r.statusText);
                  return j.data.map(m => m.id).sort();
                }},
  gemini:     { label: 'Gemini',     color: '#4285f4', emoji: '✦',
                url: m => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`,
                authHeader: k => ({ 'x-goog-api-key': k }),
                defaultModel: 'gemini-2.5-flash-preview-05-20',
                listModels: async k => {
                  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(k)}`);
                  const j = await r.json();
                  if (!r.ok) throw new Error(j.error?.message || r.statusText);
                  return j.models
                    .map(m => m.name.replace('models/', ''))
                    .sort();
                }},
  deepseek:   { label: 'DeepSeek',   color: '#4d6bfe', emoji: '⟁',
                url: 'https://api.deepseek.com/chat/completions',
                authHeader: k => ({ Authorization: `Bearer ${k}` }),
                defaultModel: 'deepseek-chat',
                listModels: async k => {
                  const r = await fetch('https://api.deepseek.com/models', { headers: { Authorization: `Bearer ${k}` } });
                  const j = await r.json();
                  if (!r.ok) throw new Error(j.error?.message || r.statusText);
                  return j.data.map(m => m.id).sort();
                }},
  openrouter: { label: 'OpenRouter', color: '#6366f1', emoji: '⇋',
                url: 'https://openrouter.ai/api/v1/chat/completions',
                authHeader: k => ({ Authorization: `Bearer ${k}` }),
                defaultModel: 'anthropic/claude-sonnet-4-6',
                listModels: async k => {
                  const r = await fetch('https://openrouter.ai/api/v1/models', { headers: { Authorization: `Bearer ${k}` } });
                  const j = await r.json();
                  if (!r.ok) throw new Error(j.error?.message || r.statusText);
                  return j.data.map(m => m.id).sort();
                }},
};

function loadChatProviders() {
  return JSON.parse(localStorage.getItem('invoice-ai-providers') || '[]');
}
function saveChatProviders(list) {
  localStorage.setItem('invoice-ai-providers', JSON.stringify(list));
}
function getSelectedIdx() {
  return parseInt(localStorage.getItem('invoice-ai-selected') || '0', 10);
}
function setSelectedIdx(i) {
  localStorage.setItem('invoice-ai-selected', String(i));
  updateActiveProviderPill();
}

function updateActiveProviderPill() {
  const list  = loadChatProviders();
  const idx   = getSelectedIdx();
  const cfg   = list[idx];
  const dot   = document.getElementById('chat-active-dot');
  const title = document.getElementById('chat-title');
  if (cfg) {
    const prov = PROVIDERS[cfg.type] || {};
    dot.style.background    = prov.color || '#aaa';
    dot.style.display       = 'block';
    title.textContent       = prov.label || cfg.name;
    title.style.color       = 'var(--ink)';
    title.style.cursor      = '';
    title.onclick           = null;
    title.title             = '';
  } else {
    dot.style.background    = '#aaa';
    dot.style.display       = 'none';
    title.textContent       = 'Setup Assistant';
    title.style.color       = 'var(--muted)';
    title.style.cursor      = 'pointer';
    title.title             = 'Click to connect an AI provider';
    title.onclick           = () => toggleChatSettings();
  }
}

function renderProviderList() {
  const list    = loadChatProviders();
  const selIdx  = getSelectedIdx();
  const el      = document.getElementById('provider-list');
  el.innerHTML  = '';

  if (!list.length) {
    el.innerHTML = '<div style="text-align:center;color:#9aa2ac;font-size:12px;padding:24px 0;">No providers yet.<br>Hit <strong>+ Add</strong> to connect one.</div>';
    return;
  }

  list.forEach((p, i) => {
    const prov   = PROVIDERS[p.type] || { color: '#aaa', emoji: '●', label: p.type };
    const isActive = i === selIdx;

    const card = document.createElement('div');
    card.className = 'prov-card' + (isActive ? ' active-card' : '');

    // Top row — badge, name, use button, expand toggle
    const top = document.createElement('div');
    top.className = 'prov-card-top';
    top.onclick = () => toggleProviderExpand(i);

    const badge = document.createElement('div');
    badge.className = 'prov-badge';
    badge.style.background = prov.color;
    badge.textContent = prov.emoji;

    const info = document.createElement('div');
    info.className = 'prov-card-info';
    info.innerHTML = `<div class="prov-card-name">${p.name}</div><div class="prov-card-sub">${prov.label} · ${p.model || prov.defaultModel}</div>`;

    const actions = document.createElement('div');
    actions.className = 'prov-card-actions';

    const useBtn = document.createElement('button');
    useBtn.className = 'btn-use-provider' + (isActive ? ' active' : '');
    useBtn.textContent = isActive ? '✓ Active' : 'Use';
    useBtn.onclick = e => { e.stopPropagation(); setSelectedIdx(i); renderProviderList(); };

    const expandBtn = document.createElement('button');
    expandBtn.className = 'btn-expand-provider';
    expandBtn.textContent = '···';
    expandBtn.onclick = e => { e.stopPropagation(); toggleProviderExpand(i); };

    actions.append(useBtn, expandBtn);
    top.append(badge, info, actions);

    // Expandable fields
    const fields = document.createElement('div');
    fields.className = 'prov-card-fields';
    fields.id = `prov-fields-${i}`;

    // Name field
    const nameRow = document.createElement('div');
    nameRow.className = 'field-row';
    nameRow.innerHTML = '<label>Display Name</label>';
    const nameIn = document.createElement('input');
    nameIn.value = p.name;
    nameIn.placeholder = 'e.g. My Claude';
    nameIn.oninput = () => { list[i].name = nameIn.value; saveChatProviders(list); info.querySelector('.prov-card-name').textContent = nameIn.value; updateActiveProviderPill(); };
    nameRow.appendChild(nameIn);

    // Provider type + model (2-col)
    const twoCol = document.createElement('div');
    twoCol.className = 'field-row-2col';

    const typeRow = document.createElement('div');
    typeRow.className = 'field-row';
    typeRow.innerHTML = '<label>Provider</label>';
    const typeSel = document.createElement('select');
    Object.entries(PROVIDERS).forEach(([k, v]) => {
      const o = document.createElement('option');
      o.value = k; o.textContent = v.label;
      if (k === p.type) o.selected = true;
      typeSel.appendChild(o);
    });
    typeSel.onchange = () => {
      list[i].type  = typeSel.value;
      list[i].model = PROVIDERS[typeSel.value]?.defaultModel || '';
      modelIn.value = list[i].model;
      saveChatProviders(list);
      renderProviderList();
    };
    typeRow.appendChild(typeSel);

    const modelRow = document.createElement('div');
    modelRow.className = 'field-row';

    const modelLabel = document.createElement('label');
    modelLabel.style.cssText = 'display:flex; align-items:center; justify-content:space-between;';
    modelLabel.innerHTML = '<span>Model</span>';
    const fetchBtn = document.createElement('button');
    fetchBtn.type = 'button';
    fetchBtn.textContent = '⟳ fetch';
    fetchBtn.style.cssText = 'font-size:10px; font-family:Roboto,sans-serif; background:none; border:none; color:#5b4fcf; cursor:pointer; padding:0; font-weight:600; letter-spacing:0.5px;';
    modelLabel.appendChild(fetchBtn);
    modelRow.appendChild(modelLabel);

    // Free-text input shown before fetch, replaced by select after fetch
    const modelIn = document.createElement('input');
    modelIn.value = p.model || prov.defaultModel || '';
    modelIn.placeholder = prov.defaultModel || 'model-name';
    modelIn.oninput = () => { list[i].model = modelIn.value; saveChatProviders(list); info.querySelector('.prov-card-sub').textContent = `${PROVIDERS[list[i].type]?.label || ''} · ${modelIn.value}`; };

    const modelSel = document.createElement('select');
    modelSel.style.display = 'none';
    modelSel.onchange = () => { list[i].model = modelSel.value; modelIn.value = modelSel.value; saveChatProviders(list); info.querySelector('.prov-card-sub').textContent = `${PROVIDERS[list[i].type]?.label || ''} · ${modelSel.value}`; };

    modelRow.append(modelIn, modelSel);

    fetchBtn.onclick = async () => {
      if (!list[i].key) { fetchBtn.textContent = '⚠ no key'; setTimeout(() => { fetchBtn.textContent = '⟳ fetch'; }, 2000); return; }
      fetchBtn.textContent = '…';
      fetchBtn.disabled = true;
      try {
        const currentProv = PROVIDERS[list[i].type];
        const models = await currentProv.listModels(list[i].key);
        const current = list[i].model || currentProv.defaultModel || '';
        modelSel.innerHTML = models.map(m => `<option value="${m}" ${m === current ? 'selected' : ''}>${m}</option>`).join('');
        // If saved model isn't in list, prepend it
        if (current && !models.includes(current)) {
          modelSel.innerHTML = `<option value="${current}" selected>${current}</option>` + modelSel.innerHTML;
        }
        modelIn.style.display = 'none';
        modelSel.style.display = '';
        list[i].model = modelSel.value;
        saveChatProviders(list);
        info.querySelector('.prov-card-sub').textContent = `${currentProv.label} · ${modelSel.value}`;
        fetchBtn.textContent = `✓ ${models.length}`;
        setTimeout(() => { fetchBtn.textContent = '⟳ fetch'; }, 2500);
      } catch (e) {
        fetchBtn.textContent = '✗ error';
        setTimeout(() => { fetchBtn.textContent = '⟳ fetch'; }, 2500);
      } finally {
        fetchBtn.disabled = false;
      }
    };

    twoCol.append(typeRow, modelRow);

    // API Key
    const keyRow = document.createElement('div');
    keyRow.className = 'field-row';
    keyRow.innerHTML = '<label>API Key</label>';
    const keyIn = document.createElement('input');
    keyIn.type = 'password';
    keyIn.value = p.key;
    keyIn.placeholder = 'sk-…';
    keyIn.oninput = () => { list[i].key = keyIn.value; saveChatProviders(list); };
    keyRow.appendChild(keyIn);

    // Delete
    const delBtn = document.createElement('button');
    delBtn.className = 'btn-del-provider';
    delBtn.textContent = 'Remove provider';
    delBtn.onclick = () => {
      list.splice(i, 1);
      saveChatProviders(list);
      if (getSelectedIdx() >= list.length) setSelectedIdx(Math.max(0, list.length - 1));
      renderProviderList();
      updateActiveProviderPill();
    };

    fields.append(nameRow, twoCol, keyRow, delBtn);
    card.append(top, fields);
    el.appendChild(card);
  });
}

function toggleProviderExpand(i) {
  const fields = document.getElementById(`prov-fields-${i}`);
  if (fields) fields.classList.toggle('open');
}

function addProvider() {
  const list = loadChatProviders();
  list.push({ name: 'New Provider', type: 'openai', key: '', model: 'gpt-4o' });
  saveChatProviders(list);
  renderProviderList();
  updateActiveProviderPill();
  // Auto-expand the new card
  setTimeout(() => toggleProviderExpand(list.length - 1), 50);
}

function toggleChat() {
  const panel = document.getElementById('chat-panel');
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) {
    updateActiveProviderPill();
    renderClientChips();
    renderChatHistory();
    document.getElementById('chat-input').focus();
    // Seed from ledger if empty, then enrich from sheet
    seedClientsFromLedger();
    renderClientChips();
    if (gmailTokenValid()) {
      loadClientsFromSheet().then(() => renderClientChips());
    }
  }
}

function toggleChatSettings() {
  const s    = document.getElementById('chat-settings-panel');
  const msgs = document.getElementById('chat-messages');
  const isOpen = s.classList.toggle('open');
  msgs.style.display = isOpen ? 'none' : 'flex';
  if (isOpen) {
    renderProviderList();
    const selPay = document.getElementById('default-pay-period-select');
    if (selPay) {
      selPay.value = localStorage.getItem('invoicer-default-pay-period') || '0';
    }
    const selCur = document.getElementById('default-currency-select');
    if (selCur) {
      selCur.value = localStorage.getItem('invoicer-default-currency') || 'USD';
    }
  }
}

window.forceUpdateApp = async function() {
  if (confirm('This will clear the app cache and force a download of the latest version. Your ledger and settings will NOT be deleted. Proceed?')) {
    if ('serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (let registration of registrations) {
          await registration.unregister();
        }
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
        console.log('✓ Cache cleared, reloading...');
        window.location.reload(true);
      } catch (e) {
        console.error('Update failed:', e);
        window.location.reload();
      }
    } else {
      window.location.reload();
    }
  }
};

window.resetAppSettings = async function() {
  if (!await showConfirm('Reset UI preferences to defaults? This will not affect your ledger, templates, clients, or AI providers.', 'Reset UI')) return;
  const UI_KEYS = [
    'invoice-title-font', 'invoice-theme', 'invoice-title-size',
    'invoicer-default-pay-period', 'invoicer-default-currency',
    'invoice-company-prefix', 'invoice-receipt-prefix', 'invoice-filename-preset',
    'invoicer-preferred-template', 'invoice-last-state', 'invoicer-autosave',
    'invoice-chat-history'
  ];
  UI_KEYS.forEach(k => localStorage.removeItem(k));
  // Reset select dropdowns
  const payEl = document.getElementById('default-pay-period-select');
  const curEl = document.getElementById('default-currency-select');
  if (payEl) payEl.value = '0';
  if (curEl) curEl.value = 'USD';
  // Restore visual defaults
  restoreTitleFont();
  restoreTheme();
  restoreTitleSize();
  showToast('UI preferences reset to defaults', 'success');
};

window.saveDefaultSettings = function() {
  const selPay = document.getElementById('default-pay-period-select');
  if (selPay) localStorage.setItem('invoicer-default-pay-period', selPay.value);

  const selCur = document.getElementById('default-currency-select');
  if (selCur) localStorage.setItem('invoicer-default-currency', selCur.value);

  syncSettingsToSheet();
  showToast('Default settings saved and synced', 'success');
};

function toggleChatMenu() {
  const menu = document.getElementById('chat-menu');
  if (!menu) return;
  const isOpen = menu.style.display === 'block';
  menu.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    const close = (e) => {
      if (!menu.contains(e.target) && e.target.id !== 'btn-chat-settings') {
        menu.style.display = 'none';
        document.removeEventListener('click', close, true);
      }
    };
    setTimeout(() => document.addEventListener('click', close, true), 0);
  }
}

function exportChat() {
  const history = loadChatHistory();
  if (!history.length) { showToast('No chat history to export', 'info'); return; }
  const lines = history.map(m => `[${m.role.toUpperCase()}]\n${m.content}`).join('\n\n---\n\n');
  const blob = new Blob([lines], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `chat-export-${new Date().toISOString().split('T')[0]}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function chatInputKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
}

function loadChatHistory() {
  return JSON.parse(localStorage.getItem('invoice-chat-history') || '[]');
}
function saveChatHistory(history) {
  // Keep last 100 messages to avoid unbounded growth
  localStorage.setItem('invoice-chat-history', JSON.stringify(history.slice(-100)));
}

// ── Image attachments ─────────────────────────────────────────

let _pendingImages = []; // array of { base64, mediaType }

function handleImageFiles(files) {
  Array.from(files).forEach(file => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = e => addPendingImage(e.target.result, file.type);
    reader.readAsDataURL(file);
  });
  // Reset so same file can be picked again
  document.getElementById('chat-file-input').value = '';
}

function handleImagePaste(e) {
  const items = e.clipboardData?.items;
  if (!items) return;
  Array.from(items).forEach(item => {
    if (!item.type.startsWith('image/')) return;
    const file = item.getAsFile();
    const reader = new FileReader();
    reader.onload = ev => addPendingImage(ev.target.result, item.type);
    reader.readAsDataURL(file);
  });
}

function addPendingImage(dataUrl, mediaType) {
  const idx = _pendingImages.length;
  _pendingImages.push({ dataUrl, mediaType: mediaType || 'image/png' });

  const strip = document.getElementById('chat-image-preview');
  strip.classList.add('has-images');

  const thumb = document.createElement('div');
  thumb.className = 'chat-img-thumb';
  thumb.id = `thumb-${idx}`;

  const img = document.createElement('img');
  img.src = dataUrl;

  const rm = document.createElement('button');
  rm.className = 'rm-img';
  rm.textContent = '✕';
  rm.onclick = () => removePendingImage(idx);

  thumb.append(img, rm);
  strip.appendChild(thumb);
}

function removePendingImage(idx) {
  _pendingImages[idx] = null;
  const thumb = document.getElementById(`thumb-${idx}`);
  if (thumb) thumb.remove();
  if (_pendingImages.every(i => i === null)) {
    _pendingImages = [];
    document.getElementById('chat-image-preview').classList.remove('has-images');
  }
}

function clearPendingImages() {
  _pendingImages = [];
  const strip = document.getElementById('chat-image-preview');
  strip.innerHTML = '';
  strip.classList.remove('has-images');
}

function appendMsg(role, text, persist = true, ts = null) {
  const el = document.createElement('div');
  el.className = `chat-msg ${role}`;
  el.textContent = text;
  // Timestamp chip
  const timeStr = ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
  if (timeStr) {
    const stamp = document.createElement('span');
    stamp.textContent = timeStr;
    const stampColor = role === 'user' ? 'rgba(255,255,255,0.35)' : 'rgba(20,32,46,0.3)';
    stamp.style.cssText = `display:block; font-size:9px; color:${stampColor}; margin-top:3px; text-align:right; letter-spacing:0.3px;`;
    el.appendChild(stamp);
  }
  const msgs = document.getElementById('chat-messages');
  msgs.appendChild(el);
  msgs.scrollTop = msgs.scrollHeight;
  // Don't persist the temporary "…" thinking placeholder
  if (persist && text !== '…') {
    const now = ts || new Date().toISOString();
    const history = loadChatHistory();
    history.push({ role, text, ts: now });
    saveChatHistory(history);
  }
  return el;
}

function renderChatHistory() {
  const msgs    = document.getElementById('chat-messages');
  const history = loadChatHistory();
  msgs.innerHTML = '';
  if (!history.length) {
    const hasProvider = loadChatProviders().length > 0;
    const greeting = hasProvider
      ? 'Hi! Tell me what to update — e.g. "Invoice for Sarah, logo design, $5000 USD, balance due."'
      : 'No AI provider connected yet. Tap <strong>Setup Assistant</strong> above to add one — supports Claude, Gemini, OpenAI, and more.';
    appendMsg('assistant', greeting, false);
    return;
  }
  history.forEach(m => appendMsg(m.role, m.text, false, m.ts || null));
}

function clearChatHistory() {
  localStorage.removeItem('invoice-chat-history');
  renderChatHistory();
}

// Detect if the user is asking a question rather than giving an update command
function isQueryMessage(text) {
  const t = text.trim().toLowerCase();
  return /^(what|who|how much|how many|when|show|list|tell me|summarize|summary|total|did|does|has|have|is there|any invoice|find|look up|search|which|can you tell)/.test(t)
    || t.endsWith('?');
}

async function streamOpenAI(url, headers, body, onChunk) {
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ ...body, stream: true }) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || res.statusText);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
      try {
        const delta = JSON.parse(line.slice(6))?.choices?.[0]?.delta?.content;
        if (delta) onChunk(delta);
      } catch {}
    }
  }
}

async function streamAnthropic(url, headers, body, onChunk) {
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ ...body, stream: true }) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || err.type || res.statusText);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const evt = JSON.parse(line.slice(6));
        if (evt.type === 'content_block_delta') onChunk(evt.delta?.text || '');
      } catch {}
    }
  }
}

async function sendChat() {
  const input   = document.getElementById('chat-input');
  const sendBtn = document.getElementById('btn-chat-send');
  const text    = input.value.trim();
  if (!text) return;

  const list = loadChatProviders();
  const cfg  = list[getSelectedIdx()];
  if (!cfg) { appendMsg('error', 'No provider selected. Open ⚙ settings to add one.'); return; }

  const prov = PROVIDERS[cfg.type];
  if (!prov) { appendMsg('error', `Unknown provider type: ${cfg.type}`); return; }
  if (!cfg.key) { appendMsg('error', 'API key is missing. Open ⚙ settings to add it.'); return; }

  // Close settings if open
  const settingsPanel = document.getElementById('chat-settings-panel');
  if (settingsPanel.classList.contains('open')) toggleChatSettings();

  const images = _pendingImages.filter(Boolean);
  appendMsg('user', text + (images.length ? ` [${images.length} image${images.length > 1 ? 's' : ''}]` : ''));
  input.value = '';
  clearPendingImages();
  sendBtn.disabled = true;
  const thinking = appendMsg('assistant', '…');

  const currentData = JSON.stringify(getData(), null, 2);
  const existingGoals = loadGoals();
  const goalNamesLine = existingGoals.length
    ? `Existing goal names (use _updateGoal for these, not _addGoal): ${existingGoals.map(g => g.name).join(', ')}.`
    : '';
  const existingClients = loadClients();
  const clientsLine = existingClients.length
    ? `Address book contacts (use these to autofill "to"): ${JSON.stringify(existingClients)}`
    : '';

  // Build ledger summary for query mode
  const ledgerRows = loadLedgerRows();
  const ledgerSummary = ledgerRows.length
    ? `Invoice ledger (${ledgerRows.length} records):\n` + ledgerRows.map(r =>
        `  Receipt ${r.receipt} | ${r.date} | ${r.client} | ${r.service} | ${r.amountDue} | ${r.status || '⬜ Unpaid'}`
      ).join('\n')
    : '';

  const queryMode = isQueryMessage(text) && !images.length;

  const systemPrompt = queryMode
    ? `You are an invoice assistant with access to the user's ledger and current invoice. Answer questions conversationally and concisely. Do not return JSON.
Current invoice data: ${currentData}
${ledgerSummary}
Goals: ${existingGoals.map(g => `${g.name} $${g.amount} deadline:${g.deadline || 'none'}`).join(', ') || 'none'}
Address book: ${existingClients.map(c => c.name).join(', ') || 'empty'}`
    : `You are an invoice data assistant. The current invoice data is shown below — it already reflects all previous changes.
The user will describe what to change next. Return ONLY a single valid JSON object with the fields that need to change.
Do not repeat fields that are already correct. Do not return markdown, explanation, or any text outside the JSON object.
If nothing needs to change, return an empty object: {}
Field reference: date, receiptNumber, currency, payPeriod, from (object: name/email/phone), to (object: name/address/email/phone), lineItems (array of objects: service, details, rates[], costs[]), projectTotal, totalLabelTop, totalLabelBottom, totalAmount, paymentNote, invoiceNotes (freeform notes shown below line items — payment terms, bank details, late fee policy, etc.), paid.
When updating "to" or "from", include ALL subfields of that object, not just the changed ones.
To load a past invoice into the editor, include "_loadReceipt": "RECEIPT_NUMBER" — use the exact receipt number from the ledger. The invoice will be pre-filled from ledger data. Only use this if the user explicitly asks to open, load, or re-open a past invoice.
To save a contact to the address book, include "_addContact": { "name": "...", "address": "...", "email": "...", "phone": "..." } in your response. Only include fields you know. This does not update the invoice — combine with "to" if you also want to set the client.
To add a new savings or revenue goal, include "_addGoal": { "name": "...", "amount": 3500, "deadline": "YYYY-MM-DD", "allocationPct": 15, "notes": "..." } — amount is a number, deadline is ISO 8601, allocationPct is 0–100 (default 0 if not mentioned), notes is optional; this does not change the invoice.
To update an existing goal, include "_updateGoal": { "name": "...", "changes": { "amount": 3500, "deadline": "YYYY-MM-DD", "allocationPct": 20, "notes": "..." } } — name must match an existing goal (case-insensitive), include only the fields that are changing.
To delete a goal, include "_deleteGoal": { "name": "..." } — name must match an existing goal (case-insensitive); only use this if the user explicitly asks to remove or delete a goal.
To add expense line items to the current invoice, include "_addExpense": [{ "desc": "...", "amount": 120 }] — array, amount is a number, these belong to the current invoice only.
To change the payment status of the current invoice in the ledger, include "_updateStatus": { "receipt": "...", "status": "..." } — receipt must be copied exactly from the "receiptNumber" field below (do not invent it); status must be exactly one of: "⬜ Unpaid", "💰 Deposit", "📤 Sent", "✅ Paid".
Do not include any action key unless the user explicitly requested that action.${goalNamesLine ? '\n' + goalNamesLine : ''}${clientsLine ? '\n' + clientsLine : ''}${ledgerSummary ? '\n' + ledgerSummary : ''}
Current invoice data:
${currentData}`;

  const recentHistory = loadChatHistory()
    .filter(function(m) { return m.role === 'user' || m.role === 'assistant'; })
    .slice(-6);

  try {
    let responseText = '';

    if (cfg.type === 'anthropic') {
      const content = [];
      images.forEach(img => {
        const b64 = img.dataUrl.split(',')[1];
        content.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: b64 } });
      });
      content.push({ type: 'text', text });

      const messages = recentHistory.map(function(m) {
        return { role: m.role, content: m.text };
      });
      messages.push({ role: 'user', content });

      const body = { model: cfg.model, max_tokens: 1024, system: systemPrompt, messages };
      thinking.textContent = '';
      await streamAnthropic(prov.url, { 'Content-Type': 'application/json', ...prov.authHeader(cfg.key) }, body, chunk => {
        responseText += chunk;
        if (queryMode) thinking.textContent = responseText;
      });

    } else if (cfg.type === 'gemini') {
      // Gemini doesn't support SSE streaming easily in browser — keep non-streaming
      const parts = [];
      images.forEach(img => {
        const b64 = img.dataUrl.split(',')[1];
        parts.push({ inlineData: { mimeType: img.mediaType, data: b64 } });
      });

      const contents = [];
      recentHistory.forEach(function(m) {
        const role = m.role === 'assistant' ? 'model' : 'user';
        if (contents.length && contents[contents.length - 1].role === role) return;
        contents.push({ role: role, parts: [{ text: m.text }] });
      });
      if (contents.length && contents[contents.length - 1].role === 'user') contents.pop();
      parts.push({ text: systemPrompt + '\n\nUser: ' + text });
      contents.push({ role: 'user', parts });

      const url = typeof prov.url === 'function' ? prov.url(cfg.model) : prov.url;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...prov.authHeader(cfg.key) },
        body: JSON.stringify({ contents })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || res.statusText);
      responseText = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (queryMode) thinking.textContent = responseText;

    } else {
      // OpenAI-compatible (OpenAI, DeepSeek, OpenRouter) — stream
      const userContent = [];
      images.forEach(img => {
        userContent.push({ type: 'image_url', image_url: { url: img.dataUrl } });
      });
      userContent.push({ type: 'text', text });

      const messages = [{ role: 'system', content: systemPrompt }];
      recentHistory.forEach(function(m) {
        messages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text });
      });
      messages.push({ role: 'user', content: userContent });

      const url = typeof prov.url === 'function' ? prov.url(cfg.model) : prov.url;
      thinking.textContent = '';
      await streamOpenAI(url, { 'Content-Type': 'application/json', ...prov.authHeader(cfg.key) },
        { model: cfg.model, messages },
        chunk => {
          responseText += chunk;
          if (queryMode) thinking.textContent = responseText;
        }
      );
    }

    // ── Query mode: just show the answer, no JSON parsing ──
    if (queryMode) {
      if (!responseText.trim()) thinking.textContent = '(No response)';
      const h = loadChatHistory(); h.push({ role: 'assistant', text: thinking.textContent }); saveChatHistory(h);
      return;
    }

    responseText = responseText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    let patch;
    try { patch = JSON.parse(responseText); }
    catch { throw new Error('Model returned non-JSON. Try rephrasing.'); }

    // Extract _addContact before merge so it never touches invoice data
    const contactToAdd = patch._addContact || null;
    delete patch._addContact;

    // ── _loadReceipt: pre-fill invoice from ledger row ──
    const loadReceiptId = patch._loadReceipt || null;
    delete patch._loadReceipt;

    // ── Part A: goal actions (before getData — don't need invoice data) ──
    const actionNotes = [];
    if (patch._addGoal)    { applyAddGoal(patch._addGoal, actionNotes);       delete patch._addGoal; }
    if (patch._updateGoal) { applyUpdateGoal(patch._updateGoal, actionNotes); delete patch._updateGoal; }
    if (patch._deleteGoal) { applyDeleteGoal(patch._deleteGoal, actionNotes); delete patch._deleteGoal; }

    const data = getData();

    // ── Part B: actions that need the invoice data object ──
    if (patch._addExpense)   { applyAddExpense(patch._addExpense, data, actionNotes);     delete patch._addExpense; }
    if (patch._updateStatus) { applyUpdateStatus(patch._updateStatus, data, actionNotes); delete patch._updateStatus; }

    // ── _loadReceipt: merge ledger row fields into invoice ──
    if (loadReceiptId) {
      const row = loadLedgerRows().find(r => r.receipt === loadReceiptId);
      if (row) {
        if (row.client)  data.to = { ...data.to, name: row.client };
        if (row.date)    data.dateOverride = row.date;
        if (row.service) data.lineItems = [{ service: row.service, details: '', rates: ['Rate'], costs: [row.amountDue ? row.amountDue.replace(/[^0-9.,]/g, '').trim() : '0'] }];
        data.receiptOverride = row.receipt;
        actionNotes.push(`Loaded receipt ${row.receipt}`);
      } else {
        actionNotes.push(`Receipt ${loadReceiptId} not found in ledger`);
      }
    }

    function deepMerge(target, source) {
      Object.entries(source).forEach(([k, v]) => {
        if (v && typeof v === 'object' && !Array.isArray(v) && typeof target[k] === 'object') deepMerge(target[k], v);
        else target[k] = v;
      });
    }
    // Normalise lineItems from AI — ensure rates/costs are always arrays
    if (Array.isArray(patch.lineItems)) {
      patch.lineItems = patch.lineItems.map(item => ({
        ...item,
        rates: Array.isArray(item.rates) ? item.rates : (item.rates ? [item.rates] : ['Rate']),
        costs: Array.isArray(item.costs) ? item.costs : (item.costs ? [String(item.costs)] : ['0']),
      }));
    }
    deepMerge(data, patch);

    if (contactToAdd && contactToAdd.name) {
      upsertClient({
        name:    contactToAdd.name    || '',
        address: contactToAdd.address || '',
        email:   contactToAdd.email   || '',
        phone:   contactToAdd.phone   || '',
      });
      renderClientChips();
    }
    data.dateOverride    = data.dateOverride || data.date;
    data.receiptOverride = data.receiptOverride || data.receiptNumber;
    document.getElementById('invoice-data').textContent = JSON.stringify(data, null, 2);
    // Re-derive date/receiptNumber from overrides so render shows correct values
    render(getData());

    const fieldLabels = {
      date: 'date', receiptNumber: 'receipt #', currency: 'currency', payPeriod: 'pay period',
      from: 'sender details', to: 'client details', lineItems: 'line items',
      projectTotal: 'project total', totalLabelTop: 'total label', totalLabelBottom: 'total label',
      totalAmount: 'total amount', paymentNote: 'payment note', invoiceNotes: 'invoice notes', paid: 'paid status',
      invoiceExpenses: 'expenses'
    };
    const changedKeys = Object.keys(patch);
    const changed = changedKeys.map(k => fieldLabels[k] || k).filter((v, i, a) => a.indexOf(v) === i).join(', ');
    const contactNote = (contactToAdd && contactToAdd.name) ? ` · ${contactToAdd.name} saved to contacts` : '';
    const actionNote  = actionNotes.length ? ' · ' + actionNotes.join(' · ') : '';
    if (!changed && !contactNote && actionNotes.length) {
      thinking.textContent = '✓ ' + actionNotes.join(' · ');
    } else {
      thinking.textContent = `✓ Updated: ${changed}${contactNote}${actionNote}`;
    }
    const h = loadChatHistory(); h.push({ role: 'assistant', text: thinking.textContent }); saveChatHistory(h);

  } catch (err) {
    thinking.className = 'chat-msg error';
    thinking.textContent = `✗ ${err.message}`;
    const h = loadChatHistory(); h.push({ role: 'assistant', text: thinking.textContent }); saveChatHistory(h);
  } finally {
    sendBtn.disabled = false;
  }
}

// ── Address Book ─────────────────────────────────────────────

function loadClients() {
  return JSON.parse(localStorage.getItem('invoice-clients') || '[]');
}
function saveClients(list) {
  localStorage.setItem('invoice-clients', JSON.stringify(list));
}

function exportAddressBookCsv() {
  const clients = loadClients();
  if (!clients.length) {
    showToast('Address book is empty.', 'info');
    return;
  }
  const escape = v => `"${String(v || '').replace(/"/g, '""')}"`;
  const headers = ['Name', 'Email', 'Phone', 'Address'];
  const lines = [
    headers.map(escape).join(','),
    ...clients.map(c => [c.name, c.email, c.phone, c.address].map(escape).join(','))
  ];
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `invoicer-clients-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('Address book exported', 'success');
}

function upsertClient(client) {
  const list = loadClients();
  const idx  = list.findIndex(c => c.name.toLowerCase() === client.name.toLowerCase());
  if (idx >= 0) list[idx] = { ...list[idx], ...client };
  else list.push(client);
  saveClients(list);
  syncClientsToSheet();
}

let _clientSyncTimer = null;
function syncClientsToSheet() {
  clearTimeout(_clientSyncTimer);
  _clientSyncTimer = setTimeout(() => doSyncClientsToSheet(), 1500);
}

async function doSyncClientsToSheet() {
  if (!_gmailToken || !_sheetsSpreadsheetId) return;
  const list = loadClients();
  if (!list.length) return;
  
  let existing = [];
  try {
    existing = await sheetsRead(_sheetsSpreadsheetId, 'Clients!A2:D');
  } catch (err) {
    console.warn("Clients sheet read error:", err);
  }
  
  for (const client of list) {
    if (!client.name) continue;
    const rowIdx = existing.findIndex(r => r[0] && r[0].toLowerCase() === client.name.toLowerCase());
    const newRow = [client.name, client.address || '', client.email || '', client.phone || ''];
    if (rowIdx === -1) {
      await sheetsAppend(_sheetsSpreadsheetId, 'Clients!A:D', [newRow]);
      existing.push(newRow); // Prevent duplicate appends if we loop
    } else {
      const sheetRow = rowIdx + 2; // 1-based + header offset
      const isDifferent = existing[rowIdx].join('|') !== newRow.join('|');
      if (isDifferent) {
        await sheetsWrite(_sheetsSpreadsheetId, `Clients!A${sheetRow}:D${sheetRow}`, [newRow]);
        existing[rowIdx] = newRow;
      }
    }
  }
}

async function generateStatement(clientName) {
  const rows = loadLedgerRows().filter(r => (r.client || '').toLowerCase() === clientName.toLowerCase());
  if (!rows.length) { showToast(`No ledger entries found for ${clientName}`, 'error'); return; }

  const parseAmt = s => parseFloat((s || '').replace(/[^0-9.]/g, '')) || 0;
  const totalBilled   = rows.reduce((s, r) => s + parseAmt(r.amountDue), 0);
  const totalPaid     = rows.filter(r => r.status === '✅ Paid').reduce((s, r) => s + parseAmt(r.amountDue), 0);
  const totalOutstanding = totalBilled - totalPaid;
  const currency = (rows[0].amountDue || '').replace(/[0-9.,\s]/g, '').trim() || '$';

  const fmt = n => currency + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fromData = getData().from;
  const today = new Date();
  const dateStr = `${String(today.getMonth()+1).padStart(2,'0')}/${String(today.getDate()).padStart(2,'0')}/${today.getFullYear()}`;

  const rowsHtml = rows.map(r => {
    const isPaid = r.status === '✅ Paid';
    const color = isPaid ? '#2a8c55' : r.status === '💰 Deposit' ? '#b45309' : '#c62828';
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:12px;">${r.receipt || ''}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:12px;">${r.date || ''}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:12px;max-width:180px;">${r.service || ''}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:12px;text-align:right;">${r.amountDue || ''}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:12px;text-align:center;color:${color};font-weight:600;">${r.status || ''}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 40px; color: #14202e; background: #fff; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 3px solid #14202e; }
    .from-name { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
    .from-sub { font-size: 11px; color: #6c7682; margin-top: 4px; }
    .stmt-title { text-align: right; }
    .stmt-title h1 { font-size: 28px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; margin: 0; }
    .stmt-title .meta { font-size: 11px; color: #6c7682; margin-top: 6px; }
    .client-block { background: #f6f6f4; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px; font-size: 12px; }
    .client-block strong { font-size: 14px; display: block; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    thead tr { background: #14202e; color: #fff; }
    thead td { padding: 10px 12px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; }
    .summary { display: flex; justify-content: flex-end; }
    .summary-box { width: 260px; font-size: 12px; }
    .summary-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #eee; }
    .summary-row.total { font-weight: 800; font-size: 14px; border-bottom: none; padding-top: 10px; }
    .summary-row.total span:last-child { color: ${totalOutstanding > 0 ? '#c62828' : '#2a8c55'}; }
    .footer { margin-top: 40px; font-size: 10px; color: #9aa2ac; text-align: center; border-top: 1px solid #eee; padding-top: 14px; }
  </style></head><body>
  <div class="header">
    <div><div class="from-name">${fromData.name || 'Your Business'}</div><div class="from-sub">${[fromData.email, fromData.phone].filter(Boolean).join(' · ')}</div></div>
    <div class="stmt-title"><h1>Statement</h1><div class="meta">Date: ${dateStr}<br>Prepared for: ${clientName}</div></div>
  </div>
  <div class="client-block"><strong>${clientName}</strong>Statement of Account — All Transactions</div>
  <table>
    <thead><tr><td>Receipt #</td><td>Date</td><td>Description</td><td style="text-align:right">Amount</td><td style="text-align:center">Status</td></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="summary"><div class="summary-box">
    <div class="summary-row"><span>Total Billed</span><span>${fmt(totalBilled)}</span></div>
    <div class="summary-row"><span>Total Paid</span><span>${fmt(totalPaid)}</span></div>
    <div class="summary-row total"><span>Balance Due</span><span>${fmt(totalOutstanding)}</span></div>
  </div></div>
  <div class="footer">${fromData.name || 'Your Business'} · Generated ${dateStr} · Thank you for your business.</div>
  </body></html>`;

  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-9999px;top:0;width:816px;background:#fff;';
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    const filename = `Statement-${clientName.replace(/\s+/g, '-')}-${dateStr.replace(/\//g, '')}.pdf`;
    const opt = { margin: [10, 10], filename, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' } };
    await html2pdf().set(opt).from(container).save();
    showToast(`✓ Statement downloaded for ${clientName}`, 'success');
  } catch(e) {
    showToast('PDF generation failed: ' + e.message, 'error');
  } finally {
    document.body.removeChild(container);
  }
}

async function loadClientsFromSheet() {
  if (!_gmailToken || !_sheetsSpreadsheetId) return;
  let rows = [];
  try {
    rows = await sheetsRead(_sheetsSpreadsheetId, 'Clients!A2:D');
  } catch (err) {
    return;
  }
  if (!rows.length) return;
  const sheetClients = rows
    .filter(r => r[0])
    .map(r => ({ name: r[0], address: r[1] || '', email: r[2] || '', phone: r[3] || '' }));
    
  let local = loadClients();
  sheetClients.forEach(sc => {
    const idx = local.findIndex(c => c.name.toLowerCase() === sc.name.toLowerCase());
    if (idx >= 0) local[idx] = { ...local[idx], ...sc };
    else local.push(sc);
  });
  
  const unique = [];
  const seen = new Set();
  for (const c of local) {
    if (!c.name || c.name.trim() === '' || c.name === 'New Client') continue;
    const key = c.name.toLowerCase().trim();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(c);
    }
  }
  
  saveClients(unique);
  renderClientChips();
}

// ── Goals ─────────────────────────────────────────────────────

function loadGoals() {
  return JSON.parse(localStorage.getItem('invoice-goals') || '[]');
}
function saveGoals(goals) {
  localStorage.setItem('invoice-goals', JSON.stringify(goals));
}

async function syncGoalsToSheet() {
  if (!_gmailToken || !_sheetsSpreadsheetId) return;
  const goals = loadGoals();
  if (!goals.length) return;
  const existing = await sheetsRead(_sheetsSpreadsheetId, 'Goals!A2:L');
  for (const goal of goals) {
    const rowIdx = existing.findIndex(r => r[0] && r[0].toLowerCase() === goal.name.toLowerCase());
    const newRow = [
      goal.name, 
      goal.amount || '', 
      goal.deadline || '', 
      goal.notes || '', 
      goal.created || '',
      goal.amountReached || '0',
      goal.lastContributionDate || '',
      goal.status || 'Active',
      goal.claimDate || '',
      goal.receiptNumber || '',
      goal.receiptFilename || '',
      goal.allocationPct || '0'
    ];
    if (rowIdx === -1) {
      await sheetsAppend(_sheetsSpreadsheetId, 'Goals!A:L', [newRow]);
    } else {
      const sheetRow = rowIdx + 2;
      await sheetsWrite(_sheetsSpreadsheetId, `Goals!A${sheetRow}:L${sheetRow}`, [newRow]);
    }
  }
}

async function loadGoalsFromSheet() {
  if (!_gmailToken || !_sheetsSpreadsheetId) return { success: false, error: 'Missing token or ID' };
  console.log(`🔄 [Goals] Syncing from spreadsheet: ${_sheetsSpreadsheetId}`);
  const rows = await sheetsRead(_sheetsSpreadsheetId, 'Goals!A2:L');
  
  if (rows === null) {
    console.error('❌ [Goals] Read failed (Check tab name "Goals")');
    return { success: false, error: 'Read failed' };
  }
  
  console.log(`[Goals] Raw data rows received: ${rows.length}`);
  
  const sheetGoals = rows
    .filter(r => r[0] && r[0].trim() !== '')
    .map(r => ({ 
      name: r[0], 
      amount: r[1] || '0', 
      deadline: r[2] || '', 
      notes: r[3] || '', 
      created: r[4] || '',
      amountReached: r[5] || '0',
      lastContributionDate: r[6] || '',
      status: r[7] || 'Active',
      claimDate: r[8] || '',
      receiptNumber: r[9] || '',
      receiptFilename: r[10] || '',
      allocationPct: r[11] || '0'
    }));
  
  console.log(`[Goals] Filtered valid goals: ${sheetGoals.length}`);
  
  const local = loadGoals();
  sheetGoals.forEach(sg => {
    if (!sg.name) return;
    const idx = local.findIndex(g => g.name.toLowerCase() === sg.name.toLowerCase());
    if (idx >= 0) {
      local[idx] = { ...local[idx], ...sg };
    } else {
      local.push(sg);
    }
  });
  
  // Sheet is source of truth — only keep local goals that exist in sheet (prevents deleted goals from resurrection)
  const sheetNames = new Set(sheetGoals.map(g => g.name.toLowerCase()));
  const merged = local.filter(g => g.name && sheetNames.has(g.name.toLowerCase()));
  // Re-apply sheet data on top of any local fields
  sheetGoals.forEach(sg => {
    const idx = merged.findIndex(g => g.name.toLowerCase() === sg.name.toLowerCase());
    if (idx >= 0) merged[idx] = { ...merged[idx], ...sg };
    else merged.push(sg);
  });
  const cleaned = merged.filter(g => g.name && g.name !== 'undefined');
  saveGoals(cleaned);
  console.log(`✅ [Goals] Sync complete. Local storage count: ${cleaned.length}`);
  return { success: true, count: sheetGoals.length };
}


// ── Business Profiles & Settings Sync ──────────────────────────

function loadBusinessProfiles() {
  const raw = localStorage.getItem('invoice-business-profiles');
  if (raw) return JSON.parse(raw);
  
  // Migration: if old single profile exists, convert to multi-profile
  const old = localStorage.getItem('invoice-business-profile');
  if (old) {
    const profile = JSON.parse(old);
    profile.id = 'default';
    profile.logo = localStorage.getItem('invoice-logo') || '';
    const profiles = [profile];
    saveBusinessProfiles(profiles);
    localStorage.removeItem('invoice-business-profile');
    return profiles;
  }
  return [];
}

function saveBusinessProfiles(profiles) {
  localStorage.setItem('invoice-business-profiles', JSON.stringify(profiles));
}

function getActiveProfileId() {
  return localStorage.getItem('invoice-active-profile-id') || 'default';
}

function setActiveProfileId(id) {
  localStorage.setItem('invoice-active-profile-id', id);
}

function getActiveProfile() {
  const profiles = loadBusinessProfiles();
  const id = getActiveProfileId();
  return profiles.find(p => p.id === id) || profiles[0] || null;
}

async function syncProfilesToSheet() {
  if (!_gmailToken || !_sheetsSpreadsheetId) return;
  const profiles = loadBusinessProfiles();
  if (!profiles.length) return;
  
  const rows = profiles.map(p => [
    p.id, p.name, p.address || '', p.email || '', p.phone || '', p.logo || ''
  ]);
  
  // Overwrite the Profiles sheet (simple sync for now)
  await sheetsWrite(_sheetsSpreadsheetId, `Profiles!A2:F${rows.length + 1}`, rows);
}

async function loadProfilesFromSheet() {
  if (!_gmailToken || !_sheetsSpreadsheetId) return;
  const rows = await sheetsRead(_sheetsSpreadsheetId, 'Profiles!A2:F');
  if (!rows.length) return;
  
  const sheetProfiles = rows.map(r => ({
    id: r[0], name: r[1], address: r[2], email: r[3], phone: r[4], logo: r[5]
  }));
  
  saveBusinessProfiles(sheetProfiles);
  
  // If the active profile was deleted or doesn't exist, reset to the first one
  const activeId = getActiveProfileId();
  if (!sheetProfiles.find(p => p.id === activeId)) {
    setActiveProfileId(sheetProfiles[0].id);
  }
  
  // Refresh logo if active profile changed
  const active = getActiveProfile();
  if (active && active.logo) {
    localStorage.setItem('invoice-logo', active.logo);
    renderLogo(active.logo);
  }
}

async function syncSettingsToSheet() {
  if (!_gmailToken || !_sheetsSpreadsheetId) return;
  
  const keys = [
    'invoicer-default-currency',
    'invoicer-default-pay-period',
    'invoice-theme',
    'invoice-title-font',
    'invoice-filename-preset',
    'invoice-company-prefix',
    'invoice-receipt-prefix'
  ];
  
  const rows = keys.map(k => [k, localStorage.getItem(k) || '']);
  await sheetsWrite(_sheetsSpreadsheetId, `Settings!A2:B${rows.length + 1}`, rows);
}

async function loadSettingsFromSheet() {
  if (!_gmailToken || !_sheetsSpreadsheetId) return;
  const rows = await sheetsRead(_sheetsSpreadsheetId, 'Settings!A2:B');
  if (!rows.length) return;
  
  rows.forEach(r => {
    if (r[0] && r[1] !== undefined) {
      localStorage.setItem(r[0], r[1]);
    }
  });
  
  // Apply visual settings immediately
  restoreTheme();
  restoreTitleFont();
  refreshSheetsIdStatus();
  refreshGmailIdStatus();
}

function applyClient(client) {
  const data = getData();
  data.to = { name: client.name, address: client.address || '', email: client.email || '', phone: client.phone || '' };
  data.dateOverride    = data.date;
  data.receiptOverride = data.receiptNumber;
  document.getElementById('invoice-data').textContent = JSON.stringify(data, null, 2);
  render(data);
  // Prompt to rebill pending expenses for this client
  const pending = loadClientExpenses(client.name).filter(e => !e.billed);
  if (pending.length) {
    promptRebillExpenses(client.name, pending);
  }
}

// ── Expense Rebilling ────────────────────────────────────────────

function loadClientExpenses(clientName) {
  const key = 'expenses-' + (clientName || '').toLowerCase().replace(/\s+/g, '-');
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) { return []; }
}

function saveClientExpenses(clientName, expenses) {
  const key = 'expenses-' + (clientName || '').toLowerCase().replace(/\s+/g, '-');
  localStorage.setItem(key, JSON.stringify(expenses));
}

function addClientExpense(clientName, description, amount) {
  const expenses = loadClientExpenses(clientName);
  expenses.push({ id: Date.now(), description, amount: String(amount), billed: false, date: new Date().toLocaleDateString('en-US') });
  saveClientExpenses(clientName, expenses);
  showToast(`✓ Expense logged for ${clientName}`, 'success');
}

function promptRebillExpenses(clientName, pending) {
  const total = pending.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const list = pending.map(e => `• ${e.description} — ${e.amount}`).join('\n');
  showConfirm(
    `${pending.length} unbilled expense${pending.length > 1 ? 's' : ''} found for ${clientName}:\n\n${list}\n\nTotal: ${total.toFixed(2)}\n\nAdd to this invoice as a line item?`,
    () => {
      const data = getData();
      if (!Array.isArray(data.lineItems)) data.lineItems = [];
      data.lineItems.push({
        service: 'Expense Rebill',
        details: pending.map(e => `${e.description} (${e.date})`).join(', '),
        rates: pending.map(e => e.description),
        costs: pending.map(e => e.amount)
      });
      document.getElementById('invoice-data').textContent = JSON.stringify(data, null, 2);
      render(data);
      // Mark as billed
      const all = loadClientExpenses(clientName);
      pending.forEach(p => { const idx = all.findIndex(e => e.id === p.id); if (idx >= 0) all[idx].billed = true; });
      saveClientExpenses(clientName, all);
      showToast('✓ Expenses added to invoice', 'success');
    }
  );
}

function openExpenseLogger() {
  const data = getData();
  const clientName = data.to?.name;
  if (!clientName || clientName === 'John Doe') { showToast('Apply a client first to log expenses', 'error'); return; }

  const existing = loadClientExpenses(clientName);
  const unbilled = existing.filter(e => !e.billed);

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';

  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:12px;padding:24px;width:380px;max-width:92vw;font-family:Roboto,sans-serif;max-height:80vh;overflow-y:auto;';

  const title = document.createElement('div');
  title.style.cssText = 'font-size:15px;font-weight:700;margin-bottom:4px;';
  title.textContent = 'Log Expense';
  const sub = document.createElement('div');
  sub.style.cssText = 'font-size:11px;color:#6c7682;margin-bottom:16px;';
  sub.textContent = `Client: ${clientName} · ${unbilled.length} pending`;

  const descInp = document.createElement('input');
  descInp.placeholder = 'Description (e.g. Travel, Materials)';
  descInp.style.cssText = 'width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid #ddd;border-radius:6px;font-size:12px;margin-bottom:8px;font-family:Roboto,sans-serif;';

  const amtInp = document.createElement('input');
  amtInp.placeholder = 'Amount (e.g. 150.00)';
  amtInp.type = 'number';
  amtInp.style.cssText = 'width:100%;box-sizing:border-box;padding:8px 10px;border:1.5px solid #ddd;border-radius:6px;font-size:12px;margin-bottom:12px;font-family:Roboto,sans-serif;';

  const addBtn = document.createElement('button');
  addBtn.textContent = '+ Log Expense';
  addBtn.style.cssText = 'width:100%;padding:9px;background:#14202e;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;margin-bottom:16px;font-family:Roboto,sans-serif;';

  const pendingTitle = document.createElement('div');
  pendingTitle.style.cssText = 'font-size:11px;font-weight:700;color:#6c7682;letter-spacing:0.5px;margin-bottom:6px;';
  pendingTitle.textContent = 'PENDING EXPENSES';

  const pendingList = document.createElement('div');
  const refreshPending = () => {
    pendingList.innerHTML = '';
    const items = loadClientExpenses(clientName).filter(e => !e.billed);
    if (!items.length) { pendingList.innerHTML = '<div style="font-size:11px;color:#9aa2ac;padding:8px 0;">No pending expenses.</div>'; return; }
    items.forEach(e => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #f0f0f0;font-size:11.5px;';
      const lbl = document.createElement('span');
      lbl.textContent = `${e.description} — ${e.amount}`;
      const del = document.createElement('button');
      del.textContent = '✕';
      del.style.cssText = 'background:none;border:none;color:#9aa2ac;cursor:pointer;font-size:11px;';
      del.onclick = () => { const all = loadClientExpenses(clientName); const idx = all.findIndex(x => x.id === e.id); if (idx >= 0) all.splice(idx, 1); saveClientExpenses(clientName, all); refreshPending(); sub.textContent = `Client: ${clientName} · ${loadClientExpenses(clientName).filter(x => !x.billed).length} pending`; };
      row.append(lbl, del);
      pendingList.appendChild(row);
    });
  };
  refreshPending();

  addBtn.onclick = () => {
    const desc = descInp.value.trim();
    const amt = amtInp.value.trim();
    if (!desc || !amt) { showToast('Enter description and amount', 'error'); return; }
    addClientExpense(clientName, desc, amt);
    descInp.value = ''; amtInp.value = '';
    refreshPending();
    sub.textContent = `Client: ${clientName} · ${loadClientExpenses(clientName).filter(e => !e.billed).length} pending`;
  };

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText = 'width:100%;padding:8px;background:none;border:1.5px solid #ddd;border-radius:6px;font-size:12px;cursor:pointer;margin-top:10px;font-family:Roboto,sans-serif;';
  closeBtn.onclick = () => document.body.removeChild(overlay);
  overlay.onclick = e => { if (e.target === overlay) document.body.removeChild(overlay); };

  box.append(title, sub, descInp, amtInp, addBtn, pendingTitle, pendingList, closeBtn);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  descInp.focus();
}

function seedClientsFromLedger() {
  if (loadClients().length) return; // already populated, skip
  const seen = new Set();
  loadLedgerRows().forEach(r => {
    const name = r.client && r.client.trim();
    if (!name || seen.has(name.toLowerCase())) return;
    seen.add(name.toLowerCase());
    upsertClient({ name, address: '', email: '', phone: '' });
  });
}

function renderClientChips() {
  const list = loadClients().slice().sort((a, b) => a.name.localeCompare(b.name));
  const el   = document.getElementById('client-chips');
  const data = getData();
  const currentClient = data.to?.name;
  el.innerHTML = '';
  list.forEach(c => {
    const chip = document.createElement('button');
    chip.className   = 'client-chip';
    chip.textContent = c.name.split(' ')[0]; // first name only for brevity
    chip.title       = c.name;
    if (c.name === currentClient) {
      chip.style.background = '#14202e';
      chip.style.color = '#fff';
      chip.style.borderColor = '#14202e';
    }
    chip.onclick     = () => { applyClient(c); renderClientChips(); };
    el.appendChild(chip);
  });
}

function renderClientBook() {
  const masterList = loadClients();
  let list = masterList.map((c, i) => ({ ...c, _origIdx: i }));
  list.sort((a, b) => a.name.localeCompare(b.name));

  // Build unpaid totals + last-invoiced maps keyed by client name (case-insensitive)
  const unpaidMap = {};
  const lastInvoicedMap = {};
  const parseDate = str => {
    if (!str) return null;
    const p = str.split('/').map(s => s.trim());
    if (p.length === 3) { const d = new Date(+p[2], +p[0] - 1, +p[1]); if (!isNaN(d)) return d; }
    const d = new Date(str); return isNaN(d) ? null : d;
  };
  loadLedgerRows().forEach(r => {
    const key = (r.client || '').toLowerCase();
    if ((r.status || '').toLowerCase() !== 'paid') {
      const amt = parseFloat((r.amountDue || '0').toString().replace(/[^0-9.-]/g, '')) || 0;
      unpaidMap[key] = (unpaidMap[key] || 0) + amt;
    }
    const d = parseDate(r.date);
    if (d && (!lastInvoicedMap[key] || d > lastInvoicedMap[key])) lastInvoicedMap[key] = d;
  });

  const query = (document.getElementById('client-search')?.value || '').toLowerCase();
  if (query) {
    list = list.filter(c => c.name.toLowerCase().includes(query) || (c.email || '').toLowerCase().includes(query));
  }

  const countBadge = document.getElementById('client-count-badge');
  if (countBadge) countBadge.textContent = `${list.length} client${list.length === 1 ? '' : 's'}`;

  const el = document.getElementById('client-list');
  el.innerHTML = '';

  if (!list.length) {
    el.innerHTML = '<div style="text-align:center;color:#9aa2ac;font-size:12px;padding:24px 0;">No clients found.</div>';
    return;
  }

  list.forEach((c, i) => {
    const initials = c.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

    const card = document.createElement('div');
    card.className = 'client-card';

    const top = document.createElement('div');
    top.className = 'client-card-top';

    const avatar = document.createElement('div');
    avatar.className   = 'client-avatar';
    avatar.textContent = initials;

    const info = document.createElement('div');
    info.className = 'client-card-info';
    const unpaidAmt = unpaidMap[(c.name || '').toLowerCase()] || 0;
    const unpaidBadge = unpaidAmt > 0
      ? `<span style="display:inline-block;margin-left:6px;padding:1px 6px;background:#ffebee;color:#c62828;border-radius:10px;font-size:9.5px;font-weight:700;letter-spacing:0.3px;vertical-align:middle;">OWES</span>`
      : '';
    const lastInvDate = lastInvoicedMap[(c.name || '').toLowerCase()];
    const lastInvStr = lastInvDate
      ? `Last invoiced: ${String(lastInvDate.getDate()).padStart(2,'0')} / ${String(lastInvDate.getMonth()+1).padStart(2,'0')} / ${lastInvDate.getFullYear()}`
      : '';
    const lastInvHtml = lastInvStr
      ? `<div class="client-card-last" style="font-size:10px;color:#9aa2ac;margin-top:1px;">${lastInvStr}</div>`
      : '';
    info.innerHTML = `<div class="client-card-name">${c.name}${unpaidBadge}</div><div class="client-card-sub">${c.email || c.phone || c.address || '—'}</div>${lastInvHtml}`;

    const useBtn = document.createElement('button');
    useBtn.className   = 'btn-use-client';
    useBtn.textContent = 'Use';
    useBtn.onclick     = () => { applyClient(c); toggleClientBook(); };

    const expandBtn = document.createElement('button');
    expandBtn.className   = 'btn-expand-client';
    expandBtn.textContent = '✎';
    expandBtn.title       = 'Edit client details';
    expandBtn.onclick     = () => {
      const fieldsEl = document.getElementById(`client-fields-${i}`);
      fieldsEl?.classList.toggle('open');
      expandBtn.style.color = fieldsEl?.classList.contains('open') ? 'var(--red)' : '';
    };

    top.append(avatar, info, useBtn, expandBtn);

    // Editable fields
    const fields = document.createElement('div');
    fields.className = 'client-card-fields';
    fields.id        = `client-fields-${i}`;

    // Task #84: Auto-expand if it's the selected client and missing details
    const currentInvoiceData = getData();
    const isSelected = currentInvoiceData && currentInvoiceData.to && currentInvoiceData.to.name === c.name;
    if (isSelected && (!c.address || !c.email)) {
      fields.classList.add('open');
    }

    ['name', 'address', 'email', 'phone'].forEach(key => {
      const row = document.createElement('div');
      row.className = 'field-row';
      row.style.position = 'relative';
      row.innerHTML = `<label>${key.charAt(0).toUpperCase() + key.slice(1)}</label>`;
      const inp = document.createElement('input');
      inp.value       = c[key] || '';
      inp.placeholder = key;
      inp.oninput     = () => {
        c[key] = inp.value;
        const freshMaster = loadClients();
        freshMaster[c._origIdx][key] = inp.value;
        saveClients(freshMaster);
        syncClientsToSheet();
        info.querySelector('.client-card-name').textContent = c.name;
        info.querySelector('.client-card-sub').textContent  = c.email || c.phone || c.address || '—';
        renderClientChips();
      };
      row.appendChild(inp);

      if (key === 'address') {
        const copyBtn = document.createElement('button');
        copyBtn.innerHTML = '⧉';
        copyBtn.title = 'Copy Address';
        copyBtn.style.cssText = 'position:absolute; right:6px; top:20px; background:none; border:none; color:#9aa2ac; cursor:pointer; font-size:16px; padding:6px; display:flex; align-items:center; justify-content:center;';
        copyBtn.onmouseover = () => copyBtn.style.color = '#14202e';
        copyBtn.onmouseout  = () => copyBtn.style.color = '#9aa2ac';
        copyBtn.onclick = () => {
          if (!inp.value.trim()) return;
          navigator.clipboard.writeText(inp.value.trim());
          showToast('Address copied to clipboard');
          const originalColor = copyBtn.style.color;
          copyBtn.style.color = 'var(--red, #2b5cca)';
          setTimeout(() => copyBtn.style.color = originalColor, 1000);
        };
        row.appendChild(copyBtn);
        inp.style.paddingRight = '32px'; // make room for the button
      }

      fields.appendChild(row);
    });

    const stmtBtn = document.createElement('button');
    stmtBtn.className   = 'btn-del-provider';
    stmtBtn.style.cssText = 'margin-top:10px; background:#14202e; color:#fff; border-color:#14202e;';
    stmtBtn.textContent = '📄 Statement of Account';
    stmtBtn.onclick = () => generateStatement(c.name);
    fields.appendChild(stmtBtn);

    const delBtn = document.createElement('button');
    delBtn.className   = 'btn-del-provider';
    delBtn.style.marginTop = '8px';
    delBtn.textContent = 'Remove client';
    delBtn.onclick     = async () => {
      const confirmed = await showConfirm(`Are you sure you want to delete ${c.name}?`);
      if (confirmed) {
        const freshMaster = loadClients();
        freshMaster.splice(c._origIdx, 1);
        saveClients(freshMaster);
        syncClientsToSheet();
        renderClientBook();
        renderClientChips();
      }
    };
    fields.appendChild(delBtn);

    card.append(top, fields);
    el.appendChild(card);
  });
}

function addClient() {
  const list = loadClients();
  list.push({ name: 'New Client', address: '', email: '', phone: '' });
  saveClients(list);
  syncClientsToSheet();
  renderClientBook();
  renderClientChips();
  setTimeout(() => document.getElementById(`client-fields-${list.length - 1}`)?.classList.add('open'), 50);
  showToast('New client added to Address Book.', 'success');
}

function toggleClientBook() {
  const book = document.getElementById('client-book-panel');
  const msgs = document.getElementById('chat-messages');
  const sets = document.getElementById('chat-settings-panel');
  const isOpen = book.classList.toggle('open');
  // Close settings if open
  if (isOpen && sets.classList.contains('open')) toggleChatSettings();
  msgs.style.display = isOpen ? 'none' : 'flex';
  if (isOpen) {
    renderClientBook();
    setTimeout(() => document.getElementById('client-search')?.focus(), 50);
  }
}

// ── Gmail OAuth ───────────────────────────────────────────────

// ⚠ Replace this with your own OAuth Client ID from Google Cloud Console
// console.cloud.google.com → APIs & Services → Credentials → Create OAuth 2.0 Client ID
// Application type: Web application. Add your file:// or localhost origin.
let GMAIL_CLIENT_ID = localStorage.getItem('gmail-client-id') || '622970529535-p38faf23t1pn0nhrhktam3c8gcf4r303.apps.googleusercontent.com';

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar.readonly';

// ── Invoice Templates ────────────────────────────────────────

const INVOICE_TEMPLATES = [
  { id: 'default',        label: 'General Invoice',  description: 'Blank starting point',                              category: 'General'    },
  { id: 'film-quote',     label: 'Film Quote',        description: 'Pre-production estimate — day rates, crew, gear',  category: 'Film'       },
  { id: 'film-invoice',   label: 'Film Invoice',      description: 'Post-production billing — shoot days, edit, deliverables', category: 'Film' },
  { id: 'music-session',  label: 'Music Session',     description: 'Studio session, mixing, or performance',           category: 'Music'      },
  { id: 'design-project', label: 'Design Project',    description: 'Branding, UI, or print design',                   category: 'Design'     },
  { id: 'consulting',     label: 'Consulting',        description: 'Hourly or project-based consulting',              category: 'Consulting' },
];

function getTemplateData(id) {
  switch (id) {
    case 'film-quote':       return TMPL_FILM_QUOTE;
    case 'film-invoice':     return TMPL_FILM_INVOICE;
    case 'music-session':    return TMPL_MUSIC_SESSION;
    case 'design-project':   return TMPL_DESIGN_PROJECT;
    case 'consulting':       return TMPL_CONSULTING;
    default:                 return TMPL_DEFAULT;
  }
}

const TMPL_DEFAULT = {
  receiptOverride: '', dateOverride: '', payPeriod: 'Due on Receipt', currency: 'USD',
  to: { name: '', address: '', email: '', phone: '' },
  lineItems: [{ service: 'Service Name', details: '', rates: ['Rate'], costs: ['0'] }],
  projectTotal: '0', totalLabelTop: 'Total', totalLabelBottom: 'Due', totalAmount: '$0',
  paymentNote: 'Thank you for your business.', paid: false,
};

const TMPL_FILM_QUOTE = {
  receiptOverride: '', dateOverride: '', payPeriod: 'Valid 30 Days', currency: 'USD',
  to: { name: '', address: '', email: '', phone: '' },
  lineItems: [
    { service: 'Director / DP',    details: 'Day rate. Includes pre-production and on-set supervision.',                          rates: ['Day Rate', 'x Days'],  costs: ['0', '0'] },
    { service: 'Camera Package',   details: 'Camera body, lenses, and accessories. Rental or owned.',                            rates: ['Daily', 'x Days'],     costs: ['0', '0'] },
    { service: 'Crew',             details: 'Supporting crew. AC, gaffer, sound.',                                               rates: ['Day Rate', 'x Days'],  costs: ['0', '0'] },
    { service: 'Location / Travel',details: 'Location fees, transport, and accommodation if applicable.',                        rates: ['Estimated'],           costs: ['0']      },
    { service: 'Post-Production',  details: 'Editing, colour grade, and deliverables. Quoted separately if scope changes.',      rates: ['Flat Rate'],           costs: ['0']      },
  ],
  projectTotal: '0', totalLabelTop: 'Estimate', totalLabelBottom: 'Total', totalAmount: '$0',
  paymentNote: 'This is a quote, not a final invoice. 50% deposit required to confirm booking. Final invoice issued on delivery.', paid: false,
};

const TMPL_FILM_INVOICE = {
  receiptOverride: '', dateOverride: '', payPeriod: 'Net 14', currency: 'USD',
  to: { name: '', address: '', email: '', phone: '' },
  lineItems: [
    { service: 'Production',      details: 'Principal photography. Includes on-set direction and camera operation.',       rates: ['Day Rate', 'x Shoot Days'], costs: ['0', '0'] },
    { service: 'Post-Production', details: 'Offline edit, colour grade, sound mix.',                                       rates: ['Flat Rate'],               costs: ['0']      },
    { service: 'Deliverables',    details: 'Master file (ProRes / H.264), web optimised cut, and thumbnail stills.',       rates: ['Included'],               costs: ['0']      },
    { service: 'Expenses',        details: 'Travel, accommodation, and miscellaneous on-set costs.',                       rates: ['Actuals'],                costs: ['0']      },
  ],
  projectTotal: '0', totalLabelTop: 'Balance', totalLabelBottom: 'Due', totalAmount: '$0',
  paymentNote: 'Payment due within 14 days of invoice date. Files released upon receipt of full payment.', paid: false,
};

const TMPL_MUSIC_SESSION = {
  receiptOverride: '', dateOverride: '', payPeriod: 'Due on Receipt', currency: 'USD',
  to: { name: '', address: '', email: '', phone: '' },
  lineItems: [
    { service: 'Studio Session', details: 'Recording session including engineer and studio time.', rates: ['Hourly Rate', 'x Hours'], costs: ['0', '0'] },
    { service: 'Mixing',         details: 'Full mix per track.',                                   rates: ['Per Track'],             costs: ['0']      },
    { service: 'Mastering',      details: 'Mastering for streaming and digital distribution.',     rates: ['Per Track'],             costs: ['0']      },
  ],
  projectTotal: '0', totalLabelTop: 'Total', totalLabelBottom: 'Due', totalAmount: '$0',
  paymentNote: 'Payment due on receipt. Files delivered within 5 business days of payment.', paid: false,
};

const TMPL_DESIGN_PROJECT = {
  receiptOverride: '', dateOverride: '', payPeriod: 'Net 7', currency: 'USD',
  to: { name: '', address: '', email: '', phone: '' },
  lineItems: [
    { service: 'Discovery & Strategy',   details: 'Brand audit, moodboard, and creative direction.',          rates: ['Flat Rate'],  costs: ['0'] },
    { service: 'Design',                 details: 'Primary deliverables. Includes 2 rounds of revisions.',    rates: ['Flat Rate'],  costs: ['0'] },
    { service: 'Additional Revisions',   details: 'Beyond the included rounds.',                              rates: ['Per Round'],  costs: ['0'] },
    { service: 'File Delivery',          details: 'Final files in agreed formats (AI, PDF, PNG, SVG).',       rates: ['Included'],   costs: ['0'] },
  ],
  projectTotal: '0', totalLabelTop: 'Total', totalLabelBottom: 'Due', totalAmount: '$0',
  paymentNote: 'Payment due within 7 days. Source files released upon receipt of full payment.', paid: false,
};

const TMPL_CONSULTING = {
  receiptOverride: '', dateOverride: '', payPeriod: 'Net 30', currency: 'USD',
  to: { name: '', address: '', email: '', phone: '' },
  lineItems: [
    { service: 'Consulting',   details: 'Advisory and strategy sessions.',                      rates: ['Hourly Rate', 'x Hours'], costs: ['0', '0'] },
    { service: 'Deliverables', details: 'Reports, decks, or documentation as agreed.',          rates: ['Flat Rate'],             costs: ['0']      },
  ],
  projectTotal: '0', totalLabelTop: 'Total', totalLabelBottom: 'Due', totalAmount: '$0',
  paymentNote: 'Payment due within 30 days of invoice date.', paid: false,
};

function openTemplatesModal() {
  const list = document.getElementById('templates-list');
  list.innerHTML = '';
  const categories = {};
  INVOICE_TEMPLATES.forEach(function(t) {
    if (!categories[t.category]) categories[t.category] = [];
    categories[t.category].push(t);
  });
  Object.keys(categories).forEach(function(cat) {
    const catLabel = document.createElement('div');
    catLabel.style.cssText = 'font-size:10px; letter-spacing:3px; text-transform:uppercase; color:#6c7682; margin-top:12px; margin-bottom:4px;';
    catLabel.textContent = cat;
    list.appendChild(catLabel);
    categories[cat].forEach(function(t) {
      const btn = document.createElement('button');
      btn.style.cssText = 'display:flex; flex-direction:column; align-items:flex-start; padding:10px 14px; background:#f6f6f4; border:1.5px solid transparent; border-radius:7px; cursor:pointer; font-family:Roboto,sans-serif; text-align:left; width:100%; transition:border-color 0.15s;';
      btn.onmouseover = function() { btn.style.borderColor = '#14202e'; };
      btn.onmouseout  = function() { btn.style.borderColor = 'transparent'; };
      btn.innerHTML = '<span style="font-size:13px; font-weight:600; color:#14202e;">' + t.label + '</span>'
        + '<span style="font-size:11px; color:#6c7682; margin-top:2px;">' + t.description + '</span>';
      btn.onclick = function() { applyTemplate(t.id); };
      list.appendChild(btn);
    });
  });
  document.getElementById('templates-overlay').style.display = 'flex';
}

function closeTemplatesModal() {
  document.getElementById('templates-overlay').style.display = 'none';
}

function applyTemplate(id) {
  const template = getTemplateData(id);
  let existing;
  try { existing = JSON.parse(document.getElementById('invoice-data').textContent); }
  catch(e) { showToast('Could not read invoice data. Try reloading the page.', 'error'); return; }
  const merged = Object.assign({}, existing, template, { from: existing.from, to: existing.to });
  localStorage.setItem('invoicer-preferred-template', id);
  document.getElementById('invoice-data').textContent = JSON.stringify(merged, null, 2);
  render(merged);
  closeTemplatesModal();
  startEdit();
}

function saveOAuthClientIdInput() {
  const input = document.getElementById('oauth-client-id-input');
  const id = input.value.trim();
  if (id) {
    GMAIL_CLIENT_ID = id;
    localStorage.setItem('gmail-client-id', id);
    refreshGmailIdStatus();
  }
}

let _gmailToken     = null;
let _gmailTokenExp  = 0;
let _gmailTokenClient = null;
let _sheetsSpreadsheetId = localStorage.getItem('sheets-spreadsheet-id') || '';

function gmailTokenValid() {
  return _gmailToken && Date.now() < _gmailTokenExp - 30000;
}

function saveTokenToStorage() {
  if (_gmailToken) {
    localStorage.setItem('gmail-token', _gmailToken);
    localStorage.setItem('gmail-token-exp', _gmailTokenExp);
    localStorage.setItem('gmail-token-scopes', GMAIL_SCOPE);
  }
}

function restoreTokenFromStorage() {
  const token  = localStorage.getItem('gmail-token');
  const exp    = localStorage.getItem('gmail-token-exp');
  const scopes = localStorage.getItem('gmail-token-scopes');
  // Reject stored token if it was granted for different scopes
  if (scopes !== GMAIL_SCOPE) {
    localStorage.removeItem('gmail-token');
    localStorage.removeItem('gmail-token-exp');
    localStorage.removeItem('gmail-token-scopes');
    console.log('ℹ Scopes changed — stored token cleared, re-auth required');
    return false;
  }
  if (token && exp && Date.now() < parseInt(exp) - 30000) {
    _gmailToken = token;
    _gmailTokenExp = parseInt(exp);
    console.log('✓ Restored token from storage');
    return true;
  }
  return false;
}

function initGmailAuth(onToken) {
  _gmailTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GMAIL_CLIENT_ID,
    scope:     GMAIL_SCOPE,
    callback:  resp => {
      if (resp.error) { console.error(resp); return; }
      _gmailToken    = resp.access_token;
      _gmailTokenExp = Date.now() + resp.expires_in * 1000;
      saveTokenToStorage();
      updateEmailBtn();
      if (onToken) onToken();
    },
  });
}

function requestGmailToken(onToken) {
  if (gmailTokenValid()) { if (onToken) onToken(); return; }
  // Re-init with callback so onToken fires when token arrives, then try silent refresh
  initGmailAuth(onToken);
  if (_gmailTokenClient) _gmailTokenClient.requestAccessToken({ prompt: 'none' });
}

function updateEmailBtn() {
  const profileIcon = document.getElementById('profile-icon');
  if (profileIcon) {
    profileIcon.style.stroke = gmailTokenValid() ? '#2a8c55' : '#d0241b';
  }
  const profileBtn = document.getElementById('btn-load-profile');
  if (profileBtn) {
    profileBtn.title = gmailTokenValid() ? '✓ Signed in — click to refresh token' : 'Sign in with Google';
  }
  const btn = document.getElementById('btn-email-client');
  if (btn) {
    btn.textContent = '✉ Email Client';
    btn.style.opacity = '1';
  }
  const status = document.getElementById('google-signin-status');
  if (status) {
    if (gmailTokenValid()) {
      status.textContent = '✓ Signed in';
      status.style.color = '#2a8c55';
    } else {
      status.textContent = '';
    }
  }
  const authLabel = document.getElementById('btn-google-auth-label');
  if (authLabel) {
    authLabel.textContent = gmailTokenValid() ? 'Sign out of Google' : 'Sign in with Google';
  }
  const calBtn = document.getElementById('btn-calendar');
  if (calBtn) calBtn.style.display = gmailTokenValid() ? '' : 'none';
}

function googleSignIn() {
  initGmailAuth(() => {
    updateEmailBtn();
    setupDrive();
  });
  if (_gmailTokenClient) _gmailTokenClient.requestAccessToken({ prompt: '' });
}

async function openEmail() {
  const btn = document.getElementById('btn-email-client');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Sending…'; }
  const restoreBtn = () => { if (btn) { btn.disabled = false; btn.textContent = '✉ Email Client'; } };

  const data    = getData();
  // Pre-fill email from address book if blank but client name matches
  if (!data.to.email && data.to.name) {
    const match = loadClients().find(c => c.name && c.name.toLowerCase() === data.to.name.toLowerCase());
    if (match && match.email) data.to.email = match.email;
  }
  const service = data.lineItems.map(l => l.service).join(', ');
  const to      = encodeURIComponent(data.to.email || '');
  const subject = encodeURIComponent(`moo Invoice ${data.receiptNumber} - ${service}`);
  const body    = encodeURIComponent('Please review the attached invoice.');
  // Note: to/subject/body above are only used by fallbackEmail — MIME headers use raw values

  const sendViaDraft = async () => {
    try {
      const invoiceEl = document.getElementById('invoice');
      const filename = buildFilename(localStorage.getItem('invoice-filename-preset') || 'hyphen', data) + '.pdf';
      console.log('Generating PDF...');

      // Clone so we never touch the live DOM
      const clone = invoiceEl.cloneNode(true);
      clone.style.cssText = 'margin:0;box-shadow:none;border-radius:0;width:816px;background:#fff;';
      const cs = getComputedStyle(document.body);
      clone.style.setProperty('--red', cs.getPropertyValue('--red').trim());
      clone.style.setProperty('--rule', cs.getPropertyValue('--rule').trim());
      document.body.appendChild(clone);

      const pdfBlob = await new Promise((resolve, reject) => {
        const opt = {
          margin: [10, 0], filename,
          pagebreak: { mode: 'css', avoid: ['tr', '.total-card'] },
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2 },
          jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' }
        };
        html2pdf().set(opt).from(clone).toPdf().output('blob').then(resolve).catch(reject);
      });
      document.body.removeChild(clone);

      if (gmailTokenValid()) savePdfToDrive(pdfBlob, filename);

      const pdfBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(pdfBlob);
      });
      console.log('PDF generated, size:', Math.round(pdfBase64.length / 1024), 'KB');

      const boundary = '===============' + Date.now() + '===============';
      const textBody = 'Please review the attached invoice.';
      const textPart = [
        `--${boundary}`,
        'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: 7bit',
        '',
        textBody,
      ].join('\r\n');

      const pdfPart = [
        `--${boundary}`,
        'Content-Type: application/pdf; name="' + filename + '"',
        'Content-Disposition: attachment; filename="' + filename + '"',
        'Content-Transfer-Encoding: base64',
        '',
        pdfBase64,
      ].join('\r\n');

      const fullMessage = [
        `From: ${data.from.email}`,
        `To: ${(data.to.email || '').includes('@') ? data.to.email : ''}`,
        `Subject: ${decodeURIComponent(subject)}`,
        'MIME-Version: 1.0',
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        '',
        textPart,
        pdfPart,
        `--${boundary}--`,
      ].join('\r\n');

      console.log('MIME start:', JSON.stringify(fullMessage.substring(0, 300)));
      const msgBytes = new TextEncoder().encode(fullMessage);
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < msgBytes.length; i += chunkSize) {
        binary += String.fromCharCode(...msgBytes.subarray(i, i + chunkSize));
      }
      const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${_gmailToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: { raw: encoded } }),
      });
      const json = await res.json();
      if (!res.ok) {
        console.error('Gmail API error:', json);
        throw new Error(json.error?.message || res.statusText);
      }
      window.open(`https://mail.google.com/mail/#drafts/${json.id}`, '_blank');
      markReceiptAsSent();
      restoreBtn();
    } catch (e) {
      console.error('Draft creation failed:', e.message);
      const confirmEl = document.getElementById('ledger-confirm');
      if (confirmEl) {
        confirmEl.style.display = 'block';
        confirmEl.style.color = '#d0241b';
        confirmEl.textContent = '⚠ Could not attach PDF — opening Gmail compose instead.';
      }
      restoreBtn();
      fallbackEmail();
    }
  };

  const fallbackEmail = () => {
    window.open(`https://mail.google.com/mail/?view=cm&to=${to}&su=${subject}&body=${body}`, '_blank');
    markReceiptAsSent();
  };

  if (gmailTokenValid()) {
    await sendViaDraft();
  } else {
    if (!_gmailTokenClient) initGmailAuth(null);
    _gmailTokenClient.requestAccessToken({ prompt: '' });
    const orig = _gmailTokenClient.callback;
    _gmailTokenClient.callback = async resp => {
      orig(resp);
      if (!resp.error) await sendViaDraft();
      else { restoreBtn(); fallbackEmail(); }
    };
  }
}

function resetGmailClientId() {
  localStorage.removeItem('gmail-client-id');
  location.reload();
}

// ── Google Sheets Sync ───────────────────────────────────────

async function syncToGoogleSheets(invoiceData) {
  if (!_gmailToken) return;
  if (!_sheetsSpreadsheetId) {
    const folderId = await ensureDriveFolder();
    await ensureLedgerSheet(folderId);
  }
  if (!_sheetsSpreadsheetId) return;

  try {
    const services = invoiceData.lineItems.map(l => l.service).join(', ');
    const row = [
      invoiceData.receiptNumber,
      invoiceData.date,
      invoiceData.to.name,
      services,
      invoiceData.currency + ' ' + invoiceData.projectTotal,
      invoiceData.totalAmount,
      '⬜ Unpaid',
      (invoiceData.from && invoiceData.from.name) || ''
    ];

    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${_sheetsSpreadsheetId}/values/Ledger!A:H:append?valueInputOption=USER_ENTERED`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${_gmailToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values: [row] })
      }
    );

    if (!res.ok) {
      const err = await res.json();
      console.error('Sheets sync error:', err);
    } else {
      console.log('✓ Invoice synced to Google Sheets');
    }
  } catch (e) {
    console.error('Sheets sync failed:', e.message);
  }
}

async function promptForSheetsId() {
  const id = await showPrompt(
    'Enter your Google Sheet ID for the InvoiceLedger.<br><span style="opacity:0.65;font-size:11px;">Found in the URL: spreadsheets/d/<strong>{ID}</strong>/edit<br>Sheet must have columns: Receipt #, Date, Client, Service, Project Total, Amount Due, Status</span>',
    { placeholder: 'Paste Sheet ID here', defaultValue: _sheetsSpreadsheetId || '', confirmLabel: 'Save' }
  );
  if (id) {
    _sheetsSpreadsheetId = id;
    localStorage.setItem('sheets-spreadsheet-id', id);
    showToast('✓ Spreadsheet ID saved. Invoices will now sync to Google Sheets.', 'success');
  }
}

// ── Google Drive Auto-Setup ──────────────────────────────────

let _driveFolderId = localStorage.getItem('drive-folder-id') || '';

async function driveRequest(method, path, body, isUpload) {
  const base = isUpload ? 'https://www.googleapis.com/upload/drive/v3' : 'https://www.googleapis.com/drive/v3';
  const res = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${_gmailToken}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json();
}

async function sheetsRequest(method, path, body, isRetry = false) {
  if (!_gmailToken || !_sheetsSpreadsheetId) {
    // Attempt to restore if missing
    if (typeof restoreTokenFromStorage === 'function') restoreTokenFromStorage();
    if (!_gmailToken || !_sheetsSpreadsheetId) return { error: { message: 'Missing token or spreadsheet ID' } };
  }
  
  try {
    const res = await fetch('https://sheets.googleapis.com/v4' + path, {
      method,
      headers: { Authorization: `Bearer ${_gmailToken}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });

    if ((res.status === 401 || res.status === 403) && !isRetry) {
      console.warn('Sheets API auth error, attempting silent token refresh...');
      return new Promise((resolve) => {
        try {
          initGmailAuth(() => {
            sheetsRequest(method, path, body, true).then(resolve);
          });
          if (_gmailTokenClient) _gmailTokenClient.requestAccessToken({ prompt: 'none' });
          else resolve({ error: { message: 'Token client not initialized' } });
        } catch(e) {
          resolve({ error: { message: e.message } });
        }
      });
    }

    const data = await res.json();
    if (!res.ok) {
      console.error('Sheets API Error:', data.error?.message || 'Unknown error');
      return { error: data.error || { message: res.statusText } };
    }
    return data;
  } catch (e) {
    console.error('Sheets API Fetch Exception:', e);
    return { error: { message: e.message } };
  }
}
async function sheetsWrite(spreadsheetId, range, values) {
  const res = await sheetsRequest('PUT', `/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`, { values });
  if (res.error) throw new Error(res.error.message);
  return res;
}
async function sheetsAppend(spreadsheetId, range, values) {
  const res = await sheetsRequest('POST', `/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`, { values });
  if (res.error) throw new Error(res.error.message);
  return res;
}
async function sheetsRead(spreadsheetId, range) {
  const res = await sheetsRequest('GET', `/spreadsheets/${spreadsheetId}/values/${range}`);
  if (!res || res.error) return null;
  return res.values || [];
}

async function ensureDriveFolder() {
  if (_driveFolderId) return _driveFolderId;

  // Search for existing folder
  const query = "name = 'mooInvoicer' and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
  const search = await driveRequest('GET', `/files?q=${encodeURIComponent(query)}&fields=files(id,name)`);
  if (search && search.files && search.files.length > 0) {
    _driveFolderId = search.files[0].id;
    localStorage.setItem('drive-folder-id', _driveFolderId);
    return _driveFolderId;
  }

  // Create folder
  const folder = await driveRequest('POST', '/files', { name: 'mooInvoicer', mimeType: 'application/vnd.google-apps.folder' });
  _driveFolderId = folder.id;
  localStorage.setItem('drive-folder-id', _driveFolderId);
  return _driveFolderId;
}

async function ensureAllTabs(spreadsheetId) {
  const meta = await sheetsRequest('GET', `/spreadsheets/${spreadsheetId}?fields=sheets.properties`);
  const existing = (meta.sheets || []).map(s => s.properties.title);
  const requests = [];

  if (existing.includes('Sheet1') && !existing.includes('Ledger')) {
    const sheet1 = meta.sheets.find(s => s.properties.title === 'Sheet1');
    requests.push({ updateSheetProperties: {
      properties: { sheetId: sheet1.properties.sheetId, title: 'Ledger' },
      fields: 'title'
    }});
  }

  for (const tab of ['Analysis', 'Clients', 'Goals', 'Profiles', 'Settings']) {
    if (!existing.includes(tab)) {
      requests.push({ addSheet: { properties: { title: tab } } });
    }
  }
  if (!existing.includes('_AppData')) {
    requests.push({ addSheet: { properties: { title: '_AppData', hidden: true } } });
  }

  if (requests.length) {
    await sheetsRequest('POST', `/spreadsheets/${spreadsheetId}:batchUpdate`, { requests });
  }

  // Ensure Ledger has 'Company' header (Column H)
  const ledgerMeta = await sheetsRequest('GET', `/spreadsheets/${spreadsheetId}/values/Ledger!A1:H1`);
  const ledgerHeaders = ledgerMeta.values ? ledgerMeta.values[0] : [];
  if (ledgerHeaders.length > 0 && !ledgerHeaders.includes('Company')) {
    await sheetsWrite(spreadsheetId, 'Ledger!H1', [['Company']]);
  }

  if (!existing.includes('Clients')) {
    await sheetsWrite(spreadsheetId, 'Clients!A1:D1', [['Name', 'Address', 'Email', 'Phone']]);
  }
  if (!existing.includes('Goals')) {
    await sheetsWrite(spreadsheetId, 'Goals!A1:L1', [['Name', 'Target Amount', 'Deadline', 'Notes', 'Created', 'Amount Reached', 'Last Contribution', 'Status', 'Claim Date', 'Receipt #', 'Receipt File', 'Allocation %']]);
  }
  if (!existing.includes('Profiles')) {
    await sheetsWrite(spreadsheetId, 'Profiles!A1:F1', [['Profile ID', 'Name', 'Address', 'Email', 'Phone', 'LogoData']]);
  }
  if (!existing.includes('Settings')) {
    await sheetsWrite(spreadsheetId, 'Settings!A1:B1', [['Setting Key', 'Value']]);
  }
  if (!existing.includes('Analysis')) {
    await writeAnalysisFormulas(spreadsheetId);
  }
  if (!existing.includes('_AppData')) {
    await sheetsWrite(spreadsheetId, '_AppData!A1:C1', [['Currency', 'Rate (to USD)', 'Last Read']]);
  }
}

async function writeAnalysisFormulas(spreadsheetId) {
  const amtArr = 'IFERROR(VALUE(SUBSTITUTE(SUBSTITUTE(Ledger!F2:F1000,"$",""),",","")),0)';
  const dateVal = 'IFERROR(DATEVALUE(SUBSTITUTE(Ledger!B2:B1000,"/ ","/")),0)';
  const rows = [
    ['Metric', 'Value'],
    ['This Month (Paid)',  `=SUMPRODUCT((TEXT(${dateVal},"YYYY-MM")=TEXT(TODAY(),"YYYY-MM"))*(Ledger!G2:G1000="✅ Paid")*(${amtArr}))`],
    ['This Quarter (All)', `=SUMPRODUCT((YEAR(${dateVal})&"-Q"&INT((MONTH(${dateVal})-1)/3+1)=YEAR(TODAY())&"-Q"&INT((MONTH(TODAY())-1)/3+1))*(${amtArr}))`],
    ['Average Invoice',   `=IFERROR(AVERAGE(ARRAYFORMULA(IF(Ledger!F2:F1000="","",${amtArr}))),0)`],
    ['Paid Count',        '=COUNTIF(Ledger!G2:G1000,"✅ Paid")'],
    ['Unpaid Count',      '=COUNTIF(Ledger!G2:G1000,"⬜ Unpaid")'],
    ['Deposit Count',     '=COUNTIF(Ledger!G2:G1000,"💰 Deposit")'],
    ['Outstanding',       `=SUMPRODUCT((Ledger!G2:G1000<>"✅ Paid")*(Ledger!G2:G1000<>"")*(${amtArr}))`],
  ];
  await sheetsWrite(spreadsheetId, 'Analysis!A1:B8', rows);
}

async function ensureLedgerSheet(folderId) {
  if (_sheetsSpreadsheetId) return _sheetsSpreadsheetId;

  // Search for existing ledger in folder (match either 'Invoice Ledger' or 'InvoiceLedger')
  const query = `(name = 'Invoice Ledger' or name = 'InvoiceLedger') and '${folderId}' in parents and trashed = false`;
  const search = await driveRequest('GET', `/files?q=${encodeURIComponent(query)}&fields=files(id,name)`);
  if (search && search.files && search.files.length > 0) {
    _sheetsSpreadsheetId = search.files[0].id;
    localStorage.setItem('sheets-spreadsheet-id', _sheetsSpreadsheetId);
    return _sheetsSpreadsheetId;
  }

  // Create spreadsheet via Drive (so it lands in our folder)
  const file = await driveRequest('POST', '/files', {
    name: 'InvoiceLedger',
    mimeType: 'application/vnd.google-apps.spreadsheet',
    parents: [folderId]
  });
  _sheetsSpreadsheetId = file.id;
  localStorage.setItem('sheets-spreadsheet-id', _sheetsSpreadsheetId);

  // Write header row (tab is still called Sheet1 at creation; ensureAllTabs renames it)
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${_sheetsSpreadsheetId}/values/Sheet1!A1:G1?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${_gmailToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [['Receipt #', 'Date', 'Client', 'Service', 'Project Total', 'Amount Due', 'Status']] })
    }
  );
  // ensureAllTabs() called immediately after in setupDrive will rename Sheet1 → Ledger

  return _sheetsSpreadsheetId;
}

async function setupDrive() {
  if (!gmailTokenValid()) return;
  const statusEl = document.getElementById('drive-setup-status');
  try {
    if (statusEl) statusEl.textContent = 'Setting up...';
    console.log('[Drive] Starting setup...');
    const folderId = await ensureDriveFolder();
    console.log(`[Drive] Folder identified: ${folderId}`);
    
    await ensureLedgerSheet(folderId);
    console.log(`[Drive] Spreadsheet identified: ${_sheetsSpreadsheetId}`);
    
    await ensureAllTabs(_sheetsSpreadsheetId);

    // Pull all data in parallel to warm cache
    const results = await Promise.allSettled([
      loadLedgerFromSheet(),
      loadClientsFromSheet(),
      loadGoalsFromSheet(),
      loadProfilesFromSheet(),
      loadSettingsFromSheet()
    ]);
    
    results.forEach((res, i) => {
      if (res.status === 'rejected') console.error(`[Drive] Sync task ${i} failed:`, res.reason);
    });

    const [sheetRows] = results[0].status === 'fulfilled' ? [results[0].value] : [null];
    if (sheetRows) saveLedgerRows(sheetRows);

    seedClientsFromLedger();
    renderClientChips();
    
    if (statusEl) {
      statusEl.innerHTML = '✓ <strong style="color:#2a8c55;">mooInvoicer/</strong> folder ready : Ledger connected';
      statusEl.style.color = '#2a8c55';
    }
    refreshSheetsIdStatus();
    renderDashboard();
  } catch (e) {
    console.error('[Drive] Setup failed:', e);
    if (statusEl) { statusEl.textContent = '✗ Drive setup failed. Check permissions.'; statusEl.style.color = '#d0241b'; }
  }
}

async function savePdfToDrive(pdfBlob, filename) {
  if (!gmailTokenValid() || !_driveFolderId) return null;
  try {
    const metadata = { name: filename, parents: [_driveFolderId] };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', pdfBlob, filename);

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { Authorization: `Bearer ${_gmailToken}` },
      body: form
    });
    const json = await res.json();
    console.log('✓ PDF saved to Drive:', json.name);
    showToast(`PDF saved to Drive: ${json.name}`, 'success');
    return json.id;
  } catch (e) {
    console.error('Drive PDF save failed:', e.message);
    return null;
  }
}

// ── Calendar import ──────────────────────────────────────────────

async function fetchCalendarEvents(keyword) {
  const past   = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);
  const future = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

  const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
    + '?q='             + encodeURIComponent(keyword)
    + '&timeMin='       + encodeURIComponent(past.toISOString())
    + '&timeMax='       + encodeURIComponent(future.toISOString())
    + '&singleEvents=true'
    + '&orderBy=startTime'
    + '&maxResults=50';

  const res = await fetch(url, {
    headers: { Authorization: 'Bearer ' + _gmailToken }
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error('Token expired — please sign in again.');
    const err = await res.json();
    throw new Error((err.error && err.error.message) || res.statusText);
  }

  const data = await res.json();
  const items = (data.items || []).filter(function(e) { return e.status !== 'cancelled'; });
  // Most recent first so top results are the newest past events
  return items.slice().sort(function(a, b) {
    const ta = new Date((a.start && (a.start.dateTime || a.start.date)) || 0).getTime();
    const tb = new Date((b.start && (b.start.dateTime || b.start.date)) || 0).getTime();
    return tb - ta;
  }).slice(0, 20);
}

function buildDraftFromEvent(event) {
  const startRaw = (event.start && (event.start.dateTime || event.start.date)) || '';
  const dateStr  = startRaw
    ? new Date(startRaw).toLocaleDateString('en-GB').replace(/\//g, ' / ')
    : '';

  const attendees   = event.attendees || [];
  const selfEmail   = (event.organizer && event.organizer.self && event.organizer.email) || '';
  const client      = attendees.filter(function(a) { return !a.self && a.email !== selfEmail; })[0] || null;
  const clientName  = (client && (client.displayName || client.email)) || '';
  const clientEmail = (client && client.email) || '';

  return {
    dateOverride:    dateStr,
    receiptOverride: '',
    payPeriod:       'Due on Receipt',
    currency:        'USD',
    to: {
      name:    clientName,
      address: '',
      email:   clientEmail,
      phone:   '',
    },
    lineItems: [
      {
        service: event.summary || 'Service',
        details: event.description || '',
        rates:   ['Rate'],
        costs:   ['0'],
      }
    ],
    projectTotal:     '0',
    totalLabelTop:    'Total',
    totalLabelBottom: 'Due',
    totalAmount:      '$0',
    paymentNote:      '',
    paid:             false,
  };
}

// ── Dashboard ─────────────────────────────────────────────────

async function openDashboard() {
  document.getElementById('dashboard-overlay').style.display = 'flex';
  const emptyEl = document.getElementById('dash-empty');
  if (emptyEl) {
    emptyEl.style.display = 'block';
    emptyEl.textContent = '🔄 Syncing cloud data...';
  }
  
  try {
    const [rows, goalRes] = await Promise.all([
      loadLedgerFromSheet(),
      loadGoalsFromSheet(),
    ]);
    
    if (rows) saveLedgerRows(rows);
    
    if (emptyEl) {
      if (rows && rows.length > 0) {
        emptyEl.style.display = 'none';
      } else {
        emptyEl.textContent = 'Sign in with Google and save an invoice to see your stats here.';
      }
    }
    
    if (goalRes && !goalRes.success) {
      console.warn('Goals sync failed:', goalRes.error);
      showToast('Goals sync failed.', 'info');
      
      const diagEl = document.getElementById('dash-diagnostics');
      const detEl  = document.getElementById('diag-details');
      if (diagEl && detEl) {
        diagEl.style.display = 'block';
        detEl.innerHTML = `
          Folder: ${_driveFolderId || 'Not found'}<br>
          Sheet: ${_sheetsSpreadsheetId || 'Not found'}<br>
          Error: ${goalRes.error}<br>
          Token: ${gmailTokenValid() ? 'Valid' : 'Expired/Missing'}
        `;
      }
    }
  } catch (e) {
    console.error('Dashboard sync failed:', e);
    if (emptyEl) emptyEl.textContent = '⚠️ Sync failed. Check connection.';
    showToast('Could not sync with Google Sheets.', 'error');
  }
  
  renderDashboard();
}
function closeDashboard() {
  document.getElementById('dashboard-overlay').style.display = 'none';
}

function renderDashboard() {
  const rows = loadLedgerRows();
  const emptyEl = document.getElementById('dash-empty');
  
  // Toggle visibility of empty state vs ledger stats
  if (emptyEl) emptyEl.style.display = rows.length ? 'none' : 'block';
  
  const statsDisplay = rows.length ? 'flex' : 'none';
  const gridDisplay  = rows.length ? 'grid' : 'none';
  
  const statsGrid = document.getElementById('dash-stats-grid');
  if (statsGrid) statsGrid.style.display = gridDisplay;
  
  const topClientCard = document.getElementById('dash-top-client-card');
  if (topClientCard) topClientCard.style.display = statsDisplay;
  
  const chartTitle = document.getElementById('dash-chart-title');
  if (chartTitle) chartTitle.style.display = statsDisplay;
  
  const chartDiv = document.getElementById('dash-chart');
  if (chartDiv) chartDiv.style.display = statsDisplay;

  const now = new Date();

  function parseAmt(str) {
    return parseFloat((str || '').replace(/[^0-9.]/g, '')) || 0;
  }
  function parseRowDate(str) {
    if (!str) return null;
    const parts = str.split('/').map(s => s.trim());
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
      if (!isNaN(d.valueOf())) return d;
    }
    const d = new Date(str);
    if (!isNaN(d.valueOf())) return d;
    return null;
  }
  function rowYM(row) {
    const d = parseRowDate(row.date);
    if (!d) return '';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function rowQ(row) {
    const d = parseRowDate(row.date);
    if (!d) return '';
    return d.getFullYear() + '-Q' + Math.ceil((d.getMonth() + 1) / 3);
  }

  const thisYM = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  const thisQ  = now.getFullYear() + '-Q' + Math.ceil((now.getMonth() + 1) / 3);

  const paid = rows.filter(r => r.status === '✅ Paid');
  const unpaidDeposit = rows.filter(r => r.status === '⬜ Unpaid' || r.status === '💰 Deposit');

  let monthPaidYM = thisYM;
  let monthPaid = paid.filter(r => rowYM(r) === thisYM).reduce((s, r) => s + parseAmt(r.amountDue), 0);
  if (monthPaid === 0) {
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastYM = lastMonth.getFullYear() + '-' + String(lastMonth.getMonth() + 1).padStart(2, '0');
    const lastMonthPaid = paid.filter(r => rowYM(r) === lastYM).reduce((s, r) => s + parseAmt(r.amountDue), 0);
    if (lastMonthPaid > 0) { monthPaid = lastMonthPaid; monthPaidYM = lastYM; }
  }
  const quarterAll  = rows.filter(r => rowQ(r) === thisQ).reduce((s, r) => s + parseAmt(r.amountDue), 0);
  const avgInvoice  = rows.length ? rows.reduce((s, r) => s + parseAmt(r.amountDue), 0) / rows.length : 0;
  const outstanding = unpaidDeposit.reduce((s, r) => s + parseAmt(r.amountDue), 0);

  const currencyCode = (() => {
    try {
      // 1. Try first ledger row
      const pt = rows[0] && rows[0].amountDue;
      if (pt) {
        const match = String(pt).trim().match(/^([a-zA-Z]{2,4})/);
        if (match) return match[1].toUpperCase();
      }
      // 2. Fallback to active invoice
      const data = getData();
      if (data && data.currency) return String(data.currency).toUpperCase();
    } catch (e) {}
    return 'USD';
  })();
  
  window.currentDashCurrency = currencyCode;
  const fmt = n => {
    const val = parseFloat(n);
    if (isNaN(val)) return '—';
    return formatCurrencyNative(Math.round(val), currencyCode, 0);
  };

  if (rows.length) {
    const monthLabelEl = document.querySelector('#dash-month').previousElementSibling;
    if (monthLabelEl && monthPaidYM !== thisYM) {
      const [ly, lm] = monthPaidYM.split('-').map(Number);
      const lastMonthName = new Date(ly, lm - 1, 1).toLocaleString('default', { month: 'long' });
      monthLabelEl.textContent = `${lastMonthName} · Paid`;
    } else if (monthLabelEl) {
      monthLabelEl.textContent = 'This Month · Paid';
    }
    document.getElementById('dash-month').textContent       = fmt(monthPaid);
    document.getElementById('dash-quarter').textContent     = fmt(quarterAll);
    document.getElementById('dash-avg').textContent         = fmt(avgInvoice);
    document.getElementById('dash-outstanding').textContent = fmt(outstanding);

    const clientTotals = {};
    rows.forEach(r => {
      const name = (r.client || '').trim();
      if (!name) return;
      clientTotals[name] = (clientTotals[name] || 0) + parseAmt(r.amountDue);
    });
    const topClient = Object.entries(clientTotals).sort((a, b) => b[1] - a[1])[0];
    const topClientEl    = document.getElementById('dash-top-client');
    const topClientAmtEl = document.getElementById('dash-top-client-amt');
    if (topClientEl && topClientAmtEl) {
      if (topClient) {
        topClientEl.textContent    = topClient[0];
        topClientAmtEl.textContent = fmt(topClient[1]);
      } else {
        topClientEl.textContent    = '—';
        topClientAmtEl.textContent = '—';
      }
    }

    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
    }
    const totals = months.map(m => {
      const [y, mo] = m.split('-').map(Number);
      const date = new Date(y, mo - 1, 1);
      return {
        label: date.toLocaleString('default', { month: 'short' }),
        total: rows.filter(r => rowYM(r) === m).reduce((s, r) => s + parseAmt(r.amountDue), 0)
      };
    });
    const maxTotal = Math.max(...totals.map(t => t.total), 1);
    const chart = document.getElementById('dash-chart');
    chart.innerHTML = '';
    totals.forEach(t => {
      const pct = Math.round((t.total / maxTotal) * 100);
      const bar = document.createElement('div');
      bar.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:5px;';
      bar.innerHTML = `
        <span style="font-size:10px; width:28px; color:#9aa2ac; flex-shrink:0;">${t.label}</span>
        <div style="flex:1; background:#eeeeec; border-radius:3px; height:14px;">
          <div style="width:${pct}%; background:#14202e; height:100%; border-radius:3px; transition:width 0.3s;"></div>
        </div>
        <span style="font-size:11px; font-weight:600; min-width:64px; text-align:right; color:#14202e;">${t.total > 0 ? fmt(t.total) : '—'}</span>`;
      chart.appendChild(bar);
    });
  }

  renderGoalsList();

  const profileNameEl = document.getElementById('dash-profile-name');
  if (profileNameEl) {
    const profile = loadBusinessProfile();
    profileNameEl.textContent = profile && profile.name ? profile.name : '— not saved —';
  }
}

function renderGoalsList() {
  const goals = loadGoals();
  const el = document.getElementById('dash-goals-list');
  if (!el) return;
  el.innerHTML = '';
  if (!goals.length) {
    el.innerHTML = '<p style="font-size:12px; color:#9aa2ac; margin:0 0 8px;">No goals yet.</p>';
    return;
  }
  goals.forEach((g, i) => {
    const div = document.createElement('div');
    let bg = '#f6f6f4';
    let claimBtn = '';
    const reached = parseFloat(g.amountReached) || 0;
    const target = parseFloat(g.amount) || 0;
    
    if (g.status === 'Claimed') {
      bg = '#e2e3e5';
      claimBtn = `<span style="font-size:11px; color:#6c7682; font-weight:600; display:flex; align-items:center; gap:4px;">✓ Claimed</span>`;
    } else if (reached >= target && target > 0) {
      bg = '#d4edda';
      claimBtn = `<button onclick="openClaimModal('${g.name}')" style="background:#155724; color:#fff; border:none; padding:4px 10px; border-radius:4px; font-size:11px; font-weight:600; cursor:pointer;">Claim Reward</button>`;
    } else if (reached > 0) {
      bg = '#cce5ff';
    }
    
    div.style.cssText = `background:${bg}; border-radius:8px; padding:12px 14px; margin-bottom:8px; position:relative; overflow:hidden;`;
    
    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px; position:relative; z-index:2; gap:6px;">
        <strong class="goal-name" style="font-size:13px; color:#14202e; flex:1; min-width:0; word-break:break-word;">${g.name}</strong>
        <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
          <button onclick="editGoal(${i})" style="background:none; border:none; cursor:pointer; font-size:11px; color:#9aa2ac; padding:0; line-height:1; letter-spacing:0.5px;" title="Edit goal">Edit</button>
          <button onclick="deleteGoal(${i})" style="background:none; border:none; cursor:pointer; font-size:13px; color:#9aa2ac; padding:0; line-height:1;" title="Delete goal">✕</button>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:6px; position:relative; z-index:2;">
        ${claimBtn}
        ${g.deadline ? `<span class="goal-target" style="font-size:11px; color:#9aa2ac;">Due ${g.deadline}</span>` : ''}
        <span class="goal-target" style="font-size:12px; color:#6c7682;">${formatCurrencyNative(reached, window.currentDashCurrency || 'USD', 0)} / ${formatCurrencyNative(target, window.currentDashCurrency || 'USD', 0)}</span>
      </div>
      <div style="font-size:11px; color:#9aa2ac; position:relative; z-index:2;">${g.notes ? g.notes.replace(/https?:\/\/[^\s]+/g, url => `<a href="${url}" target="_blank" rel="noopener" style="color:#5b4fcf; word-break:break-all;">${url}</a>`) : 'No notes provided'}</div>
      <!-- Progress Bar -->
      <div class="goal-bar-wrap" style="width:100%; height:6px; background:rgba(0,0,0,0.05); border-radius:3px; margin-top:8px; overflow:hidden; position:relative; z-index:2;">
         <div class="goal-bar-fill" style="height:100%; width:0%; background:#14202e; transition:width 0.6s ease-out;"></div>
      </div>`;
    el.appendChild(div);
    // Animate bar from 0 → target width on next frame so CSS transition fires
    const targetPct = target > 0 ? Math.min(100, (reached / target) * 100) : 0;
    requestAnimationFrame(() => {
      const fill = div.querySelector('.goal-bar-fill');
      if (fill) fill.style.width = targetPct + '%';
    });
  });
}

let _editingGoalIdx = -1;

function addGoal() {
  _editingGoalIdx = -1;
  const overlay = document.getElementById('goal-overlay');
  ['goal-input-name','goal-input-amount','goal-input-deadline','goal-input-notes','goal-input-allocation'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('goal-modal-error').style.display = 'none';
  overlay.style.display = 'flex';
  setTimeout(() => document.getElementById('goal-input-name').focus(), 50);
}

function editGoal(idx) {
  const goals = loadGoals();
  const g = goals[idx];
  if (!g) return;
  _editingGoalIdx = idx;
  document.getElementById('goal-input-name').value    = g.name || '';
  document.getElementById('goal-input-amount').value  = g.amount || '';
  document.getElementById('goal-input-deadline').value = g.deadline || '';
  document.getElementById('goal-input-notes').value      = g.notes || '';
  document.getElementById('goal-input-allocation').value = g.allocationPct || '';
  document.getElementById('goal-modal-error').style.display = 'none';
  document.getElementById('goal-overlay').style.display = 'flex';
  setTimeout(() => document.getElementById('goal-input-name').focus(), 50);
}

function closeGoalModal() {
  document.getElementById('goal-overlay').style.display = 'none';
}

function submitGoalModal() {
  const name        = (document.getElementById('goal-input-name').value || '').trim();
  const amountRaw   = (document.getElementById('goal-input-amount').value || '').trim();
  const deadline    = (document.getElementById('goal-input-deadline').value || '').trim();
  const notes       = (document.getElementById('goal-input-notes').value || '').trim();
  const allocRaw    = (document.getElementById('goal-input-allocation').value || '').trim();
  const allocationPct = allocRaw ? Math.min(100, Math.max(0, parseFloat(allocRaw) || 0)) : 0;
  const errEl       = document.getElementById('goal-modal-error');

  if (!name) {
    errEl.textContent = 'Goal name is required.';
    errEl.style.display = 'block';
    document.getElementById('goal-input-name').focus();
    return;
  }
  const amount = parseFloat(amountRaw);
  if (!amountRaw || isNaN(amount) || amount < 0) {
    errEl.textContent = 'Please enter a valid target amount (e.g. 3500).';
    errEl.style.display = 'block';
    document.getElementById('goal-input-amount').focus();
    return;
  }

  const goals = loadGoals();
  if (_editingGoalIdx >= 0 && _editingGoalIdx < goals.length) {
    goals[_editingGoalIdx] = { ...goals[_editingGoalIdx], name, amount: String(amount), deadline, notes, allocationPct };
  } else {
    goals.push({ name, amount: String(amount), deadline, notes, allocationPct, created: new Date().toISOString().slice(0, 10) });
  }
  _editingGoalIdx = -1;
  saveGoals(goals);
  syncGoalsToSheet();
  renderGoalsList();
  closeGoalModal();
}

function deleteGoal(idx) {
  const goals = loadGoals();
  goals.splice(idx, 1);
  saveGoals(goals);
  syncGoalsToSheet();
  renderGoalsList();
}

// ── Goal Allocations & Claims ─────────────────────────────────

function renderAllocationUI(container, row) {
  container.innerHTML = '';

  // 3-day retroactive window — only invoices created within the last 3 days can contribute to goals
  if (row.date) {
    try {
      const parts = row.date.split('/').map(s => s.trim());
      if (parts.length === 3) {
        const invoiceDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`);
        const daysDiff = (new Date() - invoiceDate) / (1000 * 60 * 60 * 24);
        if (daysDiff > 3) {
          container.innerHTML = '<div style="font-size:11px; color:#6c7682; background:#f6f6f4; padding:8px 10px; border-radius:6px;">Goal contributions are only available for invoices created within the last 3 days.</div>';
          return;
        }
      }
    } catch(e) {}
  }

  const goals = loadGoals().filter(g => g.status !== 'Claimed' && !(g.status === 'Funded' && g.receiptNumber));
  if (!goals.length) {
    container.innerHTML = '<div style="font-size:11px; color:#6c7682;">No active goals. Create one in the dashboard to allocate funds.</div>';
    return;
  }
  
  const title = document.createElement('div');
  title.style.cssText = 'font-size:11px; font-weight:600; color:#14202e; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;';
  title.textContent = 'Allocate Funds to Goal';
  
  const grid = document.createElement('div');
  grid.style.cssText = 'display:flex; flex-wrap:wrap; gap:6px;';
  
  // Manual % input — only shown for goals without a fixed allocationPct
  const inputWrap = document.createElement('div');
  inputWrap.style.cssText = 'display:none; align-items:center; gap:8px; margin-top:8px;';
  const pctInput = document.createElement('input');
  pctInput.type = 'number'; pctInput.min = '1'; pctInput.max = '100';
  pctInput.placeholder = '% of invoice';
  pctInput.style.cssText = 'width:80px; padding:6px; border:1px solid #ddd; border-radius:4px; font-size:12px; text-align:center; outline:none;';
  const manualConfirmBtn = document.createElement('button');
  manualConfirmBtn.textContent = 'Apply';
  manualConfirmBtn.style.cssText = 'padding:6px 12px; background:#14202e; color:#fff; border:none; border-radius:4px; font-size:11px; font-weight:600; cursor:pointer;';

  let selectedGoal = null;

  const doAllocate = async (goal, pct, btn) => {
    btn.disabled = true;
    btn.textContent = '…';
    try {
      await window.allocateToGoal(row, goal, pct);
      container.innerHTML = `<div style="font-size:11px; color:#155724; background:#d4edda; padding:6px 10px; border-radius:4px;">✓ ${pct}% allocated to "${goal.name}"</div>`;
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Apply';
      // If FX rate unavailable, show inline hint and open Developer Settings
      if (err.message.includes('FX rate')) {
        container.insertAdjacentHTML('beforeend', `<div style="font-size:11px; color:#d0241b; background:#fde8e8; padding:6px 10px; border-radius:4px; margin-top:6px;">⚠ No FX rate for ${row.projectTotal?.split(' ')[0] || 'this currency'}. Sign in with Google or set a manual rate in Developer Settings below.</div>`);
        // Open Developer Settings panel in print modal
        const devPanel = document.querySelector('#print-overlay .dev-chevron')?.closest('button');
        if (devPanel) { const panel = devPanel.nextElementSibling; if (panel) panel.style.display = 'block'; devPanel.querySelector('.dev-chevron').style.transform = 'rotate(180deg)'; }
      } else {
        showToast(err.message, 'error');
      }
    }
  };

  manualConfirmBtn.onclick = () => {
    if (!selectedGoal || !pctInput.value) return;
    const pct = parseFloat(pctInput.value);
    if (isNaN(pct) || pct <= 0) return;
    // Save this % back to the goal so it pre-fills next time
    const goals = loadGoals();
    const idx = goals.findIndex(g => g.name === selectedGoal.name);
    if (idx !== -1) { goals[idx].allocationPct = pct; saveGoals(goals); syncGoalsToSheet(); }
    doAllocate(selectedGoal, pct, manualConfirmBtn);
  };
  inputWrap.append(pctInput, document.createTextNode('%  '), manualConfirmBtn);

  const buttons = [];
  goals.forEach(g => {
    const pct = parseFloat(g.allocationPct) || 0;
    const target = parseFloat(g.amount) || 0;
    const reached = parseFloat(g.amountReached) || 0;

    let bg = '#e0e0e0', color = '#333';
    if (reached >= target && target > 0) { bg = '#d4edda'; color = '#155724'; }
    else if (reached > 0) { bg = '#cce5ff'; color = '#004085'; }

    const btn = document.createElement('button');
    btn.style.cssText = `padding:5px 10px; border:1px solid transparent; border-radius:4px; background:${bg}; color:${color}; font-size:11px; cursor:pointer; transition:all 0.1s; text-align:left;`;
    btn.innerHTML = `<strong>${g.name}</strong>${pct ? ` <span style="opacity:0.7;">${pct}%</span>` : ''}`;

    btn.onclick = () => {
      buttons.forEach(b => b.style.borderColor = 'transparent');
      btn.style.borderColor = '#14202e';
      selectedGoal = g;

      if (pct) {
        // Fixed % set on goal — apply immediately, no manual input needed
        inputWrap.style.display = 'none';
        doAllocate(g, pct, btn);
      } else {
        // No fixed % — show manual input
        inputWrap.style.display = 'flex';
        pctInput.value = '';
        pctInput.focus();
      }
    };

    buttons.push(btn);
    grid.appendChild(btn);
  });

  container.append(title, grid, inputWrap);
}

let _claimingGoal = null;
function openClaimModal(goalName) {
  _claimingGoal = loadGoals().find(g => g.name === goalName);
  if (!_claimingGoal) return;
  document.getElementById('claim-modal-title').textContent = `Claim: ${_claimingGoal.name}`;
  document.getElementById('claim-input-receipt').value = '';
  document.getElementById('claim-input-file').value = '';
  document.getElementById('claim-overlay').style.display = 'flex';
}
function closeClaimModal() {
  document.getElementById('claim-overlay').style.display = 'none';
  _claimingGoal = null;
}
async function submitClaimModal() {
  const receipt = document.getElementById('claim-input-receipt').value.trim();
  if (!receipt) {
    showToast('Receipt reference is required.', 'warning'); return;
  }
  const fileInput = document.getElementById('claim-input-file');
  const file = fileInput.files[0];
  
  const btn = document.getElementById('btn-submit-claim');
  btn.disabled = true;
  btn.textContent = 'Processing...';
  
  try {
    let filename = '';
    if (file) {
      if (!_driveFolderId) await ensureDriveFolder();
      const query = `name = 'receipts' and '${_driveFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
      const search = await driveRequest('GET', `/files?q=${encodeURIComponent(query)}&fields=files(id,name)`);
      let receiptsFolderId;
      if (search && search.files && search.files.length > 0) {
        receiptsFolderId = search.files[0].id;
      } else {
        const folder = await driveRequest('POST', '/files', { name: 'receipts', mimeType: 'application/vnd.google-apps.folder', parents: [_driveFolderId] });
        receiptsFolderId = folder.id;
      }
      
      // Step 1: Create metadata to get a File ID
      const metaRes = await driveRequest('POST', '/files', { 
        name: file.name, 
        parents: [receiptsFolderId] 
      });
      if (!metaRes.id) throw new Error("Failed to create receipt metadata in Drive.");
      
      // Step 2: Upload file media to the newly created File ID
      const uploadRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${metaRes.id}?uploadType=media`, {
        method: 'PATCH',
        headers: { 
          'Authorization': `Bearer ${_gmailToken}`,
          'Content-Type': file.type || 'application/octet-stream'
        },
        body: file
      });
      
      if (!uploadRes.ok) throw new Error("Failed to upload receipt image data to Drive.");
      const uploaded = await uploadRes.json();
      filename = uploaded.name || metaRes.name || file.name;
    }
    
    const goals = loadGoals();
    const idx = goals.findIndex(g => g.name === _claimingGoal.name);
    if (idx !== -1) {
      goals[idx].status = "Claimed";
      goals[idx].claimDate = new Date().toISOString().split('T')[0];
      goals[idx].receiptNumber = receipt;
      goals[idx].receiptFilename = filename;
      saveGoals(goals);
      await syncGoalsToSheet();
      renderGoalsList();
    }
    closeClaimModal();
    showToast('Goal claimed successfully!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Submit Claim';
  }
}

// ── AI chat dispatch functions ────────────────────────────────

function applyAddGoal(goalData, actionNotes) {
  if (!goalData || !goalData.name) { console.warn('[applyAddGoal] Missing name.', goalData); return; }
  const goals = loadGoals();
  const existing = goals.findIndex(g => g.name.toLowerCase() === goalData.name.toLowerCase());
  if (existing >= 0) { console.warn('[applyAddGoal] Goal already exists — use _updateGoal:', goalData.name); return; }
  goals.push({
    name:          goalData.name,
    amount:        typeof goalData.amount === 'number' ? goalData.amount : parseFloat(goalData.amount) || 0,
    deadline:      goalData.deadline || '',
    allocationPct: typeof goalData.allocationPct === 'number' ? goalData.allocationPct : 0,
    notes:         goalData.notes || '',
    created:       new Date().toISOString().slice(0, 10)
  });
  saveGoals(goals);
  syncGoalsToSheet();
  renderGoalsList();
  actionNotes.push(`Goal added: ${goalData.name}`);
}

function applyUpdateGoal(updateData, actionNotes) {
  if (!updateData || !updateData.name) { console.warn('[applyUpdateGoal] Missing name.', updateData); return; }
  const goals = loadGoals();
  const idx = goals.findIndex(g => g.name.toLowerCase() === updateData.name.toLowerCase());
  if (idx < 0) { console.warn('[applyUpdateGoal] No goal found:', updateData.name); return; }
  const c = updateData.changes || {};
  if ('amount'        in c) goals[idx].amount        = typeof c.amount === 'number' ? c.amount : parseFloat(c.amount) || 0;
  if ('deadline'      in c) goals[idx].deadline      = c.deadline || '';
  if ('allocationPct' in c) goals[idx].allocationPct = typeof c.allocationPct === 'number' ? c.allocationPct : 0;
  if ('notes'         in c) goals[idx].notes         = c.notes || '';
  saveGoals(goals);
  syncGoalsToSheet();
  renderGoalsList();
  actionNotes.push(`Goal updated: ${goals[idx].name}`);
}

function applyDeleteGoal(deleteData, actionNotes) {
  if (!deleteData || !deleteData.name) { console.warn('[applyDeleteGoal] Missing name.', deleteData); return; }
  const goals = loadGoals();
  const idx = goals.findIndex(g => g.name.toLowerCase() === deleteData.name.toLowerCase());
  if (idx < 0) { console.warn('[applyDeleteGoal] No goal found:', deleteData.name); return; }
  const removed = goals.splice(idx, 1)[0];
  saveGoals(goals);
  syncGoalsToSheet();
  renderGoalsList();
  actionNotes.push(`Goal removed: ${removed.name}`);
}

function applyAddExpense(items, data, actionNotes) {
  if (!Array.isArray(items) || items.length === 0) { console.warn('[applyAddExpense] Expected non-empty array.', items); return; }
  const valid = items.filter(item => item.desc && typeof item.desc === 'string' && !isNaN(parseFloat(item.amount)))
    .map(item => ({ desc: item.desc.trim(), amount: typeof item.amount === 'number' ? item.amount : parseFloat(item.amount) }));
  if (!valid.length) { console.warn('[applyAddExpense] No valid items.', items); return; }
  if (!Array.isArray(data.invoiceExpenses)) data.invoiceExpenses = [];
  data.invoiceExpenses.push(...valid);
  actionNotes.push(`Expense${valid.length > 1 ? 's' : ''} added: ${valid.map(i => i.desc).join(', ')}`);
}

const VALID_STATUSES = ['⬜ Unpaid', '💰 Deposit', '📤 Sent', '✅ Paid'];

function applyUpdateStatus(statusData, data, actionNotes) {
  if (!statusData || !statusData.receipt || !statusData.status) { console.warn('[applyUpdateStatus] Missing receipt or status.', statusData); return; }
  if (statusData.receipt !== data.receiptNumber) { console.warn('[applyUpdateStatus] Receipt mismatch — AI returned', statusData.receipt, ', current is', data.receiptNumber); return; }
  if (!VALID_STATUSES.includes(statusData.status)) { console.warn('[applyUpdateStatus] Invalid status:', statusData.status); return; }
  updateLedgerStatusOnSheet(statusData.receipt, statusData.status);
  const rows = loadLedgerRows();
  const rowIdx = rows.findIndex(r => r.receipt === statusData.receipt);
  if (rowIdx >= 0) { rows[rowIdx].status = statusData.status; saveLedgerRows(rows); }
  else { console.warn('[applyUpdateStatus] Receipt not found in localStorage:', statusData.receipt); }
  actionNotes.push(`Status → ${statusData.status}`);
}

function openCalendarImport() {
  if (!gmailTokenValid()) {
    showToast('Please sign in with Google first.', 'error');
    return;
  }
  const savedKw = localStorage.getItem('cal-keyword');
  if (savedKw) document.getElementById('cal-keyword').value = savedKw;
  document.getElementById('cal-results').style.display = 'none';
  document.getElementById('cal-results').innerHTML = '';
  document.getElementById('cal-status').textContent = '';
  document.getElementById('calendar-overlay').style.display = 'flex';
}

function closeCalendarModal() {
  document.getElementById('calendar-overlay').style.display = 'none';
}

async function searchCalendarEvents() {
  const keyword = document.getElementById('cal-keyword').value.trim();
  if (!keyword) {
    document.getElementById('cal-status').textContent = 'Enter a keyword first.';
    return;
  }
  localStorage.setItem('cal-keyword', keyword);

  const statusEl = document.getElementById('cal-status');
  const resultsEl = document.getElementById('cal-results');
  statusEl.textContent = 'Searching…';
  resultsEl.style.display = 'none';
  resultsEl.innerHTML = '';

  let events;
  try {
    events = await fetchCalendarEvents(keyword);
  } catch (e) {
    statusEl.textContent = 'Calendar error: ' + e.message;
    return;
  }

  if (!events.length) {
    statusEl.textContent = 'No events found matching "' + keyword + '".';
    return;
  }

  statusEl.textContent = events.length + ' event' + (events.length > 1 ? 's' : '') + ' found — pick one to pre-fill the invoice.';
  resultsEl.style.display = 'flex';

  events.forEach(function(e) {
    const d = (e.start && (e.start.dateTime || e.start.date)) || '';
    const dateStr = d ? new Date(d).toDateString() : '';
    const row = document.createElement('button');
    row.style.cssText = 'display:flex; flex-direction:column; align-items:flex-start; padding:10px 14px; background:#f6f6f4; border:1.5px solid transparent; border-radius:7px; cursor:pointer; font-family:Roboto,sans-serif; text-align:left; transition:border-color 0.15s;';
    row.onmouseover = function() { row.style.borderColor = '#1a73e8'; };
    row.onmouseout  = function() { row.style.borderColor = 'transparent'; };
    row.innerHTML = '<span style="font-size:13px; font-weight:600; color:#14202e;">' + (e.summary || '(untitled)') + '</span>'
      + '<span style="font-size:11px; color:#6c7682; margin-top:2px;">' + dateStr + '</span>';
    row.onclick = function() { applyCalendarEvent(e); };
    resultsEl.appendChild(row);
  });
}

function applyCalendarEvent(event) {
  const draft = buildDraftFromEvent(event);
  let existing;
  try {
    existing = JSON.parse(document.getElementById('invoice-data').textContent);
  } catch (e) {
    showToast('Could not read invoice data. Try reloading the page.', 'error');
    return;
  }
  const merged = Object.assign({}, existing, draft, { from: existing.from });
  document.getElementById('invoice-data').textContent = JSON.stringify(merged, null, 2);
  render(merged);
  closeCalendarModal();
}

async function loadLedgerFromSheet() {
  if (!_sheetsSpreadsheetId || !_gmailToken) {
    console.log('Sheet sync not available: missing ID or token');
    return null;
  }

  try {
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${_sheetsSpreadsheetId}/values/Ledger!A:H`,
      {
        headers: { Authorization: `Bearer ${_gmailToken}` }
      }
    );

    if (!res.ok) {
      const err = await res.json();
      console.error('Failed to load ledger from sheet:', err.error?.message || res.statusText);
      return null;
    }

    const data = await res.json();
    const rows = data.values || [];

    console.log('Loaded', rows.length, 'rows from sheet');

    // Skip header row and convert to ledger format
    return rows.slice(1).map(row => ({
      receipt: row[0] || '',
      date: row[1] || '',
      client: row[2] || '',
      service: row[3] || '',
      projectTotal: row[4] || '',
      amountDue: row[5] || '',
      status: row[6] || '⬜ Unpaid',
      company: row[7] || ''
    }));
  } catch (e) {
    console.error('Ledger load error:', e.message);
    return null;
  }
}

async function updateLedgerStatusOnSheet(receiptNumber, status, amountDue = null) {
  if (!_sheetsSpreadsheetId || !_gmailToken) return;

  try {
    const readRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${_sheetsSpreadsheetId}/values/Ledger!A:A`,
      { headers: { Authorization: `Bearer ${_gmailToken}` } }
    );
    if (!readRes.ok) return;
    const readJson = await readRes.json();
    const colA = readJson.values || [];
    const sheetRowIdx = colA.findIndex(function(r, i) { return i > 0 && r[0] === receiptNumber; });
    if (sheetRowIdx === -1) { console.warn('Receipt not found in sheet:', receiptNumber); return; }

    if (amountDue !== null) {
      // Update both F (amountDue) and G (status) in one batchUpdate
      const range = `Ledger!F${sheetRowIdx + 1}:G${sheetRowIdx + 1}`;
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${_sheetsSpreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${_gmailToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [[amountDue, status]] })
        }
      );
    } else {
      const cell = `Ledger!G${sheetRowIdx + 1}`;
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${_sheetsSpreadsheetId}/values/${cell}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${_gmailToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [[status]] })
        }
      );
    }
    console.log('✓ Status updated on sheet row', sheetRowIdx + 1);
  } catch (e) {
    console.error('Status update error:', e.message);
  }
}

function refreshGmailIdStatus() {
  const el = document.getElementById('gmail-id-status');
  const input = document.getElementById('oauth-client-id-input');
  if (!el) return;
  const id = localStorage.getItem('gmail-client-id');
  el.textContent = id ? '✓ set' : 'not set';
  if (input) input.value = id || '';
}

function refreshSheetsIdStatus() {
  const el = document.getElementById('sheets-id-status');
  if (!el) return;
  const id = localStorage.getItem('sheets-spreadsheet-id');
  el.textContent = id ? id.slice(0, 20) + '…' : 'not set';
}

// ── FX Rate Service ───────────────────────────────────────────

async function fetchFxRate(fromCurrency) {
  const from = (fromCurrency || 'USD').toUpperCase();

  // 1. If already USD, no conversion needed
  if (from === 'USD') return 1;

  // 2. Manual override in Developer Settings takes priority
  const override = localStorage.getItem('fx-rate-override');
  if (override && parseFloat(override) > 0) return parseFloat(override);

  const cacheKey = 'fx-rate-cache';
  const cached = JSON.parse(localStorage.getItem(cacheKey) || '{}');
  const now = Date.now();
  const SIX_HOURS = 6 * 60 * 60 * 1000;

  // 3. Use cached rate if fresh enough
  if (cached[from] && cached[from + '_ts'] && (now - cached[from + '_ts']) < SIX_HOURS) {
    return cached[from];
  }

  // 4. Pull from Google Sheets _AppData tab (requires signed-in token)
  if (_gmailToken && _sheetsSpreadsheetId) {
    try {
      // Read existing rows to find this currency
      const rows = await sheetsRead(_sheetsSpreadsheetId, '_AppData!A2:B');
      const rowIdx = rows.findIndex(r => r[0] && r[0].toUpperCase() === from);

      if (rowIdx === -1) {
        // Currency not in sheet yet — write a new row with GOOGLEFINANCE formula
        const newRow = rowIdx === -1 ? rows.length + 2 : rowIdx + 2;
        await sheetsWrite(_sheetsSpreadsheetId, `_AppData!A${newRow}:C${newRow}`, [
          [from, `=GOOGLEFINANCE("CURRENCY:${from}USD")`, new Date().toISOString().slice(0, 10)]
        ]);
        // Read back the computed value (give Sheets a moment to evaluate)
        await new Promise(r => setTimeout(r, 1500));
        const updated = await sheetsRead(_sheetsSpreadsheetId, `_AppData!B${newRow}`);
        const rate = updated && updated[0] && parseFloat(updated[0][0]);
        if (rate && rate > 0) {
          cached[from] = rate;
          cached[from + '_ts'] = now;
          localStorage.setItem(cacheKey, JSON.stringify(cached));
          _updateFxDisplay(from, rate);
          return rate;
        }
      } else {
        // Row exists — update last-read timestamp and return rate
        const sheetRow = rowIdx + 2;
        const rate = parseFloat(rows[rowIdx][1]);
        if (rate && rate > 0) {
          await sheetsWrite(_sheetsSpreadsheetId, `_AppData!C${sheetRow}`, [[new Date().toISOString().slice(0, 10)]]);
          cached[from] = rate;
          cached[from + '_ts'] = now;
          localStorage.setItem(cacheKey, JSON.stringify(cached));
          _updateFxDisplay(from, rate);
          return rate;
        }
      }
    } catch (e) {
      console.warn('FX sheet lookup failed:', e.message);
    }
  }

  // 5. Fall back to stale cache if available
  if (cached[from]) {
    console.warn(`Using stale FX rate for ${from}`);
    return cached[from];
  }

  // 6. No rate available — prompt user to set manual override
  throw new Error(`Could not get FX rate for ${from}→USD. Please set a manual rate in Developer Settings (print modal).`);
}

function _updateFxDisplay(from, rate) {
  const displayEl = document.getElementById('fx-rate-display');
  if (displayEl) displayEl.textContent = `1 ${from} = ${rate.toFixed(6)} USD (via Sheets)`;
}

function saveFxRateOverride() {
  const val = document.getElementById('fx-rate-override').value;
  if (val && parseFloat(val) > 0) {
    localStorage.setItem('fx-rate-override', val);
  } else {
    localStorage.removeItem('fx-rate-override');
  }
}

function restoreFxRateOverride() {
  const saved = localStorage.getItem('fx-rate-override');
  const el = document.getElementById('fx-rate-override');
  if (saved && el) el.value = saved;
}

// ── Goal Allocation Logic ─────────────────────────────────────

window.allocateToGoal = async function(invoiceRow, selectedGoal, pct) {
  if (!pct || pct <= 0 || pct > 100) throw new Error('Percentage must be between 1 and 100.');

  const invoiceAmount = parseFloat((invoiceRow.amountDue || '0').replace(/[^0-9.]/g, '')) || 0;
  if (!invoiceAmount) throw new Error('Could not read invoice amount.');

  const invoiceCurrency = (invoiceRow.projectTotal || '').split(' ')[0] || 'JMD';
  let rate;
  try {
    rate = await fetchFxRate(invoiceCurrency);
  } catch (e) {
    throw new Error(e.message);
  }

  const contributionLocal = invoiceAmount * (pct / 100);
  const contributionUSD   = contributionLocal * rate;

  const goals = loadGoals().sort((a, b) => {
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return new Date(a.deadline) - new Date(b.deadline);
  });

  let remaining = contributionUSD;
  const messages = [];
  let startIdx = goals.findIndex(g => g.name === selectedGoal.name);
  if (startIdx === -1) startIdx = 0;

  for (let i = startIdx; i < goals.length && remaining > 0; i++) {
    const g = goals[i];
    if (g.status === 'Claimed') continue;
    const target  = parseFloat(g.amount) || 0;
    const reached = parseFloat(g.amountReached) || 0;
    const needed  = Math.max(0, target - reached);
    if (needed <= 0) continue;

    const applied = Math.min(remaining, needed);
    g.amountReached = String(Math.round((reached + applied) * 100) / 100);
    g.lastContributionDate = new Date().toISOString().slice(0, 10);

    if (parseFloat(g.amountReached) >= target) {
      g.status = 'Funded';
      messages.push(`✅ "${g.name}" is fully funded!`);
      if (typeof triggerConfetti === 'function') triggerConfetti();
    } else {
      messages.push(`+$${applied.toFixed(2)} → "${g.name}"`);
    }

    remaining -= applied;
    if (remaining > 0.01 && i === startIdx && i + 1 < goals.length) {
      messages.push(`↪ $${remaining.toFixed(2)} rolled over to "${goals[i + 1].name}"`);
    }
  }

  saveGoals(goals);
  await syncGoalsToSheet();
  renderGoalsList();
  renderDashboard();

  if (messages.length) {
    const notice = messages.join('\n');
    setTimeout(() => showToast(notice, 'success'), 100);
  }
};

// ── Voice input ───────────────────────────────────────────────

let _recognition = null;
let _recognizing = false;

// ── Business Profile ─────────────────────────────────────────

function openProfileModal() {
  const profiles = loadBusinessProfiles();
  const activeId = getActiveProfileId();
  
  const selector = document.getElementById('profile-selector');
  selector.innerHTML = '';
  profiles.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name || 'Unnamed Profile';
    opt.selected = (p.id === activeId);
    selector.appendChild(opt);
  });
  
  const active = getActiveProfile() || { name:'', address:'', email:'', phone:'' };
  document.getElementById('prof-name').value    = active.name    || '';
  document.getElementById('prof-address').value = active.address || '';
  document.getElementById('prof-email').value   = active.email   || '';
  document.getElementById('prof-phone').value   = active.phone   || '';
  
  const note = document.getElementById('profile-signin-note');
  if (note) {
    const exp = parseInt(localStorage.getItem('gmail-token-exp') || '0');
    const expiresIn = Math.round((exp - Date.now()) / 60000);
    if (gmailTokenValid()) {
      note.innerHTML = `✓ Signed in · token expires in ${expiresIn} min`;
      note.style.color = '#2a8c55';
    } else {
      note.textContent = '⚠ Not signed in';
      note.style.color = '#d0241b';
    }
  }
  document.getElementById('profile-overlay').style.display = 'flex';
}

function closeProfileModal() {
  document.getElementById('profile-overlay').style.display = 'none';
}

function switchProfile(id) {
  setActiveProfileId(id);
  const active = getActiveProfile();
  if (active) {
    document.getElementById('prof-name').value    = active.name    || '';
    document.getElementById('prof-address').value = active.address || '';
    document.getElementById('prof-email').value   = active.email   || '';
    document.getElementById('prof-phone').value   = active.phone   || '';
    
    // Switch logo if exists
    if (active.logo) {
      localStorage.setItem('invoice-logo', active.logo);
      renderLogo(active.logo);
    } else {
      removeLogo();
    }
  }
}

function addNewProfile() {
  const name = prompt('Enter a name for the new profile:');
  if (!name) return;
  const profiles = loadBusinessProfiles();
  const id = 'p' + Date.now();
  profiles.push({ id, name, address: '', email: '', phone: '', logo: '' });
  saveBusinessProfiles(profiles);
  setActiveProfileId(id);
  openProfileModal();
}

function saveProfileFromModal() {
  const name    = document.getElementById('prof-name').value.trim();
  const address = document.getElementById('prof-address').value.trim();
  const email   = document.getElementById('prof-email').value.trim();
  const phone   = document.getElementById('prof-phone').value.trim();
  if (!name) { showToast('Business name is required.', 'error'); return; }
  
  const profiles = loadBusinessProfiles();
  const activeId = getActiveProfileId();
  const idx = profiles.findIndex(p => p.id === activeId);
  
  const logo = localStorage.getItem('invoice-logo') || '';
  
  if (idx >= 0) {
    profiles[idx] = { ...profiles[idx], name, address, email, phone, logo };
  } else {
    profiles.push({ id: activeId, name, address, email, phone, logo });
  }
  
  saveBusinessProfiles(profiles);
  syncProfilesToSheet();
  syncSettingsToSheet(); // Also sync app settings while we're at it
  
  showToast('Profile saved and synced.', 'success');
  closeProfileModal();
}

function applyProfileFromModal() {
  saveProfileFromModal();
  const profile = getActiveProfile();
  if (!profile) return;
  const data = getData();
  data.from.name    = profile.name;
  data.from.address = profile.address;
  data.from.email   = profile.email;
  data.from.phone   = profile.phone;
  document.getElementById('invoice-data').textContent = JSON.stringify(data, null, 2);
  render(getData());
}

function googleSignOut() {
  const token = localStorage.getItem('gmail-token');
  if (token && window.google && google.accounts && google.accounts.oauth2) {
    google.accounts.oauth2.revoke(token, () => {});
  }
  localStorage.removeItem('gmail-token');
  localStorage.removeItem('gmail-token-exp');
  localStorage.removeItem('gmail-token-scopes');
  closeProfileModal();
  updateEmailBtn();
  showToast('Signed out of Google.', 'info');
}

function saveBusinessProfile() {
  const data = extractEditData();
  const profile = {
    name:    data.from.name    || '',
    address: data.from.address || '',
    email:   data.from.email   || '',
    phone:   data.from.phone   || '',
    logo:    localStorage.getItem('invoice-logo') || ''
  };
  if (!profile.name) { showToast('Please enter a business name before saving the profile.', 'error'); return; }
  
  const profiles = loadBusinessProfiles();
  const activeId = getActiveProfileId();
  const idx = profiles.findIndex(p => p.id === activeId);
  
  if (idx >= 0) {
    profiles[idx] = { ...profiles[idx], ...profile };
  } else {
    profiles.push({ ...profile, id: activeId });
  }
  
  saveBusinessProfiles(profiles);
  syncProfilesToSheet();
  
  const btn = document.querySelector('.edit-only[onclick="saveBusinessProfile()"]');
  if (btn) { btn.textContent = '✓ Profile Saved'; setTimeout(() => { btn.textContent = '⬇ Save as Profile'; }, 2000); }
}

function loadBusinessProfile() {
  return getActiveProfile();
}

function applyBusinessProfile() {
  const profile = getActiveProfile();
  if (!profile) {
    // No profile yet — enter edit mode and guide user to the From section
    if (!document.body.classList.contains('editing')) startEdit();
    const fromEl = document.querySelector('.party.from');
    if (fromEl) {
      fromEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Show a dismissible tip if not already showing
      if (!document.getElementById('profile-setup-tip')) {
        const tip = document.createElement('div');
        tip.id = 'profile-setup-tip';
        tip.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;background:#14202e;color:#fff;font-family:"Roboto",sans-serif;font-size:12px;padding:12px 18px;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.35);display:flex;align-items:center;gap:12px;max-width:400px;';
        tip.innerHTML = '<span>✏️ Fill in your <strong>From</strong> details, then click <strong>⬇ Save as Profile</strong> to save them for future invoices.</span><button onclick="this.parentElement.remove()" style="background:none;border:none;color:#9aa2ac;font-size:16px;cursor:pointer;line-height:1;padding:0;flex-shrink:0;">×</button>';
        document.body.appendChild(tip);
        setTimeout(() => tip.remove(), 8000);
      }
      // Pulse the From section briefly
      fromEl.style.transition = 'outline 0.2s';
      fromEl.style.outline = '2px solid #5b4fcf';
      fromEl.style.borderRadius = '4px';
      setTimeout(() => { fromEl.style.outline = ''; fromEl.style.borderRadius = ''; }, 2000);
    }
    return;
  }
  const data = getData();
  data.from.name    = profile.name;
  data.from.address = profile.address;
  data.from.email   = profile.email;
  data.from.phone   = profile.phone;
  document.getElementById('invoice-data').textContent = JSON.stringify(data, null, 2);
  render(data);
}

function initBusinessProfile() {
  const profile = loadBusinessProfile();
  if (!profile) return;
  // Auto-apply if the current From name is blank or still the placeholder
  const data = getData();
  const currentName = (data.from && data.from.name) || '';
  if (!currentName || currentName === 'Your Business Name') {
    data.from.name    = profile.name;
    data.from.address = profile.address;
    data.from.email   = profile.email;
    data.from.phone   = profile.phone;
    document.getElementById('invoice-data').textContent = JSON.stringify(data, null, 2);
    render(data);
  }
}

// ── Logo Upload ───────────────────────────────────────────────

function handleLogoUpload(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    showToast('Logo file is too large. Please use an image under 2MB.', 'error');
    input.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    try {
      localStorage.setItem('invoice-logo', e.target.result);
    } catch (err) {
      showToast('Could not save logo — storage quota exceeded. Try a smaller image.', 'error');
      input.value = '';
      return;
    }
    renderLogo(e.target.result);
  };
  reader.readAsDataURL(file);
  input.value = '';
}

function renderLogo(dataUrl) {
  const wrap = document.getElementById('logo-wrap');
  if (!wrap) return;
  const placeholder = document.getElementById('logo-placeholder');
  if (placeholder) placeholder.style.display = 'none';
  let img = document.getElementById('logo-img');
  if (!img) {
    img = document.createElement('img');
    img.id = 'logo-img';
    const removeBtn = document.createElement('button');
    removeBtn.className = 'logo-remove';
    removeBtn.title = 'Remove logo';
    removeBtn.textContent = '✕';
    removeBtn.onclick = removeLogo;
    wrap.appendChild(img);
    wrap.appendChild(removeBtn);
  }
  img.src = dataUrl;
}

function removeLogo() {
  localStorage.removeItem('invoice-logo');
  const img = document.getElementById('logo-img');
  if (img) img.remove();
  const removeBtn = document.querySelector('.logo-remove');
  if (removeBtn) removeBtn.remove();
  const placeholder = document.getElementById('logo-placeholder');
  if (placeholder) placeholder.style.display = '';
}

function initLogo() {
  const saved = localStorage.getItem('invoice-logo');
  if (saved) renderLogo(saved);
}

function toggleVoice() {
  const btn = document.getElementById('btn-chat-voice');
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    appendMsg('error', '✗ Voice not supported in this browser. Try Chrome or Edge.');
    return;
  }

  if (_recognizing) {
    _recognition.stop();
    return;
  }

  _recognition = new SpeechRecognition();
  _recognition.continuous      = false;
  _recognition.interimResults  = true;
  _recognition.lang            = 'en-US';

  _recognition.onstart = () => {
    _recognizing = true;
    btn.classList.add('recording');
    btn.title = 'Stop recording';
  };

  _recognition.onresult = e => {
    const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
    document.getElementById('chat-input').value = transcript;
  };

  _recognition.onend = () => {
    _recognizing = false;
    btn.classList.remove('recording');
    btn.title = 'Voice input';
    // Auto-send if we got something
    const val = document.getElementById('chat-input').value.trim();
    if (val) sendChat();
  };

  _recognition.onerror = e => {
    _recognizing = false;
    btn.classList.remove('recording');
    if (e.error !== 'aborted') appendMsg('error', `✗ Voice error: ${e.error}`);
  };

  _recognition.start();
}

// ── Init ─────────────────────────────────────────────────────
// Restore last saved state, migrating old fields as needed
try {
  const saved = localStorage.getItem('invoice-last-state');
  if (saved) {
    const parsed = JSON.parse(saved);
    // Migrate old totalLabel
    if (parsed.totalLabel && !parsed.totalLabelTop) {
      const parts = parsed.totalLabel.split(' ');
      parsed.totalLabelTop    = parts[0] || 'Deposit';
      parsed.totalLabelBottom = parts.slice(1).join(' ') || 'Due';
      delete parsed.totalLabel;
    }
    if (parsed.receiptOverride) {
      document.getElementById('invoice-data').textContent = JSON.stringify(parsed, null, 2);
    }
  } else {
    // No saved state. Load preferred template if any.
    const prefId = localStorage.getItem('invoicer-preferred-template');
    if (prefId && prefId !== 'default') {
      let existing = JSON.parse(document.getElementById('invoice-data').textContent);
      const tmpl = getTemplateData(prefId);
      const merged = Object.assign({}, existing, tmpl, { from: existing.from, to: existing.to });
      document.getElementById('invoice-data').textContent = JSON.stringify(merged, null, 2);
    }
  }
} catch(e) {}
window.restoreDraft = function() {
  try {
    const data = JSON.parse(localStorage.getItem('invoicer-autosave'));
    document.getElementById('invoice-data').textContent = JSON.stringify(data, null, 2);
    render(data);
    discardDraft();
  } catch(e) {}
};

window.discardDraft = function() {
  localStorage.removeItem('invoicer-autosave');
  const b = document.getElementById('draft-banner');
  if (b) b.remove();
};

window.clearInvoice = async function() {
  if (await showConfirm('Are you sure you want to clear this invoice and start fresh?', 'Clear Invoice')) {
    localStorage.removeItem('invoice-last-state');
    localStorage.removeItem('invoicer-autosave');
    localStorage.removeItem('invoice-logo');
    removeLogo();

    let existing = TMPL_DEFAULT;
    try { existing = JSON.parse(document.getElementById('invoice-data').textContent); } catch(e) {}
    
    const prefId = localStorage.getItem('invoicer-preferred-template') || 'default';
    const tmpl = getTemplateData(prefId);
    
    // Preserve 'from', auto-increment receipt number
    const prevReceipt = existing.receiptOverride || existing.receiptNumber || '';
    const newReceipt = nextReceiptNumber(prevReceipt ? prevReceipt.trim() : '');
    
    const defaultPayPeriodSetting = localStorage.getItem('invoicer-default-pay-period');
    const payPeriodOverride = defaultPayPeriodSetting !== null 
      ? (defaultPayPeriodSetting === '0' ? 'Due on Receipt' : `Net ${defaultPayPeriodSetting}`)
      : tmpl.payPeriod;

    const defaultCurrency = localStorage.getItem('invoicer-default-currency') || tmpl.currency || 'USD';

    const merged = Object.assign({}, tmpl, {
      from: existing.from || { name: 'Your Business Name', address: '', email: '', phone: '' },
      receiptOverride: newReceipt,
      payPeriod: payPeriodOverride,
      currency: defaultCurrency,
    });

    document.getElementById('invoice-data').textContent = JSON.stringify(merged, null, 2);
    render(merged);
    if (document.body.classList.contains('editing')) stopEdit();
  }
};

const autosave = localStorage.getItem('invoicer-autosave');
if (autosave) {
  const banner = document.createElement('div');
  banner.id = 'draft-banner';
  banner.style.cssText = 'position:fixed; top:0; left:0; right:0; background:#f0ad4e; color:#14202e; text-align:center; padding:10px; z-index:9999; font-size:13px; font-weight:600; display:flex; justify-content:center; gap:12px; align-items:center; box-shadow:0 2px 10px rgba(0,0,0,0.1);';
  banner.innerHTML = `
    <span>An unsaved draft was found.</span>
    <button onclick="restoreDraft()" style="padding:4px 10px; border:none; border-radius:4px; background:#14202e; color:#fff; cursor:pointer;">Restore Draft</button>
    <button onclick="discardDraft()" style="padding:4px 10px; border:none; border-radius:4px; background:rgba(0,0,0,0.1); cursor:pointer;">Discard</button>
  `;
  document.body.appendChild(banner);
}

// Check for URL hash share link
if (window.location.hash.startsWith('#data=')) {
  try {
    const base64 = window.location.hash.substring(6);
    const json = decodeURIComponent(atob(base64));
    document.getElementById('invoice-data').textContent = json;
    // Clear hash after loading so refresh doesn't reload old data automatically
    window.history.replaceState(null, '', window.location.pathname);
  } catch(e) {
    console.error('Failed to parse share link:', e);
  }
}

render(getData());
seedClientsFromLedger();
renderClientChips();
restoreTitleFont();
restoreTheme();

// ── Offline indicator ─────────────────────────────────────────
(function() {
  const pill = document.getElementById('offline-pill');
  const show = () => { if (pill) pill.style.display = 'flex'; };
  const hide = () => { if (pill) pill.style.display = 'none'; };
  window.addEventListener('online', hide);
  window.addEventListener('offline', show);
  if (pill) pill.style.display = navigator.onLine ? 'none' : 'flex';
})();
restoreTitleSize();
initLogo();
restoreFxRateOverride();
initBusinessProfile();

// Restore token from storage if available
if (restoreTokenFromStorage()) {
  updateEmailBtn();
  setupDrive();
}

window.addEventListener('beforeunload', (e) => {
  if (document.body.classList.contains('editing')) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// Init Google auth silently on load — attempt silent token refresh if stored token is expired
window.addEventListener('load', () => {
  try {
    initGmailAuth(() => {
      updateEmailBtn();
      setupDrive();
    });
    // If stored token is expired/missing, try silent re-auth (no popup if still signed into Google)
    if (!gmailTokenValid() && _gmailTokenClient) {
      _gmailTokenClient.requestAccessToken({ prompt: 'none' });
    }
  } catch(e) {}
});

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').then(reg => {
    console.log('✓ Service worker registered');
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          showConfirm('A new version of the app is available. Refresh now to update?', () => {
            window.location.reload();
          }, { confirmLabel: 'Refresh', cancelLabel: 'Later', danger: false });
        }
      });
    });
  }).catch(err => {
    console.log('Service worker registration failed:', err);
  });
}

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const activeOverlays = Array.from(document.querySelectorAll('div[id$="-overlay"], #chat-settings-panel')).filter(el => {
        const style = window.getComputedStyle(el);
        return style.display === 'flex' || style.display === 'block';
      });
      if (activeOverlays.length > 0) {
        activeOverlays.forEach(el => {
          if (el.id === 'chat-settings-panel') {
            document.getElementById('chat-settings-panel').classList.remove('open');
          } else {
            el.style.display = 'none';
          }
        });
      }
    }

    const tag = (document.activeElement || {}).tagName || '';
    const isInField = tag === 'INPUT' || tag === 'TEXTAREA' ||
      (document.activeElement || {}).isContentEditable;

    const isE = e.key.toLowerCase() === 'e';
    const isS = e.key.toLowerCase() === 's';
    const isP = e.key.toLowerCase() === 'p';
    const isCtrl = e.ctrlKey || e.metaKey;

    if ((isCtrl && isE && !isInField) || (isE && !isCtrl && !isInField)) {
      e.preventDefault();
      if (!document.body.classList.contains('editing')) startEdit();
    }

    if ((isCtrl && isS) || (isS && !isCtrl && !isInField)) {
      e.preventDefault();
      if (document.body.classList.contains('editing')) {
        saveEdit();
      } else {
        const hasOpenModal = Array.from(document.querySelectorAll('div[id$="-overlay"]')).some(el => {
          const s = window.getComputedStyle(el);
          return s.display === 'flex' || s.display === 'block';
        });
        if (!hasOpenModal) confirmPrint();
      }
    }

    if ((isCtrl && isP) || (isP && !isCtrl && !isInField)) {
      e.preventDefault();
      const hasOpenModal = Array.from(document.querySelectorAll('div[id$="-overlay"]')).some(el => {
        const s = window.getComputedStyle(el);
        return s.display === 'flex' || s.display === 'block';
      });
      if (!hasOpenModal && !document.body.classList.contains('editing')) confirmPrint();
    }

    if (e.key === 'Escape' && document.body.classList.contains('editing')) {
      const activeOverlays = Array.from(document.querySelectorAll('div[id$="-overlay"], #chat-settings-panel')).filter(el => {
        const style = window.getComputedStyle(el);
        return style.display === 'flex' || style.display === 'block';
      });
      if (activeOverlays.length === 0) {
        e.preventDefault();
        cancelEdit();
      }
    }

    if (e.key === '?' && !isInField) {
      e.preventDefault();
      toggleShortcutsModal();
    }
  });
function exportLocalData() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith('invoice-') || key === 'drive-folder-id' || key === 'oauth-client-id') {
      data[key] = localStorage.getItem(key);
    }
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mooInvoicer_backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importLocalData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      let count = 0;
      for (const key in data) {
        if (key.startsWith('invoice-') || key === 'drive-folder-id' || key === 'oauth-client-id') {
          localStorage.setItem(key, data[key]);
          count++;
        }
      }
      showToast(`Imported ${count} keys successfully. The app will now reload.`, 'success');
      location.reload();
    } catch (err) {
      showToast("Invalid backup file.", 'error');
    }
  };
  reader.readAsText(file);
}

function resetAllData() {
  showConfirm(
    'Are you <strong>absolutely sure</strong>? This will delete all local data, clients, and history. Export a backup first if you need to recover.',
    null,
    { confirmLabel: 'Yes, continue', cancelLabel: 'Cancel', danger: true }
  ).then(confirmed => {
    if (!confirmed) return;
    showConfirm(
      '<strong>Final warning:</strong> Click Delete to erase everything and reload. This cannot be undone.',
      null,
      { confirmLabel: 'Delete everything', cancelLabel: 'Cancel', danger: true }
    ).then(confirmed2 => {
      if (!confirmed2) return;
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('invoice-') || key === 'drive-folder-id' || key === 'oauth-client-id') keys.push(key);
      }
      keys.forEach(k => localStorage.removeItem(k));
      location.reload();
    });
  });
}
// ── Modal Focus Trapping ──────────────────────────────────────
document.addEventListener('keydown', function(e) {
  if (e.key === 'Tab') {
    const modals = Array.from(document.querySelectorAll('[role="dialog"], .toast-confirm')).filter(el => {
      return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) && getComputedStyle(el).display !== 'none';
    });
    if (modals.length > 0) {
      const topModal = modals[modals.length - 1];
      const focusableSelectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
      const focusableElements = Array.from(topModal.querySelectorAll(focusableSelectors)).filter(el => !el.disabled && el.style.display !== 'none');
      
      if (focusableElements.length > 0) {
        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];
        
        if (!topModal.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      } else {
        e.preventDefault();
      }
    }
  }
});

// ── Table Tab Navigation ──────────────────────────────────────
document.getElementById('line-items').addEventListener('keydown', function(e) {
  if (e.key === 'Tab' && document.body.classList.contains('editing')) {
    const fields = Array.from(this.querySelectorAll('.service-name, .col-details, .rate-edit-ta, .cost-edit-ta'));
    const idx = fields.indexOf(e.target);
    if (idx >= 0) {
      e.preventDefault();
      if (e.shiftKey) {
        if (idx > 0) fields[idx - 1].focus();
      } else {
        if (idx < fields.length - 1) {
          fields[idx + 1].focus();
        } else {
          // Last field in table, add a new row and focus its first field
          addLineItem();
          setTimeout(() => {
            const newFields = Array.from(document.getElementById('line-items').querySelectorAll('.service-name'));
            if (newFields.length > 0) newFields[newFields.length - 1].focus();
          }, 50);
        }
      }
    }
  }
});

function toggleStatusPicker(e) {
  if (document.body.classList.contains('editing')) return;
  e.stopPropagation();
  const picker = document.getElementById('status-picker');
  picker.style.display = picker.style.display === 'none' ? 'flex' : 'none';
}

function quickSetStatus(status) {
  const data = getData();
  const rows = loadLedgerRows();
  const idx = rows.findIndex(r => r.receipt === data.receiptNumber);
  if (idx === -1) {
    showToast('Save to ledger first before changing status', 'info');
    document.getElementById('status-picker').style.display = 'none';
    return;
  }
  if (status === '✅ Paid' && rows[idx].projectTotal) {
    rows[idx].amountDue = rows[idx].projectTotal;
  }
  rows[idx].status = status;
  saveLedgerRows(rows);
  updateLedgerStatusOnSheet(rows[idx].receipt, status, status === '✅ Paid' ? rows[idx].amountDue : null);
  document.getElementById('status-picker').style.display = 'none';
  render(data);
}

document.addEventListener('click', function(e) {
  const picker = document.getElementById('status-picker');
  if (picker && picker.style.display === 'flex' && !picker.contains(e.target) && e.target.id !== 'status-badge') {
    picker.style.display = 'none';
  }
});
