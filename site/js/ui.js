/** ---------- Generic helpers ---------- */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function isUrl(str) {
  if (typeof str !== 'string') return false;
  return /^https?:\/\/\S+$/i.test(str.trim());
}

function fmtCurrency(v) {
  if (v === null || v === undefined || v === '' || isNaN(Number(v))) return 'N/A';
  return '₹' + Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

// Keep source labels untouched in rawRecord/source lineage, but present common
// spelling variants consistently in charts and summaries.
const DISPLAY_LABEL_ALIASES = {
  'Benq Intractive Panel': 'BenQ Interactive Panel',
  'Fire Extenguisher': 'Fire Extinguisher',
  'Fire Extenguisher - Vandor Matr': 'Fire Extinguisher — Vendor Matrix',
  'Multi Moniter USB': 'Multi Monitor USB',
  'Water Despenser': 'Water Dispenser',
  'AQM Cair+ Wel': 'AQM Cair+ Wellness',
};
function displaySourceLabel(value) {
  const label = String(value ?? '').trim();
  return DISPLAY_LABEL_ALIASES[label] || label;
}

function fmtNumber(v) {
  if (v === null || v === undefined || v === '') return 'N/A';
  const n = Number(v);
  if (isNaN(n)) return escapeHtml(String(v));
  return n.toLocaleString('en-IN');
}

function isIsoDateString(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v);
}

function fmtValue(v) {
  if (v === null || v === undefined || v === '') return '<span class="na">N/A</span>';
  if (typeof v === 'string' && /^(n\/?a|na|none|null|-)$/i.test(v.trim())) return '<span class="na">N/A</span>';
  if (isUrl(v)) return `<a href="${escapeHtml(v)}" target="_blank" rel="noopener" class="link-ext">Open source ↗</a>`;
  if (isIsoDateString(v)) {
    const d = new Date(v);
    const isMidnight = v.endsWith('T00:00:00');
    return escapeHtml(isMidnight ? d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) : d.toLocaleString('en-IN'));
  }
  return escapeHtml(String(v));
}

function fmtDate(iso) {
  if (!iso) return 'N/A';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return 'N/A'; }
}

function timeAgo(iso) {
  if (!iso) return 'N/A';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  const days = Math.floor(hrs / 24);
  if (days < 30) return days + 'd ago';
  return fmtDate(iso);
}

function debounce(fn, wait = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

function slugify(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }

function downloadFile(filename, content, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function toCSV(rows, columns) {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const header = columns.map(c => esc(c.label)).join(',');
  const body = rows.map(r => columns.map(c => esc(c.get(r))).join(',')).join('\n');
  return header + '\n' + body;
}

/** ---------- Toasts ---------- */
function toast(message, type = 'info', timeout = 3200) {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
  el.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${escapeHtml(message)}</span>`;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  }, timeout);
}

/** ---------- Modal ---------- */
function openModal({ title, bodyHtml, footerHtml, size = 'md', onClose }) {
  closeModal();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'active-modal';
  overlay.innerHTML = `
    <div class="modal-box modal-${size}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title || '')}">
      <div class="modal-header">
        <h3>${escapeHtml(title || '')}</h3>
        <button class="icon-btn modal-close" aria-label="Close">✕</button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
      ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
    </div>`;
  document.body.appendChild(overlay);
  document.body.classList.add('modal-open');
  overlay.querySelector('.modal-close').onclick = closeModal;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  const escHandler = (e) => { if (e.key === 'Escape') closeModal(); };
  document.addEventListener('keydown', escHandler);
  overlay._escHandler = escHandler;
  overlay._onClose = onClose;
  return overlay;
}

function closeModal() {
  const overlay = document.getElementById('active-modal');
  if (overlay) {
    document.removeEventListener('keydown', overlay._escHandler);
    if (overlay._onClose) overlay._onClose();
    overlay.remove();
  }
  document.body.classList.remove('modal-open');
}

function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const overlay = openModal({
      title,
      bodyHtml: `<p class="confirm-msg">${escapeHtml(message)}</p>`,
      footerHtml: `
        <button class="btn btn-ghost" id="confirm-cancel">Cancel</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirm-ok">${escapeHtml(confirmLabel)}</button>`,
      onClose: () => resolve(false),
    });
    overlay.querySelector('#confirm-cancel').onclick = () => { closeModal(); resolve(false); };
    overlay.querySelector('#confirm-ok').onclick = () => { overlay._onClose = null; closeModal(); resolve(true); };
  });
}

