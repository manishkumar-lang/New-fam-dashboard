const VendorPageState = {
  view: 'sheets', search: '', category: '', productLine: '', sortField: 'vendorName', sortDir: 'asc',
  page: 1, pageSize: 20, selected: new Set(),
};

PAGE_RENDERERS.vendors = async function (root, params) {
  // support #/vendors/<id> deep link to open detail directly
  if (params && params.sub) {
    await renderVendorList(root);
    openRecordDetail('vendorMatrix', params.sub, () => renderVendorList(root));
    return;
  }
  // support query-string style category filter from search palette (#/vendors?category=X)
  const hashQuery = location.hash.split('?')[1];
  if (hashQuery) {
    const qp = new URLSearchParams(hashQuery);
    if (qp.get('category')) VendorPageState.category = qp.get('category');
  }
  await renderVendorList(root);
};

async function renderVendorList(root) {
  const all = await db.getAll('vendorMatrix');
  const active = all.filter(r => !r.deletedAt);
  const categories = [...new Set(active.map(r => r.category))].sort();
  const productLines = [...new Set(active.filter(r => !VendorPageState.category || r.category === VendorPageState.category).map(r => r.productLine))].sort();

  let filtered = active.filter(r => {
    if (VendorPageState.category && r.category !== VendorPageState.category) return false;
    if (VendorPageState.productLine && r.productLine !== VendorPageState.productLine) return false;
    if (VendorPageState.search) {
      const hay = JSON.stringify(r.rawRecord).toLowerCase();
      if (!hay.includes(VendorPageState.search.toLowerCase())) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    const av = a.normalized[VendorPageState.sortField] ?? a.rawRecord[VendorPageState.sortField] ?? '';
    const bv = b.normalized[VendorPageState.sortField] ?? b.rawRecord[VendorPageState.sortField] ?? '';
    const an = Number(av), bn = Number(bv);
    let cmp;
    if (!isNaN(an) && !isNaN(bn) && av !== '' && bv !== '') cmp = an - bn;
    else cmp = String(av).localeCompare(String(bv));
    return VendorPageState.sortDir === 'asc' ? cmp : -cmp;
  });

  const { pageItems, total, totalPages, page } = paginate(filtered, VendorPageState.page, VendorPageState.pageSize);
  VendorPageState.page = page;

  root.innerHTML = `
    <div class="section-head">
      <div><h2>Vendor Matrix</h2><div class="section-sub">${active.length} active vendor records across ${categories.length} categories</div></div>
      <div class="flex gap-8">
        <button class="btn btn-ghost btn-sm" id="vm-import">Import</button>
        <button class="btn btn-ghost btn-sm" id="vm-export">Export</button>
        <button class="btn btn-primary btn-sm" id="vm-add">+ Add Vendor Record</button>
      </div>
    </div>

    <div class="filter-bar">
      <input type="text" id="vm-search" placeholder="Search vendor, product, phone, notes…" value="${escapeHtml(VendorPageState.search)}" style="min-width:240px;">
      <select id="vm-category"><option value="">All categories</option>${categories.map(c => `<option value="${escapeHtml(c)}" ${VendorPageState.category===c?'selected':''}>${escapeHtml(c)}</option>`).join('')}</select>
      <select id="vm-productline"><option value="">All product lines</option>${productLines.map(p => `<option value="${escapeHtml(p)}" ${VendorPageState.productLine===p?'selected':''}>${escapeHtml(p)}</option>`).join('')}</select>
      <select id="vm-pagesize">
        ${[10,20,50,100].map(n => `<option value="${n}" ${VendorPageState.pageSize===n?'selected':''}>${n} / page</option>`).join('')}
      </select>
      <div class="view-toggle">
        <button data-view="sheets" class="${VendorPageState.view==='sheets'?'active':''}">Sheets</button>
        <button data-view="table" class="${VendorPageState.view==='table'?'active':''}">Table</button>
        <button data-view="cards" class="${VendorPageState.view==='cards'?'active':''}">Cards</button>
      </div>
      ${(VendorPageState.category || VendorPageState.productLine || VendorPageState.search) ? `<button class="btn btn-ghost btn-sm" id="vm-clear">Clear filters</button>` : ''}
    </div>

    ${VendorPageState.selected.size ? `
      <div class="chip" style="margin-bottom:10px;">
        ${VendorPageState.selected.size} selected
        <button id="vm-bulk-delete" title="Delete selected">Delete</button>
        <button id="vm-bulk-export" title="Export selected">Export</button>
        <button id="vm-bulk-clear" title="Clear selection">✕</button>
      </div>` : ''}

    <div id="vm-list-container"></div>
  `;

  const listContainer = document.getElementById('vm-list-container');
  if (!filtered.length) {
    listContainer.innerHTML = emptyState({
      icon: '📭', title: 'No vendor records found', message: 'Try clearing filters, or add a new vendor record / import more data.',
      actionLabel: 'Add Vendor Record', actionId: 'vm-empty-add',
    });
    const btn = document.getElementById('vm-empty-add');
    if (btn) btn.onclick = () => openVendorAddForm(() => renderVendorList(root));
  } else if (VendorPageState.view === 'sheets') {
    renderSheetDirectory(listContainer, filtered, (productLine) => {
      const rec = filtered.find(r => r.productLine === productLine);
      openSheetView(productLine, rec ? rec.category : VendorPageState.category);
    });
  } else if (VendorPageState.view === 'table') {
    renderVendorTable(listContainer, pageItems, page, totalPages, total, root);
  } else {
    renderVendorCards(listContainer, pageItems, page, totalPages, total, root);
  }

  // bindings
  document.getElementById('vm-search').oninput = debounce((e) => { VendorPageState.search = e.target.value; VendorPageState.page = 1; renderVendorList(root); }, 250);
  document.getElementById('vm-category').onchange = (e) => { VendorPageState.category = e.target.value; VendorPageState.productLine = ''; VendorPageState.page = 1; renderVendorList(root); };
  document.getElementById('vm-productline').onchange = (e) => { VendorPageState.productLine = e.target.value; VendorPageState.page = 1; renderVendorList(root); };
  document.getElementById('vm-pagesize').onchange = (e) => { VendorPageState.pageSize = Number(e.target.value); VendorPageState.page = 1; renderVendorList(root); };
  document.querySelectorAll('[data-view]').forEach(btn => btn.onclick = () => { VendorPageState.view = btn.getAttribute('data-view'); renderVendorList(root); });
  const clearBtn = document.getElementById('vm-clear');
  if (clearBtn) clearBtn.onclick = () => { VendorPageState.search = ''; VendorPageState.category = ''; VendorPageState.productLine = ''; VendorPageState.page = 1; renderVendorList(root); };
  document.getElementById('vm-add').onclick = () => openVendorAddForm(() => renderVendorList(root));
  document.getElementById('vm-import').onclick = () => openImportDialog('vendorMatrix', () => renderVendorList(root));
  document.getElementById('vm-export').onclick = () => exportRecords(filtered, 'vendor-matrix');

  const bulkDelete = document.getElementById('vm-bulk-delete');
  if (bulkDelete) bulkDelete.onclick = async () => {
    const ok = await confirmDialog({ title: 'Delete selected records', danger: true, confirmLabel: `Delete ${VendorPageState.selected.size}`,
      message: `${VendorPageState.selected.size} record(s) will be moved to Trash. Continue?` });
    if (!ok) return;
    for (const id of VendorPageState.selected) await db.softDelete('vendorMatrix', id);
    toast(`${VendorPageState.selected.size} record(s) moved to Trash`, 'success');
    VendorPageState.selected.clear();
    SEARCH_INDEX = null;
    renderVendorList(root);
  };
  const bulkExport = document.getElementById('vm-bulk-export');
  if (bulkExport) bulkExport.onclick = () => exportRecords(active.filter(r => VendorPageState.selected.has(r.id)), 'vendor-matrix-selected');
  const bulkClear = document.getElementById('vm-bulk-clear');
  if (bulkClear) bulkClear.onclick = () => { VendorPageState.selected.clear(); renderVendorList(root); };
}

function vendorColumns() {
  return [
    { key: 'vendorName', label: 'Vendor' }, { key: 'productLine', label: 'Product Line', raw: true },
    { key: 'phone', label: 'Phone' }, { key: 'address', label: 'Location' },
    { key: 'unitPrice', label: 'Unit Price' }, { key: 'grandTotal', label: 'Grand Total' },
    { key: 'gstPercent', label: 'GST' }, { key: 'warranty', label: 'Warranty' },
  ];
}

function renderVendorTable(container, items, page, totalPages, total, root) {
  const cols = vendorColumns();
  container.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>
          <th style="width:30px;"><input type="checkbox" id="vm-select-all"></th>
          ${cols.map(c => `<th data-sort="${c.key}" class="${VendorPageState.sortField===c.key?'sorted':''}">${c.label} <span class="sort-arrow">${VendorPageState.sortField===c.key ? (VendorPageState.sortDir==='asc'?'▲':'▼') : '↕'}</span></th>`).join('')}
          <th>Category</th><th style="width:110px;">Actions</th>
        </tr></thead>
        <tbody>
          ${items.map(r => `
            <tr data-id="${r.id}">
              <td><input type="checkbox" class="vm-row-check" data-id="${r.id}" ${VendorPageState.selected.has(r.id)?'checked':''}></td>
              ${cols.map(c => `<td>${c.raw ? escapeHtml(r[c.key] || '') : fmtValue(r.normalized[c.key])}</td>`).join('')}
              <td>${categoryBadge(r.category)}</td>
              <td class="row-actions">
                <button class="icon-btn" data-action="view" data-id="${r.id}" title="View">👁</button>
                <button class="icon-btn" data-action="edit" data-id="${r.id}" title="Edit">✎</button>
                <button class="icon-btn" data-action="delete" data-id="${r.id}" title="Delete">🗑</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      ${paginationControlsHtml(page, totalPages, total, 'vm')}
    </div>`;
  bindVendorRowActions(container, root);
  bindPagination(container, VendorPageState, () => renderVendorList(root));
}

function renderVendorCards(container, items, page, totalPages, total, root) {
  container.innerHTML = `
    <div class="record-cards">
      ${items.map(r => `
        <div class="record-card" data-id="${r.id}" data-card-sheet="${escapeHtml(r.productLine)}" data-card-category="${escapeHtml(r.category)}">
          <div class="rc-title">${escapeHtml(r.normalized.vendorName || 'Unnamed vendor')}</div>
          <div class="rc-sub">${escapeHtml(r.productLine)}</div>
          <div class="rc-row"><span>Phone</span><span>${fmtValue(r.normalized.phone)}</span></div>
          <div class="rc-row"><span>Location</span><span>${fmtValue(r.normalized.address)}</span></div>
          <div class="rc-row"><span>Grand Total</span><span>${r.normalized.grandTotal!=null ? fmtCurrency(r.normalized.grandTotal) : 'N/A'}</span></div>
          <div class="rc-row"><span>Warranty</span><span>${fmtValue(r.normalized.warranty)}</span></div>
          <div class="rc-foot">
            ${categoryBadge(r.category)}
            <span class="row-actions">
              <button class="icon-btn" data-action="edit" data-id="${r.id}" title="Edit">✎</button>
              <button class="icon-btn" data-action="delete" data-id="${r.id}" title="Delete">🗑</button>
            </span>
          </div>
        </div>`).join('')}
    </div>
    <div class="table-wrap" style="border:none; margin-top:8px;">${paginationControlsHtml(page, totalPages, total, 'vm')}</div>`;
  bindVendorRowActions(container, root);
  bindPagination(container, VendorPageState, () => renderVendorList(root));
}

function bindVendorRowActions(container, root) {
  container.querySelectorAll('[data-action="view"]').forEach(el => el.onclick = (e) => {
    if (e.target.closest('[data-action="edit"], [data-action="delete"]')) return;
    const id = el.getAttribute('data-id') || el.closest('[data-id]').getAttribute('data-id');
    openRecordDetail('vendorMatrix', id, () => renderVendorList(root));
  });
  container.querySelectorAll('[data-action="edit"]').forEach(el => el.onclick = (e) => { e.stopPropagation(); openRecordEditForm('vendorMatrix', el.getAttribute('data-id'), () => renderVendorList(root)); });
  container.querySelectorAll('[data-action="delete"]').forEach(el => el.onclick = async (e) => {
    e.stopPropagation();
    const id = el.getAttribute('data-id');
    const ok = await confirmDialog({ title: 'Delete record', danger: true, confirmLabel: 'Move to Trash', message: 'This record will be moved to Trash and can be restored later.' });
    if (!ok) return;
    await db.softDelete('vendorMatrix', id);
    toast('Record moved to Trash', 'success');
    SEARCH_INDEX = null;
    renderVendorList(root);
  });
  container.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = async (e) => {
    if (e.target.closest('button') || e.target.closest('input')) return;
    const id = tr.getAttribute('data-id');
    const rec = await db.get('vendorMatrix', id);
    if (rec) openSheetView(rec.productLine, rec.category);
  });
  container.querySelectorAll('[data-card-sheet]').forEach(card => card.onclick = (e) => {
    if (e.target.closest('button')) return;
    openSheetView(card.getAttribute('data-card-sheet'), card.getAttribute('data-card-category'));
  });
  const selectAll = container.querySelector('#vm-select-all');
  if (selectAll) selectAll.onchange = () => {
    container.querySelectorAll('.vm-row-check').forEach(cb => { cb.checked = selectAll.checked; toggleSelect(cb.getAttribute('data-id'), selectAll.checked); });
    renderVendorListSelectionOnly();
  };
  container.querySelectorAll('.vm-row-check').forEach(cb => cb.onclick = (e) => {
    e.stopPropagation();
    toggleSelect(cb.getAttribute('data-id'), cb.checked);
    document.querySelector('.chip')?.remove();
    renderVendorListSelectionOnly();
  });
  container.querySelectorAll('th[data-sort]').forEach(th => th.onclick = () => {
    const field = th.getAttribute('data-sort');
    if (VendorPageState.sortField === field) VendorPageState.sortDir = VendorPageState.sortDir === 'asc' ? 'desc' : 'asc';
    else { VendorPageState.sortField = field; VendorPageState.sortDir = 'asc'; }
    renderVendorList(root);
  });
}
function toggleSelect(id, checked) { if (checked) VendorPageState.selected.add(id); else VendorPageState.selected.delete(id); }
function renderVendorListSelectionOnly() { /* selection chip only refreshes on next full render for simplicity */ }

function bindPagination(container, state, rerender) {
  container.querySelectorAll('[data-page-action]').forEach(btn => btn.onclick = () => {
    const action = btn.getAttribute('data-page-action');
    if (action === 'first') state.page = 1;
    if (action === 'prev') state.page = Math.max(1, state.page - 1);
    if (action === 'next') state.page = state.page + 1;
    if (action === 'last') state.page = 999999;
    rerender();
  });
}

function exportRecords(records, filenameBase) {
  const format = 'csv';
  const allKeys = new Set();
  records.forEach(r => Object.keys(r.rawRecord || {}).forEach(k => allKeys.add(k)));
  const columns = [
    { label: 'Category', get: r => r.category },
    { label: 'Product Line', get: r => r.productLine },
    ...[...allKeys].map(k => ({ label: k, get: r => r.rawRecord[k] })),
    { label: 'Source Sheet', get: r => r.source?.sourceSheet },
    { label: 'Source Row', get: r => r.source?.sourceRow },
  ];
  const csv = toCSV(records, columns);
  downloadFile(`${filenameBase}-${Date.now()}.csv`, csv, 'text/csv');
  toast(`Exported ${records.length} records`, 'success');
}

function openVendorAddForm(onChange) {
  const bodyHtml = `
    <div class="form-grid">
      ${['vendorName','productLine','category','phone','address','brand','unitPrice','gstPercent','grandTotal','warranty','deliveryTime','notes'].map(k => `
        <div class="form-field ${k==='notes'?'full':''}">
          <label>${escapeHtml(prettyLabel(k))}</label>
          <input type="text" data-new-field="${k}" placeholder="${k==='category' ? 'e.g. Furniture' : ''}">
        </div>`).join('')}
    </div>
    <p class="muted" style="font-size:11.5px; margin-top:10px;">Manually added records are tagged with source "Manual Entry" so they stay distinguishable from imported data.</p>`;
  const footerHtml = `<button class="btn btn-ghost" id="va-cancel">Cancel</button><button class="btn btn-primary" id="va-save">Add record</button>`;
  const overlay = openModal({ title: 'Add Vendor Record', bodyHtml, footerHtml, size: 'md' });
  overlay.querySelector('#va-cancel').onclick = closeModal;
  overlay.querySelector('#va-save').onclick = async () => {
    const values = {};
    overlay.querySelectorAll('[data-new-field]').forEach(input => { values[input.getAttribute('data-new-field')] = input.value.trim() || null; });
    if (!values.vendorName) { toast('Vendor name is required', 'error'); return; }
    const id = 'manual_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const category = values.category || 'Uncategorized / General Procurement';
    const record = {
      id, recordType: 'vendor_matrix', category, categorySource: 'manual_entry',
      productLine: values.productLine || 'Manual Entry',
      normalized: {
        vendorName: values.vendorName, phone: values.phone, address: values.address, brand: values.brand,
        unitPrice: values.unitPrice, gstPercent: values.gstPercent, grandTotal: values.grandTotal,
        warranty: values.warranty, deliveryTime: values.deliveryTime, notes: values.notes,
      },
      customFields: {}, rawRecord: values, fieldDescriptions: {},
      source: { sourceFile: 'Manual Entry', sourceWorkbook: 'N/A', sourceSheet: 'N/A', sourceRow: null, importDate: new Date().toISOString() },
      lastUpdated: new Date().toISOString(), deletedAt: null,
    };
    await db.put('vendorMatrix', record);
    // ensure category exists
    const existingCats = await db.getAll('categories');
    if (!existingCats.find(c => c.name === category)) {
      await db.put('categories', { id: 'cat_' + slugify(category), name: category, description: '', color: '#6366f1', order: existingCats.length });
    }
    await db.logActivity('create', 'vendorMatrix', id, null, record);
    toast('Vendor record added', 'success');
    SEARCH_INDEX = null;
    closeModal();
    if (onChange) onChange();
  };
}

/** ---------------- Import dialog (CSV/XLSX via SheetJS) ---------------- */
function openImportDialog(store, onChange) {
  const bodyHtml = `
    <p class="muted" style="font-size:12.5px; margin-bottom:12px;">Upload a CSV or XLSX file. The first row is treated as headers. Rows are added as new records — nothing existing is overwritten.</p>
    <input type="file" id="import-file-input" accept=".csv,.xlsx,.xls">
    <div id="import-preview" style="margin-top:14px;"></div>
  `;
  const footerHtml = `<button class="btn btn-ghost" id="imp-cancel">Cancel</button><button class="btn btn-primary" id="imp-confirm" disabled>Import</button>`;
  const overlay = openModal({ title: 'Import records', bodyHtml, footerHtml, size: 'lg' });
  let parsedRows = [];

  overlay.querySelector('#import-file-input').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
    parsedRows = rows;
    const preview = document.getElementById('import-preview');
    if (!rows.length) { preview.innerHTML = `<p class="muted">No rows detected.</p>`; return; }
    const headers = Object.keys(rows[0]);
    preview.innerHTML = `
      <p style="font-size:12.5px; margin-bottom:8px;"><b>${rows.length}</b> rows detected, <b>${headers.length}</b> columns.</p>
      <div class="table-wrap" style="max-height:240px; overflow:auto;">
        <table class="data-table"><thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>${rows.slice(0, 5).map(r => `<tr>${headers.map(h => `<td>${fmtValue(r[h])}</td>`).join('')}</tr>`).join('')}</tbody></table>
      </div>`;
    overlay.querySelector('#imp-confirm').disabled = false;
  };

  overlay.querySelector('#imp-cancel').onclick = closeModal;
  overlay.querySelector('#imp-confirm').onclick = async () => {
    let count = 0;
    for (const row of parsedRows) {
      const normalized = {}; const custom = {};
      Object.entries(row).forEach(([k, v]) => {
        if (v === null || v === '') return;
        const canon = normalize_header_js(k);
        if (canon) normalized[canon] = v; else custom[k] = v;
      });
      const id = 'import_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const category = normalized.category || 'Uncategorized / General Procurement';
      const record = {
        id, recordType: store === 'vendorMatrix' ? 'vendor_matrix' : 'solution_matrix', category,
        categorySource: 'manual_import', productLine: 'Imported File', normalized, customFields: custom,
        rawRecord: row, fieldDescriptions: {},
        source: { sourceFile: 'User Import', sourceWorkbook: 'N/A', sourceSheet: 'N/A', sourceRow: null, importDate: new Date().toISOString() },
        lastUpdated: new Date().toISOString(), deletedAt: null,
      };
      await db.put(store, record);
      count++;
    }
    await db.logActivity('import', store, 'bulk', null, { count });
    toast(`Imported ${count} record(s)`, 'success');
    SEARCH_INDEX = null;
    closeModal();
    if (onChange) onChange();
  };
}

function normalize_header_js(h) {
  const map = {
    'vendor name': 'vendorName', 'vendor': 'vendorName', 'supplier': 'vendorName',
    'phone': 'phone', 'contact number': 'phone', 'mobile': 'phone',
    'address': 'address', 'location': 'address', 'email': 'email',
    'product name': 'productName', 'product': 'productName', 'brand': 'brand', 'model': 'model',
    'price': 'unitPrice', 'unit price': 'unitPrice', 'rate': 'unitPrice',
    'gst': 'gstPercent', 'gst %': 'gstPercent', 'grand total': 'grandTotal', 'warranty': 'warranty',
    'category': 'category', 'notes': 'notes', 'rating': 'rating',
  };
  return map[String(h).trim().toLowerCase()] || null;
}
