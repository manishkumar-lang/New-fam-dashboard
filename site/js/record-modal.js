/**
 * Shared detail + edit modal for vendorMatrix / solutionMatrix records.
 * store: 'vendorMatrix' | 'solutionMatrix'
 */
async function openRecordDetail(store, id, onChange) {
  const record = await db.get(store, id);
  if (!record) { toast('Record not found — it may have been deleted.', 'error'); return; }
  renderRecordDetailModal(store, record, onChange);
}

function recordDisplayName(record) {
  return record.normalized.vendorName || record.normalized.productName || firstRawValue(record) || record.productLine || 'Untitled record';
}

function firstRawValue(record) {
  const raw = record.rawRecord || {};
  const keys = Object.keys(raw);
  // Prefer the first column whose header suggests it's a name/label, skipping serial-number-style columns
  for (const k of keys) {
    const v = raw[k];
    if (v === null || v === undefined || String(v).trim() === '') continue;
    const looksLikeSerial = /^(s\.?\s?no\.?|sr\.?\s?no\.?|sl\.?\s?no\.?|#|index)$/i.test(k.trim());
    const isPureShortNumber = /^\d{1,3}$/.test(String(v).trim());
    if (looksLikeSerial || isPureShortNumber) continue;
    return v;
  }
  // fall back to the very first non-empty value even if numeric-looking
  for (const k of keys) { if (raw[k] !== null && raw[k] !== undefined && String(raw[k]).trim() !== '') return raw[k]; }
  return null;
}

function renderRecordDetailModal(store, record, onChange) {
  const title = recordDisplayName(record);
  const allFields = { ...record.normalized, ...record.customFields };
  const fieldKeys = Object.keys(allFields);

  const bodyHtml = `
    <div class="tabs" id="rd-tabs">
      <button class="tab-btn active" data-tab="overview">Overview</button>
      <button class="tab-btn" data-tab="raw">Raw Source Data</button>
      <button class="tab-btn" data-tab="lineage">Source &amp; Lineage</button>
    </div>
    <div id="rd-tab-content">
      ${renderOverviewTab(record, allFields, fieldKeys)}
    </div>`;

  const footerHtml = `
    <button class="btn btn-ghost" id="rd-duplicate">Duplicate</button>
    <button class="btn btn-danger" id="rd-delete">Delete</button>
    <button class="btn btn-primary" id="rd-edit">Edit fields</button>`;

  const overlay = openModal({ title: `${title}`, bodyHtml, footerHtml, size: 'lg' });

  overlay.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      overlay.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.getAttribute('data-tab');
      const content = document.getElementById('rd-tab-content');
      if (tab === 'overview') content.innerHTML = renderOverviewTab(record, allFields, fieldKeys);
      if (tab === 'raw') content.innerHTML = renderRawTab(record);
      if (tab === 'lineage') content.innerHTML = renderLineageTab(record);
    };
  });

  overlay.querySelector('#rd-edit').onclick = () => {
    closeModal();
    openRecordEditForm(store, record.id, onChange);
  };
  overlay.querySelector('#rd-delete').onclick = async () => {
    const ok = await confirmDialog({
      title: 'Delete record', danger: true, confirmLabel: 'Move to Trash',
      message: `"${title}" will be moved to Trash and can be restored later. Continue?`,
    });
    if (!ok) return;
    await db.softDelete(store, record.id);
    toast('Record moved to Trash', 'success');
    SEARCH_INDEX = null;
    if (onChange) onChange();
  };
  overlay.querySelector('#rd-duplicate').onclick = async () => {
    const copy = JSON.parse(JSON.stringify(record));
    copy.id = 'dup_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    if (copy.normalized.vendorName) copy.normalized.vendorName += ' (Copy)';
    if (copy.normalized.productName) copy.normalized.productName += ' (Copy)';
    copy.rawRecord = { ...copy.rawRecord, '__duplicate_of__': record.id };
    copy.lastUpdated = new Date().toISOString();
    await db.put(store, copy);
    await db.logActivity('duplicate', store, copy.id, record, copy);
    toast('Record duplicated', 'success');
    SEARCH_INDEX = null;
    closeModal();
    if (onChange) onChange();
  };
}

function renderOverviewTab(record, allFields, fieldKeys) {
  const priorityFields = ['vendorName', 'productName', 'brand', 'model', 'contactPerson', 'phone', 'email',
    'address', 'unitPrice', 'gstPercent', 'grandTotal', 'warranty', 'deliveryTime', 'paymentTerms', 'rating',
    'pros', 'cons', 'notes', 'sourceLink'];
  const ordered = [...priorityFields.filter(k => k in allFields), ...fieldKeys.filter(k => !priorityFields.includes(k))];
  return `
    <div class="flex gap-8" style="margin-bottom:14px; flex-wrap:wrap;">
      ${categoryBadge(record.category)}
      <span class="badge badge-muted">${escapeHtml(record.productLine)}</span>
      <span class="badge badge-muted">${record.recordType === 'vendor_matrix' ? 'Vendor Record' : 'Solution Record'}</span>
      ${record.categorySource === 'inferred_from_sheet_name' ? '<span class="badge badge-amber">Category inferred</span>' : '<span class="badge badge-green">Category confirmed</span>'}
    </div>
    <div class="detail-grid">
      ${ordered.map(k => `
        <div class="detail-field">
          <label>${escapeHtml(prettyLabel(k))}</label>
          <div class="value">${fmtValue(allFields[k])}</div>
        </div>`).join('')}
    </div>
    ${!ordered.length ? emptyState({ icon: '📄', title: 'No fields captured', message: 'This record has no structured fields beyond its source row.' }) : ''}
  `;
}