/** ---------- Badges ---------- */
function statusBadge(status) {
  if (!status) return `<span class="badge badge-muted">N/A</span>`;
  const s = String(status).toLowerCase();
  let cls = 'badge-muted';
  if (/(shortlist|approved|active|completed|good)/.test(s)) cls = 'badge-green';
  else if (/(pending|review|progress|evaluat)/.test(s)) cls = 'badge-amber';
  else if (/(reject|blocked|inactive|discontinu)/.test(s)) cls = 'badge-red';
  return `<span class="badge ${cls}">${escapeHtml(status)}</span>`;
}

function categoryBadge(category) {
  const color = (window.CATEGORY_COLORS_MAP || {})[category] || '#6366f1';
  return `<span class="badge cat-badge" style="--cat-color:${color}"><span class="cat-dot"></span>${escapeHtml(category || 'N/A')}</span>`;
}

/** ---------- Pagination ---------- */
function paginate(array, page, pageSize) {
  const total = array.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(Math.max(1, page), totalPages);
  const start = (p - 1) * pageSize;
  return { pageItems: array.slice(start, start + pageSize), total, totalPages, page: p };
}

function paginationControlsHtml(page, totalPages, total, idPrefix) {
  return `
    <div class="pagination" data-prefix="${idPrefix}">
      <span class="pagination-info">${total} record${total === 1 ? '' : 's'} · page ${page} of ${totalPages}</span>
      <div class="pagination-btns">
        <button class="btn btn-ghost btn-sm" data-page-action="first" ${page <= 1 ? 'disabled' : ''}>«</button>
        <button class="btn btn-ghost btn-sm" data-page-action="prev" ${page <= 1 ? 'disabled' : ''}>‹ Prev</button>
        <button class="btn btn-ghost btn-sm" data-page-action="next" ${page >= totalPages ? 'disabled' : ''}>Next ›</button>
        <button class="btn btn-ghost btn-sm" data-page-action="last" ${page >= totalPages ? 'disabled' : ''}>»</button>
      </div>
    </div>`;
}

/** ---------- Empty state ---------- */
function emptyState({ icon = '📭', title, message, actionLabel, actionId }) {
  return `
    <div class="empty-state">
      <div class="empty-icon">${icon}</div>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
      ${actionLabel ? `<button class="btn btn-primary" id="${actionId}">${escapeHtml(actionLabel)}</button>` : ''}
    </div>`;
}

/** ---------- Count-up animation for KPIs ---------- */
function animateCountUp(el, target, isCurrency = false, duration = 700) {
  const safeTarget = Math.max(0, Number.isFinite(Number(target)) ? Number(target) : 0);
  const start = 0;
  const startTime = performance.now();
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) { el.textContent = isCurrency ? fmtCurrency(safeTarget) : fmtNumber(safeTarget); return; }
  function step(now) {
    const progress = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.round(start + (safeTarget - start) * eased);
    el.textContent = isCurrency ? fmtCurrency(value) : fmtNumber(value);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/** ---------- Field label prettifier ---------- */
const FIELD_LABELS = {
  vendorName: 'Vendor Name', contactPerson: 'Contact Person', phone: 'Phone', email: 'Email',
  address: 'Address', city: 'City', state: 'State', pinCode: 'PIN Code', brand: 'Brand',
  productName: 'Product Name', model: 'Model', quantity: 'Quantity', unitPrice: 'Unit Price',
  subtotal: 'Subtotal', gstPercent: 'GST', gstAmount: 'GST Amount', grandTotal: 'Grand Total',
  freight: 'Freight / Cartage', installationCharge: 'Installation Charge', warranty: 'Warranty',
  deliveryTime: 'Delivery Time / TAT', paymentTerms: 'Payment Terms', advance: 'Advance',
  rating: 'Score / Rating', pros: 'Pros', cons: 'Cons', notes: 'Notes', sourceLink: 'Source Link',
  color: 'Color', material: 'Material',
};
function prettyLabel(key) {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  return String(key).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^\w/, c => c.toUpperCase());
}
