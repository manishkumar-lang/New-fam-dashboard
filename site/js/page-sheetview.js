/**
 * Sheet View — the "open the actual sheet" experience.
 * Groups every record that came from the same source sheet (productLine)
 * back together into one table, exactly as it looked in the original
 * workbook, plus the real Google Sheets link where the source docx
 * confirmed (or at least narrowed down) one.
 */
async function openSheetView(productLine, category) {
  const [vendorRecords, solutionRecords] = await Promise.all([db.getAll('vendorMatrix'), db.getAll('solutionMatrix')]);
  const rows = [...vendorRecords, ...solutionRecords].filter(r => !r.deletedAt && r.productLine === productLine);
  if (!rows.length) { toast('No rows found for this sheet', 'error'); return; }

  const link = rows[0].sheetLink || null;
  const recordType = rows[0].recordType;
  const isCarriedForward = rows.some(r => r.carriedForwardFromPreviousExport);

  // Union of original headers, in first-seen order, exactly as the source columns were.
  const headers = [];
  const seen = new Set();
  rows.forEach(r => Object.keys(r.rawRecord || {}).forEach(h => { if (!seen.has(h)) { seen.add(h); headers.push(h); } }));

  const linkBannerHtml = link ? `
    <div class="source-trace" style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:0; margin-bottom:14px;">
      <div>
        ${link.confirmed
          ? '<b>✓ Confirmed source link</b> — this opens the exact tab for this sheet.'
          : '<b>Category workbook link</b> — the Vendor Matrix Link document confirms this category\'s Google Sheet, but not which exact tab is this one.'}
      </div>
      <a href="${escapeHtml(link.url)}" target="_blank" rel="noopener" class="btn btn-primary btn-sm" style="white-space:nowrap;">Open in Google Sheets ↗</a>
    </div>` : `
    <div class="source-trace" style="margin-top:0; margin-bottom:14px;">
      <span class="na">No source link available</span> — this sheet/category wasn't enumerated in the Vendor Matrix Link document.
    </div>`;

  const bodyHtml = `
    <div class="flex gap-8" style="margin-bottom:12px; flex-wrap:wrap;">
      ${categoryBadge(category)}
      <span class="badge badge-muted">${rows.length} row${rows.length === 1 ? '' : 's'}</span>
      <span class="badge badge-muted">${recordType === 'vendor_matrix' ? 'Vendor Matrix sheet' : 'Solution Matrix sheet'}</span>
      ${isCarriedForward ? '<span class="badge badge-amber">From previous export</span>' : ''}
    </div>
    ${isCarriedForward ? `<div class="source-trace" style="margin-top:0; margin-bottom:14px; background:var(--amber-100);"><b>Note:</b> this sheet was not present in the latest Vendor Matrix export — it's preserved here from the earlier export so the research isn't lost. Re-import a fresh copy from Admin → Integrations or a new file upload if this sheet has since been updated.</div>` : ''}
    ${linkBannerHtml}
    <div class="table-wrap" style="border:none; max-height:56vh; overflow:auto;">
      <table class="data-table">
        <thead><tr>
          ${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}
          <th style="width:70px;">Row actions</th>
        </tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr data-record-id="${r.id}" data-store="${recordType === 'vendor_matrix' ? 'vendorMatrix' : 'solutionMatrix'}">
              ${headers.map(h => `<td>${fmtValue(r.rawRecord[h])}</td>`).join('')}
              <td class="row-actions">
                <button class="icon-btn" data-sheetrow-edit title="Edit this row">✎</button>
                <button class="icon-btn" data-sheetrow-delete title="Delete this row">🗑</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <p class="muted" style="font-size:11.5px; margin-top:10px;">
      This is the sheet as it exists in the source workbook — every column and row shown above, untouched.
      Use the row actions to edit or delete an individual entry; use the link above to open the live Google Sheet.
    </p>
  `;

  const overlay = openModal({ title: productLine, bodyHtml, size: 'xl' });
  overlay.querySelectorAll('[data-sheetrow-edit]').forEach(btn => btn.onclick = () => {
    const tr = btn.closest('tr');
    closeModal();
    openRecordEditForm(tr.getAttribute('data-store'), tr.getAttribute('data-record-id'), () => {});
  });
  overlay.querySelectorAll('[data-sheetrow-delete]').forEach(btn => btn.onclick = async () => {
    const tr = btn.closest('tr');
    const ok = await confirmDialog({ title: 'Delete row', danger: true, confirmLabel: 'Move to Trash', message: 'This row will be moved to Trash and can be restored later.' });
    if (!ok) return;
    await db.softDelete(tr.getAttribute('data-store'), tr.getAttribute('data-record-id'));
    toast('Row moved to Trash', 'success');
    SEARCH_INDEX = null;
    tr.remove();
  });
}

/** ---------------- "Sheets" directory view: one card per topic/sheet ---------------- */
function buildSheetDirectory(records) {
  const map = new Map();
  records.forEach(r => {
    if (!map.has(r.productLine)) {
      map.set(r.productLine, { productLine: r.productLine, category: r.category, count: 0, link: r.sheetLink || null, carriedForward: false });
    }
    const entry = map.get(r.productLine);
    entry.count++;
    if (r.carriedForwardFromPreviousExport) entry.carriedForward = true;
  });
  return [...map.values()].sort((a, b) => a.productLine.localeCompare(b.productLine));
}

function renderSheetDirectory(container, records, onOpen) {
  const sheets = buildSheetDirectory(records);
  if (!sheets.length) {
    container.innerHTML = emptyState({ icon: '📄', title: 'No sheets found', message: 'Try clearing filters.' });
    return;
  }
  container.innerHTML = `
    <div class="record-cards">
      ${sheets.map(s => `
        <div class="record-card" data-sheet="${escapeHtml(s.productLine)}" style="border-left-color:${CATEGORY_COLORS[s.category] || '#6366f1'}">
          <div class="rc-title">${escapeHtml(s.productLine)}</div>
          <div class="rc-sub">${s.count} row${s.count === 1 ? '' : 's'} in this sheet${s.carriedForward ? ' · from previous export' : ''}</div>
          <div class="rc-row"><span>Source link</span><span>${s.link ? (s.link.confirmed ? '✓ Confirmed' : 'Category link') : '<span class="na">None</span>'}</span></div>
          <div class="rc-foot">${categoryBadge(s.category)}<button class="btn btn-secondary btn-sm">Open sheet →</button></div>
        </div>`).join('')}
    </div>`;
  container.querySelectorAll('[data-sheet]').forEach(card => card.onclick = () => onOpen(card.getAttribute('data-sheet')));
}
