PAGE_RENDERERS.trash = async function (root) {
  const trash = (await db.getAll('trash')).sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
  root.innerHTML = `
    <div class="section-head">
      <div><h2>Trash</h2><div class="section-sub">${trash.length} deleted record(s) — restore or permanently remove</div></div>
    </div>
    <div class="panel" id="trash-panel"></div>
  `;
  const panel = document.getElementById('trash-panel');
  if (!trash.length) {
    panel.innerHTML = emptyState({ icon: '🗑', title: 'Trash is empty', message: 'Deleted vendor and solution records will appear here for recovery.' });
    return;
  }
  const storeLabel = { vendorMatrix: 'Vendor Record', solutionMatrix: 'Solution Record' };
  panel.innerHTML = trash.map(t => `
    <div class="trash-row" data-id="${t.id}">
      <div>
        <b>${escapeHtml(t.snapshot?.normalized?.vendorName || t.snapshot?.normalized?.productName || t.snapshot?.productLine || 'Unnamed record')}</b>
        <span class="muted"> — ${escapeHtml(storeLabel[t.store] || t.store)} · deleted ${timeAgo(t.deletedAt)} by ${escapeHtml(t.deletedBy || 'unknown')}</span>
      </div>
      <div class="flex gap-8">
        <button class="btn btn-secondary btn-sm" data-restore="${t.recordId}" data-store="${t.store}">Restore</button>
        <button class="btn btn-danger btn-sm" data-purge="${t.recordId}" data-store="${t.store}">Delete permanently</button>
      </div>
    </div>`).join('');

  panel.querySelectorAll('[data-restore]').forEach(btn => btn.onclick = async () => {
    await db.restore(btn.getAttribute('data-store'), btn.getAttribute('data-restore'));
    toast('Record restored', 'success');
    SEARCH_INDEX = null;
    PAGE_RENDERERS.trash(root);
  });
  panel.querySelectorAll('[data-purge]').forEach(btn => btn.onclick = async () => {
    const ok = await confirmDialog({ title: 'Permanently delete', danger: true, confirmLabel: 'Delete forever', message: 'This cannot be undone. The record will be permanently removed.' });
    if (!ok) return;
    await db.permanentDelete(btn.getAttribute('data-store'), btn.getAttribute('data-purge'));
    toast('Record permanently deleted', 'success');
    PAGE_RENDERERS.trash(root);
  });
};
