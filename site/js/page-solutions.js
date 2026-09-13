const SolutionPageState = {
  view: 'sheets', search: '', category: '', productLine: '', sortField: 'productName', sortDir: 'asc',
  page: 1, pageSize: 20, selected: new Set(),
};

PAGE_RENDERERS.solutions = async function (root, params) {
  if (params && params.sub) {
    await renderSolutionList(root);
    openRecordDetail('solutionMatrix', params.sub, () => renderSolutionList(root));
    return;
  }
  await renderSolutionList(root);
};

async function renderSolutionList(root) {
  const all = await db.getAll('solutionMatrix');
  const active = all.filter(r => !r.deletedAt);
  const categories = [...new Set(active.map(r => r.category))].sort();
  const productLines = [...new Set(active.filter(r => !SolutionPageState.category || r.category === SolutionPageState.category).map(r => r.productLine))].sort();

  let filtered = active.filter(r => {
    if (SolutionPageState.category && r.category !== SolutionPageState.category) return false;
    if (SolutionPageState.productLine && r.productLine !== SolutionPageState.productLine) return false;
    if (SolutionPageState.search) {
      const hay = JSON.stringify(r.rawRecord).toLowerCase();
      if (!hay.includes(SolutionPageState.search.toLowerCase())) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    const av = a.normalized[SolutionPageState.sortField] ?? '';
    const bv = b.normalized[SolutionPageState.sortField] ?? '';
    const cmp = String(av).localeCompare(String(bv));
    return SolutionPageState.sortDir === 'asc' ? cmp : -cmp;
  });

  const { pageItems, total, totalPages, page } = paginate(filtered, SolutionPageState.page, SolutionPageState.pageSize);
  SolutionPageState.page = page;

  root.innerHTML = `
    <div class="section-head">
      <div><h2>Solution Matrix</h2><div class="section-sub">${active.length} solution / technical comparison records — requirement → solution → vendor → recommendation</div></div>
      <div class="flex gap-8">
        <button class="btn btn-ghost btn-sm" id="sm-import">Import</button>
        <button class="btn btn-ghost btn-sm" id="sm-export">Export</button>
      </div>
    </div>

    <div class="filter-bar">
      <input type="text" id="sm-search" placeholder="Search solution, brand, spec, use case…" value="${escapeHtml(SolutionPageState.search)}" style="min-width:240px;">
      <select id="sm-category"><option value="">All categories</option>${categories.map(c => `<option value="${escapeHtml(c)}" ${SolutionPageState.category===c?'selected':''}>${escapeHtml(c)}</option>`).join('')}</select>
      <select id="sm-productline"><option value="">All requirement types</option>${productLines.map(p => `<option value="${escapeHtml(p)}" ${SolutionPageState.productLine===p?'selected':''}>${escapeHtml(p)}</option>`).join('')}</select>
      <div class="view-toggle">
        <button data-view="sheets" class="${SolutionPageState.view==='sheets'?'active':''}">Sheets</button>
        <button data-view="cards" class="${SolutionPageState.view==='cards'?'active':''}">Cards</button>
        <button data-view="table" class="${SolutionPageState.view==='table'?'active':''}">Table</button>
        <button data-view="compare" class="${SolutionPageState.view==='compare'?'active':''}">Compare</button>
      </div>
      ${(SolutionPageState.category || SolutionPageState.productLine || SolutionPageState.search) ? `<button class="btn btn-ghost btn-sm" id="sm-clear">Clear filters</button>` : ''}
    </div>

    <div id="sm-list-container"></div>
  `;

  const listContainer = document.getElementById('sm-list-container');
  if (!filtered.length) {
    listContainer.innerHTML = emptyState({ icon: '⚙', title: 'No solution records found', message: 'Try clearing filters, or import more solution comparison data.' });
  } else if (SolutionPageState.view === 'sheets') {
    renderSheetDirectory(listContainer, filtered, (productLine) => {
      const rec = filtered.find(r => r.productLine === productLine);
      openSheetView(productLine, rec ? rec.category : SolutionPageState.category);
    });
  } else if (SolutionPageState.view === 'table') {
    renderSolutionTable(listContainer, pageItems, page, totalPages, total, root);
  } else if (SolutionPageState.view === 'compare') {
    renderSolutionCompare(listContainer, filtered, root);
  } else {
    renderSolutionCards(listContainer, pageItems, page, totalPages, total, root);
  }

  document.getElementById('sm-search').oninput = debounce((e) => { SolutionPageState.search = e.target.value; SolutionPageState.page = 1; renderSolutionList(root); }, 250);
  document.getElementById('sm-category').onchange = (e) => { SolutionPageState.category = e.target.value; SolutionPageState.productLine = ''; SolutionPageState.page = 1; renderSolutionList(root); };
  document.getElementById('sm-productline').onchange = (e) => { SolutionPageState.productLine = e.target.value; SolutionPageState.page = 1; renderSolutionList(root); };
  document.querySelectorAll('[data-view]').forEach(btn => btn.onclick = () => { SolutionPageState.view = btn.getAttribute('data-view'); renderSolutionList(root); });
  const clearBtn = document.getElementById('sm-clear');
  if (clearBtn) clearBtn.onclick = () => { SolutionPageState.search = ''; SolutionPageState.category = ''; SolutionPageState.productLine = ''; renderSolutionList(root); };
  document.getElementById('sm-import').onclick = () => openImportDialog('solutionMatrix', () => renderSolutionList(root));
  document.getElementById('sm-export').onclick = () => exportRecords(filtered, 'solution-matrix');
}

function renderSolutionCards(container, items, page, totalPages, total, root) {
  container.innerHTML = `
    <div class="record-cards">
      ${items.map(r => `
        <div class="record-card" data-id="${r.id}" style="border-left-color:${CATEGORY_COLORS[r.category] || '#8B5CF6'}">
          <div class="rc-title">${escapeHtml(r.normalized.productName || firstRawValue(r) || 'Unnamed solution')}</div>
          <div class="rc-sub">${escapeHtml(r.productLine)}${r.normalized.brand ? ' · ' + escapeHtml(String(r.normalized.brand)) : ''}</div>
          <div class="rc-row"><span>Use case</span><span style="text-align:right; max-width:60%;">${fmtValue(r.customFields['Primary Use Case'] || r.normalized.notes)}</span></div>
          <div class="rc-row"><span>Score</span><span>${fmtValue(r.normalized.rating)}</span></div>
          <div class="rc-row"><span>Pros</span><span style="text-align:right; max-width:60%;">${fmtValue(r.normalized.pros)}</span></div>
          <div class="rc-foot">${categoryBadge(r.category)}
            <span class="row-actions">
              <button class="icon-btn" data-action="edit" data-id="${r.id}" title="Edit">✎</button>
              <button class="icon-btn" data-action="delete" data-id="${r.id}" title="Delete">🗑</button>
            </span>
          </div>
        </div>`).join('')}
    </div>
    <div class="table-wrap" style="border:none; margin-top:8px;">${paginationControlsHtml(page, totalPages, total, 'sm')}</div>`;
  bindSolutionRowActions(container, root);
}

function renderSolutionTable(container, items, page, totalPages, total, root) {
  container.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>
          <th data-sort="productName">Solution <span class="sort-arrow">${SolutionPageState.sortField==='productName' ? (SolutionPageState.sortDir==='asc'?'▲':'▼') : '↕'}</span></th>
          <th>Requirement / Line</th><th>Brand</th><th>Model</th><th>Score</th><th>Category</th><th style="width:90px;">Actions</th>
        </tr></thead>
        <tbody>
          ${items.map(r => `
            <tr data-id="${r.id}">
              <td style="font-weight:600;">${escapeHtml(r.normalized.productName || firstRawValue(r) || 'N/A')}</td>
              <td>${escapeHtml(r.productLine)}</td>
              <td>${fmtValue(r.normalized.brand)}</td>
              <td>${fmtValue(r.normalized.model)}</td>
              <td>${fmtValue(r.normalized.rating)}</td>
              <td>${categoryBadge(r.category)}</td>
              <td class="row-actions">
                <button class="icon-btn" data-action="edit" data-id="${r.id}" title="Edit">✎</button>
                <button class="icon-btn" data-action="delete" data-id="${r.id}" title="Delete">🗑</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      ${paginationControlsHtml(page, totalPages, total, 'sm')}
    </div>`;
  bindSolutionRowActions(container, root);
  container.querySelectorAll('th[data-sort]').forEach(th => th.onclick = () => {
    const field = th.getAttribute('data-sort');
    if (SolutionPageState.sortField === field) SolutionPageState.sortDir = SolutionPageState.sortDir === 'asc' ? 'desc' : 'asc';
    else { SolutionPageState.sortField = field; SolutionPageState.sortDir = 'asc'; }
    renderSolutionList(root);
  });
}

function renderSolutionCompare(container, filtered, root) {
  // Compare works within a single product line (apples to apples)
  const lines = [...new Set(filtered.map(r => r.productLine))];
  const activeLine = SolutionPageState.productLine || lines[0];
  const candidates = filtered.filter(r => r.productLine === activeLine).slice(0, 5);
  if (!candidates.length) { container.innerHTML = emptyState({ icon: '⚖', title: 'Pick a requirement type to compare', message: 'Use the filter above to narrow to one product line first.' }); return; }

  const allKeys = new Set();
  candidates.forEach(c => Object.keys(c.normalized).forEach(k => allKeys.add(k)));
  const keys = [...allKeys].filter(k => k !== 'productName');

  const scored = candidates.filter(c => c.normalized.rating != null && !isNaN(parseFloat(c.normalized.rating)));
  const best = scored.length ? scored.reduce((a, b) => parseFloat(a.normalized.rating) >= parseFloat(b.normalized.rating) ? a : b) : null;

  container.innerHTML = `
    <div class="panel" style="margin-bottom:14px;">
      <div class="panel-title">Comparing: ${escapeHtml(activeLine)}</div>
      <p class="muted" style="font-size:12.5px;">${candidates.length} candidate solution(s) shown side by side. ${best ? `Highest scored: <b>${escapeHtml(best.normalized.productName || firstRawValue(best) || 'N/A')}</b> (${escapeHtml(String(best.normalized.rating))}).` : 'No admin score captured for these candidates — recommendation shown as N/A rather than guessed.'}</p>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Field</th>${candidates.map(c => `<th>${escapeHtml(c.normalized.productName || firstRawValue(c) || 'N/A')}${best && c.id===best.id ? ' 🏆' : ''}</th>`).join('')}</tr></thead>
        <tbody>
          ${keys.map(k => `<tr><td style="font-weight:600;">${escapeHtml(prettyLabel(k))}</td>${candidates.map(c => `<td>${fmtValue(c.normalized[k])}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function bindSolutionRowActions(container, root) {
  container.querySelectorAll('[data-id]').forEach(el => {
    if (el.tagName === 'TR' || el.classList.contains('record-card')) {
      el.onclick = (e) => {
        if (e.target.closest('button')) return;
        const id = el.getAttribute('data-id');
        db.get('solutionMatrix', id).then(rec => { if (rec) openSheetView(rec.productLine, rec.category); });
      };
    }
  });
  container.querySelectorAll('[data-action="edit"]').forEach(el => el.onclick = (e) => { e.stopPropagation(); openRecordEditForm('solutionMatrix', el.getAttribute('data-id'), () => renderSolutionList(root)); });
  container.querySelectorAll('[data-action="delete"]').forEach(el => el.onclick = async (e) => {
    e.stopPropagation();
    const ok = await confirmDialog({ title: 'Delete record', danger: true, confirmLabel: 'Move to Trash', message: 'This record will be moved to Trash and can be restored later.' });
    if (!ok) return;
    await db.softDelete('solutionMatrix', el.getAttribute('data-id'));
    toast('Record moved to Trash', 'success');
    SEARCH_INDEX = null;
    renderSolutionList(root);
  });
}
