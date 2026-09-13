PAGE_RENDERERS.referencing = async function (root, params) {
  if (params && params.sub) {
    await renderReferencingList(root);
    openReferenceDetail(params.sub, () => renderReferencingList(root));
    return;
  }
  await renderReferencingList(root);
};

async function renderReferencingList(root) {
  const [docs, decisions] = await Promise.all([db.getAll('referenceDocs'), db.getAll('referenceDecisions')]);
  const active = docs.filter(d => !d.deletedAt);

  root.innerHTML = `
    <div class="section-head">
      <div><h2>Referencing</h2><div class="section-sub">Research sources, category mapping documents, and the decision log tying references to product choices</div></div>
      <button class="btn btn-primary btn-sm" id="ref-add-decision">+ Log a decision</button>
    </div>

    <div class="tabs" id="ref-tabs">
      <button class="tab-btn active" data-tab="docs">Source Documents (${active.length})</button>
      <button class="tab-btn" data-tab="decisions">Decision Log (${decisions.length})</button>
    </div>
    <div id="ref-tab-content"></div>
  `;

  const content = document.getElementById('ref-tab-content');
  const renderDocs = () => {
    if (!active.length) { content.innerHTML = emptyState({ icon: '☍', title: 'No reference documents', message: 'Reference / SOP / lookup sheets from the source workbook will appear here.' }); return; }
    content.innerHTML = `
      <div class="record-cards">
        ${active.map(d => `
          <div class="record-card" data-id="${d.id}" style="border-left-color:${CATEGORY_COLORS[d.category] || '#0ea5e9'}">
            <div class="rc-title">${escapeHtml(d.title)}</div>
            <div class="rc-sub">${escapeHtml(d.docType || 'reference')}</div>
            <div class="rc-row"><span>Rows captured</span><span>${d.rowCount != null ? d.rowCount : (d.tabs ? d.tabs.length + ' tabs' : 'N/A')}</span></div>
            <div class="rc-foot">${categoryBadge(d.category)}<button class="btn btn-secondary btn-sm">Open →</button></div>
          </div>`).join('')}
      </div>`;
    content.querySelectorAll('[data-id]').forEach(card => card.onclick = () => openReferenceDetail(card.getAttribute('data-id'), renderReferencingList.bind(null, root)));
  };
  const renderDecisions = () => {
    if (!decisions.length) {
      content.innerHTML = emptyState({ icon: '📝', title: 'No decisions logged yet', message: 'Capture what each reference contributed to the final product — feature adopted, reason, and status.', actionLabel: 'Log a decision', actionId: 'ref-empty-add' });
      const btn = document.getElementById('ref-empty-add');
      if (btn) btn.onclick = () => openDecisionForm(null, () => renderReferencingList(root));
      return;
    }
    content.innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Reference</th><th>Feature</th><th>Decision</th><th>Reason</th><th>Status</th><th style="width:70px;"></th></tr></thead>
          <tbody>
            ${decisions.map(d => `
              <tr data-id="${d.id}">
                <td style="font-weight:600;">${escapeHtml(d.reference)}</td>
                <td>${escapeHtml(d.feature)}</td>
                <td>${escapeHtml(d.decision)}</td>
                <td class="muted">${escapeHtml(d.reason || '—')}</td>
                <td>${statusBadge(d.status)}</td>
                <td class="row-actions">
                  <button class="icon-btn" data-edit="${d.id}">✎</button>
                  <button class="icon-btn" data-del="${d.id}">🗑</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    content.querySelectorAll('[data-edit]').forEach(btn => btn.onclick = () => openDecisionForm(btn.getAttribute('data-edit'), () => renderReferencingList(root)));
    content.querySelectorAll('[data-del]').forEach(btn => btn.onclick = async () => {
      const ok = await confirmDialog({ title: 'Delete decision log entry', danger: true, confirmLabel: 'Delete', message: 'This entry will be permanently removed.' });
      if (!ok) return;
      await db.delete('referenceDecisions', btn.getAttribute('data-del'));
      toast('Entry deleted', 'success');
      renderReferencingList(root);
    });
  };
  renderDocs();

  document.querySelectorAll('#ref-tabs .tab-btn').forEach(btn => btn.onclick = () => {
    document.querySelectorAll('#ref-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    btn.getAttribute('data-tab') === 'docs' ? renderDocs() : renderDecisions();
  });
  document.getElementById('ref-add-decision').onclick = () => openDecisionForm(null, () => renderReferencingList(root));
}

function openReferenceDetail(id, onChange) {
  db.get('referenceDocs', id).then(doc => {
    if (!doc) { toast('Reference not found', 'error'); return; }
    let bodyHtml = '';
    if (doc.tabs) {
      bodyHtml = doc.tabs.map(t => `
        <div class="panel" style="margin-bottom:10px;">
          <div class="panel-title">${escapeHtml(t.tabName)}</div>
          <pre style="white-space:pre-wrap; font-size:12px; color:var(--ink-700); font-family:inherit; margin:0;">${escapeHtml(t.content)}</pre>
        </div>`).join('');
    } else {
      bodyHtml = `
        <div class="flex gap-8" style="margin-bottom:12px;">${categoryBadge(doc.category)}<span class="badge badge-muted">${escapeHtml(doc.docType)}</span></div>
        ${doc.headers && doc.headers.length ? `<p class="muted" style="font-size:12px; margin-bottom:10px;">Columns: ${doc.headers.map(escapeHtml).join(', ')}</p>` : ''}
        <div style="max-height:400px; overflow:auto;">
          ${(doc.previewRows || []).map(pr => `
            <div class="doc-preview-row">
              ${Object.entries(pr.data).map(([k, v]) => `<div><span class="k">${escapeHtml(k)}:</span> ${fmtValue(v)}</div>`).join('')}
            </div>`).join('')}
        </div>
        ${doc.truncated ? `<p class="muted" style="font-size:11.5px; margin-top:10px;">Showing first ${doc.previewRows.length} of ${doc.rowCount} rows — full data preserved in source workbook (${escapeHtml(doc.source?.sourceSheet || '')}).</p>` : ''}
        <div class="source-trace"><b>Source:</b> ${escapeHtml(doc.source?.sourceFile || 'N/A')} ${doc.source?.sourceSheet ? '→ ' + escapeHtml(doc.source.sourceSheet) : ''}</div>
      `;
    }
    openModal({ title: doc.title, bodyHtml, size: 'lg' });
  });
}

function openDecisionForm(id, onChange) {
  const load = id ? db.get('referenceDecisions', id) : Promise.resolve(null);
  load.then(existing => {
    const bodyHtml = `
      <div class="form-grid">
        <div class="form-field"><label>Reference</label><input type="text" id="d-ref" value="${escapeHtml(existing?.reference || '')}" placeholder="e.g. Enterprise Dashboard"></div>
        <div class="form-field"><label>Feature</label><input type="text" id="d-feat" value="${escapeHtml(existing?.feature || '')}" placeholder="e.g. Global Filters"></div>
        <div class="form-field"><label>Decision</label>
          <select id="d-decision">
            ${['Adopt','Adapt','Reject','Under review'].map(o => `<option ${existing?.decision===o?'selected':''}>${o}</option>`).join('')}
          </select>
        </div>
        <div class="form-field"><label>Status</label>
          <select id="d-status">${['Implemented','In progress','Planned','Rejected'].map(o => `<option ${existing?.status===o?'selected':''}>${o}</option>`).join('')}</select>
        </div>
        <div class="form-field full"><label>Reason</label><textarea id="d-reason" rows="3">${escapeHtml(existing?.reason || '')}</textarea></div>
      </div>`;
    const footerHtml = `<button class="btn btn-ghost" id="d-cancel">Cancel</button><button class="btn btn-primary" id="d-save">${existing ? 'Save changes' : 'Add to log'}</button>`;
    const overlay = openModal({ title: existing ? 'Edit decision' : 'Log a reference decision', bodyHtml, footerHtml, size: 'md' });
    overlay.querySelector('#d-cancel').onclick = closeModal;
    overlay.querySelector('#d-save').onclick = async () => {
      const reference = overlay.querySelector('#d-ref').value.trim();
      const feature = overlay.querySelector('#d-feat').value.trim();
      if (!reference || !feature) { toast('Reference and Feature are required', 'error'); return; }
      const entry = {
        id: existing?.id || 'dec_' + Date.now().toString(36),
        reference, feature,
        decision: overlay.querySelector('#d-decision').value,
        status: overlay.querySelector('#d-status').value,
        reason: overlay.querySelector('#d-reason').value.trim(),
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await db.put('referenceDecisions', entry);
      await db.logActivity(existing ? 'update' : 'create', 'referenceDecisions', entry.id, existing, entry);
      toast(existing ? 'Decision updated' : 'Decision logged', 'success');
      closeModal();
      if (onChange) onChange();
    };
  });
}
