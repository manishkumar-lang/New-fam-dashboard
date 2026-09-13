PAGE_RENDERERS.categories = async function (root) {
  const [categories, vendorRecords, solutionRecords, vendors] = await Promise.all([
    db.getAll('categories'), db.getAll('vendorMatrix'), db.getAll('solutionMatrix'), db.getAll('vendors'),
  ]);
  const activeVendor = vendorRecords.filter(r => !r.deletedAt);
  const activeSolution = solutionRecords.filter(r => !r.deletedAt);

  const stats = categories.map(cat => {
    const vRecs = activeVendor.filter(r => r.category === cat.name);
    const sRecs = activeSolution.filter(r => r.category === cat.name);
    const distinctVendors = new Set(vRecs.map(r => String(r.normalized.vendorName || '').toLowerCase()).filter(Boolean));
    const productLines = new Set(vRecs.map(r => r.productLine));
    const confirmed = vRecs.filter(r => r.categorySource === 'docx_confirmed').length;
    return { ...cat, vendorRecordCount: vRecs.length, solutionRecordCount: sRecs.length, vendorCount: distinctVendors.size, productLineCount: productLines.size, confirmedCount: confirmed };
  }).sort((a, b) => b.vendorRecordCount - a.vendorRecordCount);

  root.innerHTML = `
    <div class="section-head">
      <div><h2>Categories</h2><div class="section-sub">${categories.length} procurement categories — click through to see filtered vendor records</div></div>
      <button class="btn btn-primary btn-sm" id="cat-add">+ New Category</button>
    </div>
    <div class="record-cards" id="cat-grid"></div>
  `;

  const grid = document.getElementById('cat-grid');
  grid.innerHTML = stats.map(c => `
    <div class="record-card" data-cat="${escapeHtml(c.name)}" style="border-left-color:${c.color}">
      <div class="rc-title">${escapeHtml(c.name)}</div>
      <div class="rc-sub">${c.vendorRecordCount === c.confirmedCount || c.confirmedCount === 0 ? (c.confirmedCount ? 'Confirmed mapping' : 'Inferred from sheet names') : `${c.confirmedCount} confirmed / ${c.vendorRecordCount - c.confirmedCount} inferred`}</div>
      <div class="rc-row"><span>Vendor records</span><span>${c.vendorRecordCount}</span></div>
      <div class="rc-row"><span>Distinct vendors</span><span>${c.vendorCount}</span></div>
      <div class="rc-row"><span>Product lines</span><span>${c.productLineCount}</span></div>
      <div class="rc-row"><span>Solution records</span><span>${c.solutionRecordCount}</span></div>
      <div class="rc-foot">
        <button class="btn btn-secondary btn-sm" data-open-vendors="${escapeHtml(c.name)}">View vendors →</button>
        <button class="icon-btn" data-edit-cat="${c.id}" title="Rename">✎</button>
      </div>
    </div>`).join('');

  grid.querySelectorAll('[data-open-vendors]').forEach(btn => btn.onclick = () => {
    VendorPageState.category = btn.getAttribute('data-open-vendors');
    VendorPageState.page = 1;
    navigate('vendors');
  });
  grid.querySelectorAll('[data-edit-cat]').forEach(btn => btn.onclick = () => openCategoryEditForm(btn.getAttribute('data-edit-cat'), () => PAGE_RENDERERS.categories(root)));
  document.getElementById('cat-add').onclick = () => openCategoryAddForm(() => PAGE_RENDERERS.categories(root));
};

function openCategoryAddForm(onChange) {
  const bodyHtml = `
    <div class="form-field"><label>Category name</label><input type="text" id="newcat-name" placeholder="e.g. Coffee Machines"></div>
    <div class="form-field" style="margin-top:10px;"><label>Description (optional)</label><textarea id="newcat-desc" rows="3"></textarea></div>
  `;
  const footerHtml = `<button class="btn btn-ghost" id="nc-cancel">Cancel</button><button class="btn btn-primary" id="nc-save">Create</button>`;
  const overlay = openModal({ title: 'New category', bodyHtml, footerHtml, size: 'sm' });
  overlay.querySelector('#nc-cancel').onclick = closeModal;
  overlay.querySelector('#nc-save').onclick = async () => {
    const name = overlay.querySelector('#newcat-name').value.trim();
    if (!name) { toast('Category name is required', 'error'); return; }
    const existing = await db.getAll('categories');
    if (existing.find(c => c.name.toLowerCase() === name.toLowerCase())) { toast('That category already exists', 'error'); return; }
    const cat = { id: 'cat_' + slugify(name), name, description: overlay.querySelector('#newcat-desc').value.trim(), color: '#6366f1', order: existing.length };
    await db.put('categories', cat);
    await db.logActivity('create', 'categories', cat.id, null, cat);
    toast('Category created — it will appear once a record uses it', 'success');
    closeModal();
    if (onChange) onChange();
  };
}

function openCategoryEditForm(id, onChange) {
  db.get('categories', id).then(cat => {
    if (!cat) return;
    const bodyHtml = `
      <div class="form-field"><label>Category name</label><input type="text" id="ec-name" value="${escapeHtml(cat.name)}"></div>
      <div class="form-field" style="margin-top:10px;"><label>Description</label><textarea id="ec-desc" rows="3">${escapeHtml(cat.description || '')}</textarea></div>
      <div class="form-field" style="margin-top:10px;"><label>Color</label><input type="color" id="ec-color" value="${cat.color || '#6366f1'}" style="width:60px; padding:2px;"></div>
    `;
    const footerHtml = `<button class="btn btn-ghost" id="ec-cancel">Cancel</button><button class="btn btn-primary" id="ec-save">Save</button>`;
    const overlay = openModal({ title: 'Edit category', bodyHtml, footerHtml, size: 'sm' });
    overlay.querySelector('#ec-cancel').onclick = closeModal;
    overlay.querySelector('#ec-save').onclick = async () => {
      const before = { ...cat };
      cat.name = overlay.querySelector('#ec-name').value.trim() || cat.name;
      cat.description = overlay.querySelector('#ec-desc').value.trim();
      cat.color = overlay.querySelector('#ec-color').value;
      await db.put('categories', cat);
      await db.logActivity('update', 'categories', cat.id, before, cat);
      toast('Category updated', 'success');
      closeModal();
      if (onChange) onChange();
    };
  });
}
