const KBPageState = { search: '', employee: '', docType: '', page: 1, pageSize: 24 };

PAGE_RENDERERS.knowledge = async function (root, params) {
  if (params && params.sub) {
    await renderKnowledgeList(root);
    openKBDetail(params.sub);
    return;
  }
  await renderKnowledgeList(root);
};

async function renderKnowledgeList(root) {
  const [docs, employees] = await Promise.all([db.getAll('knowledgeBaseDocs'), db.getAll('employees')]);
  const active = docs.filter(d => !d.deletedAt);
  const employeeNames = [...new Set(active.map(d => d.employee).filter(Boolean))].sort();
  const docTypes = [...new Set(active.map(d => d.docType).filter(Boolean))].sort();

  let filtered = active.filter(d => {
    if (KBPageState.employee && d.employee !== KBPageState.employee) return false;
    if (KBPageState.docType && d.docType !== KBPageState.docType) return false;
    if (KBPageState.search) {
      const hay = (d.title + ' ' + (d.topic || '') + ' ' + (d.employee || '')).toLowerCase();
      if (!hay.includes(KBPageState.search.toLowerCase())) return false;
    }
    return true;
  });

  const { pageItems, total, totalPages, page } = paginate(filtered, KBPageState.page, KBPageState.pageSize);
  KBPageState.page = page;

  root.innerHTML = `
    <div class="section-head">
      <div><h2>Knowledge Base</h2><div class="section-sub">${active.length} research documents from the Batch-I training program — Solution Matrices, Vendor Matrices, Requirement Matrices and referencing work by employee</div></div>
    </div>

    <div class="grid-2" style="margin-bottom:16px;">
      <div class="panel">
        <div class="panel-title">Employees (${employees.length})</div>
        <div class="record-cards" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr));">
          ${employees.slice(0, 8).map(e => `
            <div class="kb-card">
              <div class="kb-title">${escapeHtml(e.rawRecord['Employee Name'] || 'Unnamed')}</div>
              <div class="kb-meta">${active.filter(d => d.employee === (e.rawRecord['Employee Name'] || '').split(' ')[0]).length || active.filter(d=>d.employee && e.rawRecord['Employee Name'] && e.rawRecord['Employee Name'].includes(d.employee)).length} docs</div>
            </div>`).join('')}
        </div>
      </div>
      <div class="panel">
        <div class="panel-title">Document types</div>
        <div class="category-legend">
          ${docTypes.map(t => `<div class="leg-item"><span class="leg-dot" style="background:var(--indigo-500)"></span>${escapeHtml(t)} — ${active.filter(d=>d.docType===t).length}</div>`).join('')}
        </div>
      </div>
    </div>

    <div class="filter-bar">
      <input type="text" id="kb-search" placeholder="Search topic, employee, title…" value="${escapeHtml(KBPageState.search)}" style="min-width:240px;">
      <select id="kb-employee"><option value="">All employees</option>${employeeNames.map(e => `<option ${KBPageState.employee===e?'selected':''}>${escapeHtml(e)}</option>`).join('')}</select>
      <select id="kb-type"><option value="">All types</option>${docTypes.map(t => `<option ${KBPageState.docType===t?'selected':''}>${escapeHtml(t)}</option>`).join('')}</select>
      ${(KBPageState.search||KBPageState.employee||KBPageState.docType) ? `<button class="btn btn-ghost btn-sm" id="kb-clear">Clear filters</button>` : ''}
    </div>

    <div id="kb-list"></div>
  `;

  const list = document.getElementById('kb-list');
  if (!filtered.length) {
    list.innerHTML = emptyState({ icon: '☰', title: 'No knowledge base documents found', message: 'Try clearing filters.' });
  } else {
    list.innerHTML = `
      <div class="record-cards">
        ${pageItems.map(d => `
          <div class="kb-card" data-id="${d.id}" style="cursor:pointer;">
            <div class="kb-type">${escapeHtml(d.docType)}</div>
            <div class="kb-title">${escapeHtml(d.title)}</div>
            <div class="kb-meta">${d.employee ? escapeHtml(d.employee) + ' · ' : ''}${d.rowCount} row(s) captured</div>
          </div>`).join('')}
      </div>
      <div class="table-wrap" style="border:none; margin-top:10px;">${paginationControlsHtml(page, totalPages, total, 'kb')}</div>
    `;
    list.querySelectorAll('[data-id]').forEach(card => card.onclick = () => openKBDetail(card.getAttribute('data-id')));
    bindPagination(list, KBPageState, () => renderKnowledgeList(root));
  }

  document.getElementById('kb-search').oninput = debounce((e) => { KBPageState.search = e.target.value; KBPageState.page = 1; renderKnowledgeList(root); }, 250);
  document.getElementById('kb-employee').onchange = (e) => { KBPageState.employee = e.target.value; KBPageState.page = 1; renderKnowledgeList(root); };
  document.getElementById('kb-type').onchange = (e) => { KBPageState.docType = e.target.value; KBPageState.page = 1; renderKnowledgeList(root); };
  const clearBtn = document.getElementById('kb-clear');
  if (clearBtn) clearBtn.onclick = () => { KBPageState.search=''; KBPageState.employee=''; KBPageState.docType=''; renderKnowledgeList(root); };
}

function openKBDetail(id) {
  db.get('knowledgeBaseDocs', id).then(doc => {
    if (!doc) { toast('Document not found', 'error'); return; }
    const bodyHtml = `
      <div class="flex gap-8" style="margin-bottom:12px;">
        <span class="badge badge-muted">${escapeHtml(doc.docType)}</span>
        ${doc.employee ? `<span class="badge cat-badge" style="--cat-color:#4F46E5"><span class="cat-dot"></span>${escapeHtml(doc.employee)}</span>` : ''}
      </div>
      ${doc.headers && doc.headers.length ? `<p class="muted" style="font-size:12px; margin-bottom:10px;">Columns: ${doc.headers.map(escapeHtml).join(', ')}</p>` : ''}
      <div style="max-height:420px; overflow:auto;">
        ${(doc.previewRows || []).map(pr => `
          <div class="doc-preview-row">
            ${Object.entries(pr.data).map(([k, v]) => `<div><span class="k">${escapeHtml(k)}:</span> ${fmtValue(v)}</div>`).join('')}
          </div>`).join('')}
        ${!doc.previewRows || !doc.previewRows.length ? '<p class="muted">No preview rows captured for this sheet.</p>' : ''}
      </div>
      ${doc.truncated ? `<p class="muted" style="font-size:11.5px; margin-top:10px;">Showing first ${doc.previewRows.length} of ${doc.rowCount} rows.</p>` : ''}
      <div class="source-trace"><b>Source:</b> ${escapeHtml(doc.source?.sourceFile || 'N/A')} → ${escapeHtml(doc.source?.sourceSheet || '')}</div>
    `;
    openModal({ title: doc.title, bodyHtml, size: 'lg' });
  });
}