function renderRawTab(record) {
  const raw = record.rawRecord || {};
  const desc = record.fieldDescriptions || {};
  const keys = Object.keys(raw);
  return `
    <p class="muted" style="margin-bottom:12px; font-size:12.5px;">Exactly as it appeared in the source spreadsheet — original headers, no normalization applied.</p>
    <div class="table-wrap" style="border:none;">
      <table class="data-table">
        <thead><tr><th>Original Column</th><th>Value</th><th>Column Description (from sheet)</th></tr></thead>
        <tbody>
          ${keys.map(k => `
            <tr>
              <td style="font-weight:600;">${escapeHtml(k)}</td>
              <td>${fmtValue(raw[k])}</td>
              <td class="muted">${escapeHtml(desc[k] || '—')}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderLineageTab(record) {
  const s = record.source || {};
  return `
    <div class="source-trace">
      <div style="margin-bottom:6px;"><b>Source file:</b> ${escapeHtml(s.sourceFile || 'N/A')}</div>
      <div style="margin-bottom:6px;"><b>Workbook:</b> ${escapeHtml(s.sourceWorkbook || 'N/A')}</div>
      <div style="margin-bottom:6px;"><b>Sheet:</b> ${escapeHtml(s.sourceSheet || 'N/A')}</div>
      <div style="margin-bottom:6px;"><b>Row:</b> ${escapeHtml(s.sourceRow ?? 'N/A')}</div>
      <div style="margin-bottom:6px;"><b>Imported:</b> ${fmtDate(s.importDate)}</div>
      <div><b>Last updated:</b> ${fmtDate(record.lastUpdated)}</div>
    </div>
    <p class="muted" style="margin-top:14px; font-size:12px;">Recommendation ↔ source traceability: every value shown in this record can be traced back to the exact cell above in the original Wellversed vendor matrix workbook.</p>
  `;
}

/** ---------------- Edit form ---------------- */
function openRecordEditForm(store, id, onChange) {
  db.get(store, id).then(record => {
    if (!record) return;
    const allFields = { ...record.normalized, ...record.customFields };
    const keys = Object.keys(allFields);
    const bodyHtml = `
      <p class="muted" style="margin-bottom:14px; font-size:12.5px;">Editing normalized fields. The original source row is preserved untouched under "Raw Source Data".</p>
      <div class="form-grid" id="edit-form-grid">
        ${keys.map(k => `
          <div class="form-field">
            <label>${escapeHtml(prettyLabel(k))}</label>
            <input type="text" data-field="${escapeHtml(k)}" value="${escapeHtml(allFields[k] ?? '')}">
          </div>`).join('')}
        <div class="form-field full">
          <label>Add a new field</label>
          <div style="display:flex; gap:8px;">
            <input type="text" id="new-field-name" placeholder="Field name (e.g. Negotiated Discount)">
            <input type="text" id="new-field-value" placeholder="Value">
            <button class="btn btn-secondary btn-sm" id="add-field-btn" type="button">Add</button>
          </div>
        </div>
      </div>`;
    const footerHtml = `
      <button class="btn btn-ghost" id="edit-cancel">Cancel</button>
      <button class="btn btn-primary" id="edit-save">Save changes</button>`;
    const overlay = openModal({ title: `Edit — ${recordDisplayName(record)}`, bodyHtml, footerHtml, size: 'lg' });

    overlay.querySelector('#add-field-btn').onclick = () => {
      const nameInput = overlay.querySelector('#new-field-name');
      const valInput = overlay.querySelector('#new-field-value');
      const name = nameInput.value.trim();
      if (!name) return;
      const grid = overlay.querySelector('#edit-form-grid');
      const div = document.createElement('div');
      div.className = 'form-field';
      div.innerHTML = `<label>${escapeHtml(prettyLabel(name))}</label><input type="text" data-field="${escapeHtml(name)}" value="${escapeHtml(valInput.value)}">`;
      grid.insertBefore(div, grid.lastElementChild);
      nameInput.value = ''; valInput.value = '';
    };

    overlay.querySelector('#edit-cancel').onclick = closeModal;
    overlay.querySelector('#edit-save').onclick = async () => {
      const before = JSON.parse(JSON.stringify(record));
      const inputs = overlay.querySelectorAll('[data-field]');
      inputs.forEach(input => {
        const key = input.getAttribute('data-field');
        const val = input.value.trim() === '' ? null : input.value.trim();
        if (key in record.normalized) record.normalized[key] = val;
        else record.customFields[key] = val;
      });
      record.lastUpdated = new Date().toISOString();
      await db.put(store, record);
      await db.logActivity('update', store, record.id, before, record);
      toast('Changes saved', 'success');
      SEARCH_INDEX = null;
      closeModal();
      if (onChange) onChange();
    };
  });
}
