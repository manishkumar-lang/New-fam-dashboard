PAGE_RENDERERS.admin = async function (root) {
  root.innerHTML = `
    <div class="section-head">
      <div><h2>Admin</h2><div class="section-sub">Configure dashboard content, manage data, and review activity — changes apply immediately, no code required</div></div>
    </div>
    <div class="tabs" id="admin-tabs">
      <button class="tab-btn active" data-tab="studio">Admin Studio</button>
      <button class="tab-btn" data-tab="content">Dashboard Content</button>
      <button class="tab-btn" data-tab="data">Data Management</button>
      <button class="tab-btn" data-tab="integrations">Integrations</button>
      <button class="tab-btn" data-tab="scoring">Scoring Weights</button>
      <button class="tab-btn" data-tab="audit">Audit Log</button>
      <button class="tab-btn" data-tab="about">Users &amp; Roles</button>
    </div>
    <div id="admin-tab-content"></div>
  `;
  const content = document.getElementById('admin-tab-content');
  const tabs = { studio: renderStudioTab, content: renderContentTab, data: renderDataTab, integrations: renderIntegrationsTab, scoring: renderScoringTab, audit: renderAuditTab, about: renderAboutTab };
  const show = (tab) => tabs[tab](content, root);
  show('studio');
  document.querySelectorAll('#admin-tabs .tab-btn').forEach(btn => btn.onclick = () => {
    document.querySelectorAll('#admin-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    show(btn.getAttribute('data-tab'));
  });
};

async function renderStudioTab(content) {
  const settings = await db.get('settings', 'dashboardContent') || { id: 'dashboardContent', announcement: '' };
  content.innerHTML = `
    <div class="admin-studio-grid">
      <div class="panel admin-hero-panel">
        <div class="panel-title"><span>Admin Studio</span><span class="admin-status-pill">Live workspace</span></div>
        <p class="muted" style="font-size:12.5px;line-height:1.65;">Manage the dashboard like a website CMS: create records, update homepage messaging, manage taxonomy, and jump directly to every editing workflow.</p>
        <div class="admin-action-grid" style="margin-top:16px;">
          <button class="admin-action-card" id="studio-add-vendor"><span class="admin-action-icon">＋</span><span><b>Add vendor</b><small>Create a new Vendor Matrix record</small></span></button>
          <button class="admin-action-card" id="studio-add-category"><span class="admin-action-icon">▦</span><span><b>Add category</b><small>Create and color a procurement category</small></span></button>
          <button class="admin-action-card" id="studio-add-decision"><span class="admin-action-icon">✦</span><span><b>Log decision</b><small>Add a sourcing decision or note</small></span></button>
          <button class="admin-action-card" id="studio-import-vendor"><span class="admin-action-icon">⇧</span><span><b>Import vendors</b><small>CSV/XLSX bulk import</small></span></button>
          <button class="admin-action-card" id="studio-import-solution"><span class="admin-action-icon">◈</span><span><b>Import solutions</b><small>Load comparison data</small></span></button>
          <button class="admin-action-card" id="studio-open-overview"><span class="admin-action-icon">⌂</span><span><b>Preview homepage</b><small>See live dashboard changes</small></span></button>
        </div>
      </div>
      <div class="panel">
        <div class="panel-title">Homepage announcement</div>
        <p class="muted" style="font-size:12px;margin-bottom:10px;">Publish a short banner message on Overview. Leave empty to hide it.</p>
        <textarea id="studio-announcement" rows="5" placeholder="Example: Q4 procurement review is now open…">${escapeHtml(settings.announcement || '')}</textarea>
        <button class="btn btn-primary btn-sm" id="studio-save-announcement" style="margin-top:10px;">Publish announcement</button>
      </div>
    </div>
    <div class="panel" style="margin-top:16px;">
      <div class="panel-title">Editing guide</div>
      <div class="detail-grid admin-guide-grid">
        <div class="detail-field"><label>Record fields</label><div class="value">Open any vendor, solution, sheet, or knowledge record and use Edit fields.</div></div>
        <div class="detail-field"><label>Categories</label><div class="value">Rename, recolor, create, and review confirmed vs inferred mappings.</div></div>
        <div class="detail-field"><label>Homepage</label><div class="value">Dashboard Content controls titles, KPI labels, and chart visibility.</div></div>
        <div class="detail-field"><label>Safety</label><div class="value">All changes are saved locally and recorded in the audit log.</div></div>
      </div>
    </div>`;
  document.getElementById('studio-add-vendor').onclick = () => openVendorAddForm(() => {});
  document.getElementById('studio-add-category').onclick = () => openCategoryAddForm(() => {});
  document.getElementById('studio-add-decision').onclick = () => openDecisionForm(null, () => {});
  document.getElementById('studio-import-vendor').onclick = () => openImportDialog('vendorMatrix', () => toast('Vendor import complete', 'success'));
  document.getElementById('studio-import-solution').onclick = () => openImportDialog('solutionMatrix', () => toast('Solution import complete', 'success'));
  document.getElementById('studio-open-overview').onclick = () => navigate('overview');
  document.getElementById('studio-save-announcement').onclick = async () => {
    const before = JSON.parse(JSON.stringify(settings));
    settings.announcement = document.getElementById('studio-announcement').value.trim();
    await db.put('settings', settings);
    await db.logActivity('update', 'settings', 'dashboardContent', before, settings);
    toast(settings.announcement ? 'Announcement published' : 'Announcement removed', 'success');
  };
}

async function renderContentTab(content) {
  let settings = await db.get('settings', 'dashboardContent');
  settings = settings || { id: 'dashboardContent', title: 'WELLVERSED FAM INTELLIGENCE', subtitle: 'Procurement • Vendor Research • Solutions • Knowledge', labels: {}, widgets: { kpis:true, categoryChart:true, productChart:true, locationChart:true, averageChart:true, provenance:true } };
  settings.labels = settings.labels || {};
  settings.widgets = { kpis:true, categoryChart:true, productChart:true, locationChart:true, averageChart:true, provenance:true, ...(settings.widgets || {}) };
  const labelFields = [
    ['kpiVendors','Distinct Vendors'], ['kpiVendorRecords','Vendor Matrix Records'], ['kpiSolutionRecords','Solution Matrix Records'],
    ['kpiCategories','Categories'], ['kpiReferences','Reference Documents'], ['kpiKnowledge','Knowledge Base Docs'], ['kpiScored','Vendor Records Scored'], ['kpiTrash','Items in Trash']
  ];
  content.innerHTML = `
    <div class="panel">
      <div class="panel-title">Dashboard content & controls</div>
      <p class="muted" style="font-size:12.5px; margin-bottom:14px;">Change visible dashboard text and turn existing widgets on/off. Changes are stored in this browser and apply when Overview is opened again.</p>
      <div class="form-grid">
        <div class="form-field"><label>Dashboard title</label><input type="text" id="ct-title" value="${escapeHtml(settings.title)}"></div>
        <div class="form-field"><label>Subtitle</label><input type="text" id="ct-subtitle" value="${escapeHtml(settings.subtitle)}"></div>
        ${labelFields.map(([key, fallback]) => `<div class="form-field"><label>${escapeHtml(fallback)} label</label><input type="text" data-label-key="${key}" value="${escapeHtml(settings.labels[key] || fallback)}"></div>`).join('')}
      </div>
      <div class="panel-title" style="margin-top:18px;">Dashboard functions / widgets</div>
      <div class="detail-grid admin-widget-grid">
        ${[['kpis','KPI cards'],['categoryChart','Vendor records by category chart'],['productChart','Top product lines chart'],['locationChart','Vendor locations chart'],['averageChart','Average grand total chart'],['provenance','Data provenance panel']].map(([key, label]) => `<label class="check-row"><input type="checkbox" data-widget-key="${key}" ${settings.widgets[key] ? 'checked' : ''}> <span>${escapeHtml(label)}</span></label>`).join('')}
      </div>
      <button class="btn btn-primary btn-sm" id="ct-save" style="margin-top:14px;">Save dashboard settings</button>
    </div>
    <div class="panel">
      <div class="panel-title">Categories</div>
      <p class="muted" style="font-size:12.5px; margin-bottom:10px;">Rename, recolor, or add categories. Full management lives on the Categories page.</p>
      <button class="btn btn-secondary btn-sm" id="ct-goto-cat">Open Categories →</button>
    </div>
  `;
  document.getElementById('ct-save').onclick = async () => {
    const before = JSON.parse(JSON.stringify(settings));
    settings.title = document.getElementById('ct-title').value.trim() || settings.title;
    settings.subtitle = document.getElementById('ct-subtitle').value.trim();
    document.querySelectorAll('[data-label-key]').forEach(input => { settings.labels[input.dataset.labelKey] = input.value.trim(); });
    document.querySelectorAll('[data-widget-key]').forEach(input => { settings.widgets[input.dataset.widgetKey] = input.checked; });
    await db.put('settings', settings);
    await db.logActivity('update', 'settings', 'dashboardContent', before, settings);
    toast('Dashboard settings saved — reopen Overview to apply', 'success');
  };
  document.getElementById('ct-goto-cat').onclick = () => navigate('categories');
}

async function renderDataTab(content) {
  const [vendorCount, solutionCount, kbCount, refCount, trashCount] = await Promise.all([
    db.count('vendorMatrix'), db.count('solutionMatrix'), db.count('knowledgeBaseDocs'), db.count('referenceDocs'), db.count('trash'),
  ]);
  content.innerHTML = `
    <div class="grid-2">
      <div class="panel">
        <div class="panel-title">Import data</div>
        <p class="muted" style="font-size:12.5px; margin-bottom:12px;">Add more vendor or solution records from CSV/XLSX. Conflicts are never overwritten silently — new rows are added as new records.</p>
        <div class="flex gap-8">
          <button class="btn btn-secondary btn-sm" id="dt-import-vendor">Import → Vendor Matrix</button>
          <button class="btn btn-secondary btn-sm" id="dt-import-solution">Import → Solution Matrix</button>
        </div>
      </div>
      <div class="panel">
        <div class="panel-title">Export data</div>
        <p class="muted" style="font-size:12.5px; margin-bottom:12px;">Download the full current dataset, including any admin edits, as JSON or CSV.</p>
        <div class="flex gap-8">
          <button class="btn btn-secondary btn-sm" id="dt-export-json">Full backup (JSON)</button>
          <button class="btn btn-secondary btn-sm" id="dt-export-vendor-csv">Vendor Matrix (CSV)</button>
          <button class="btn btn-secondary btn-sm" id="dt-export-solution-csv">Solution Matrix (CSV)</button>
        </div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-title">Restore from backup</div>
      <p class="muted" style="font-size:12.5px; margin-bottom:12px;">Upload a JSON backup produced by "Full backup" above. This merges records by ID — existing records with the same ID are overwritten, everything else is left as is.</p>
      <input type="file" id="dt-restore-file" accept=".json">
    </div>
    <div class="panel">
      <div class="panel-title">Current record counts</div>
      <div class="detail-grid">
        <div class="detail-field"><label>Vendor Matrix</label><div class="value">${vendorCount}</div></div>
        <div class="detail-field"><label>Solution Matrix</label><div class="value">${solutionCount}</div></div>
        <div class="detail-field"><label>Knowledge Base</label><div class="value">${kbCount}</div></div>
        <div class="detail-field"><label>Reference Docs</label><div class="value">${refCount}</div></div>
        <div class="detail-field"><label>In Trash</label><div class="value">${trashCount}</div></div>
      </div>
    </div>
  `;
  document.getElementById('dt-import-vendor').onclick = () => openImportDialog('vendorMatrix', () => toast('Import complete', 'success'));
  document.getElementById('dt-import-solution').onclick = () => openImportDialog('solutionMatrix', () => toast('Import complete', 'success'));
  document.getElementById('dt-export-json').onclick = async () => {
    const dump = {};
    for (const store of ['vendorMatrix','solutionMatrix','vendors','referenceDocs','referenceDecisions','knowledgeBaseDocs','employees','categories','auditLog']) {
      dump[store] = await db.getAll(store);
    }
    downloadFile(`wellversed-backup-${Date.now()}.json`, JSON.stringify(dump, null, 2), 'application/json');
    toast('Backup downloaded', 'success');
  };
  document.getElementById('dt-export-vendor-csv').onclick = async () => exportRecords((await db.getAll('vendorMatrix')).filter(r=>!r.deletedAt), 'vendor-matrix-full');
  document.getElementById('dt-export-solution-csv').onclick = async () => exportRecords((await db.getAll('solutionMatrix')).filter(r=>!r.deletedAt), 'solution-matrix-full');
  document.getElementById('dt-restore-file').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const dump = JSON.parse(text);
      let total = 0;
      for (const [store, arr] of Object.entries(dump)) {
        if (Array.isArray(arr)) { await db.bulkPut(store, arr); total += arr.length; }
      }
      await db.logActivity('import', 'system', 'restore', null, { totalRecords: total });
      toast(`Restored ${total} records from backup`, 'success');
      SEARCH_INDEX = null;
    } catch (err) {
      toast('Restore failed — invalid backup file', 'error');
    }
  };
}

async function renderScoringTab(content) {
  let cfg = await db.get('scoringConfig', 'default');
  cfg = cfg || { id: 'default', weights: { price: 20, quality: 20, technical: 20, delivery: 15, warranty: 10, experience: 10, location: 5 } };
  const total = Object.values(cfg.weights).reduce((a, b) => a + b, 0);
  content.innerHTML = `
    <div class="panel">
      <div class="panel-title">Vendor scoring weights</div>
      <p class="muted" style="font-size:12.5px; margin-bottom:14px;">
        These weights define how a composite vendor score would be computed from parameter scores (Weighted Score = Σ parameter score × weight).
        Wellversed's source sheets only capture a directly-entered "Overall Admin Score" per record today — not per-parameter sub-scores —
        so this engine is exposed here as a configurable model for future evaluations rather than applied retroactively to existing scores.
        Records already showing a score display exactly the number captured in their source sheet.
      </p>
      <div class="form-grid" id="scoring-grid">
        ${Object.entries(cfg.weights).map(([k, v]) => `
          <div class="form-field"><label>${escapeHtml(prettyLabel(k))} weight</label><input type="number" min="0" max="100" data-weight="${k}" value="${v}"></div>
        `).join('')}
      </div>
      <p style="margin-top:10px; font-size:12.5px;" id="scoring-total">Total: <b>${total}</b>${total !== 100 ? ' <span style="color:var(--red-500)">(should sum to 100)</span>' : ' ✓'}</p>
      <button class="btn btn-primary btn-sm" id="scoring-save">Save weights</button>
    </div>
  `;
  const recalcTotal = () => {
    let sum = 0;
    document.querySelectorAll('[data-weight]').forEach(i => sum += Number(i.value || 0));
    document.getElementById('scoring-total').innerHTML = `Total: <b>${sum}</b>${sum !== 100 ? ' <span style="color:var(--red-500)">(should sum to 100)</span>' : ' ✓'}`;
  };
  document.querySelectorAll('[data-weight]').forEach(i => i.oninput = recalcTotal);
  document.getElementById('scoring-save').onclick = async () => {
    const before = { ...cfg };
    document.querySelectorAll('[data-weight]').forEach(i => cfg.weights[i.getAttribute('data-weight')] = Number(i.value || 0));
    await db.put('scoringConfig', cfg);
    await db.logActivity('update', 'scoringConfig', 'default', before, cfg);
    toast('Scoring weights saved', 'success');
  };
}

async function renderAuditTab(content) {
  const log = (await db.getAll('auditLog')).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  content.innerHTML = `
    <div class="panel">
      <div class="panel-title">Audit log (${log.length} events)</div>
      ${log.length ? `
        <div class="table-wrap" style="border:none;">
          <table class="data-table">
            <thead><tr><th>Action</th><th>Entity type</th><th>Entity ID</th><th>User</th><th>When</th></tr></thead>
            <tbody>
              ${log.slice(0, 200).map(l => `<tr><td>${statusBadge(l.action)}</td><td>${escapeHtml(l.entityType)}</td><td class="mono muted">${escapeHtml(String(l.entityId).slice(0,16))}</td><td>${escapeHtml(l.user)}</td><td>${fmtDate(l.timestamp)} · ${timeAgo(l.timestamp)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>` : emptyState({ icon: '🔔', title: 'No activity recorded yet', message: 'Every create, edit, delete, restore, and import will be logged here.' })}
    </div>
  `;
}

async function renderIntegrationsTab(content) {
  let cfg = await db.get('settings', 'googleSheetsIntegration');
  cfg = cfg || { id: 'googleSheetsIntegration', apiKey: '' };

  content.innerHTML = `
    <div class="panel">
      <div class="panel-title">Google Sheets API key</div>
      <p class="muted" style="font-size:12.5px; margin-bottom:12px;">
        Stored only in <b>this browser's local database</b> — never written into the app's source files,
        never shipped, never visible to anyone you share the app folder with. If you clear this browser's
        site data, you'll need to re-enter it.
      </p>
      <div class="form-grid">
        <div class="form-field full">
          <label>API key</label>
          <input type="password" id="gs-api-key" value="${escapeHtml(cfg.apiKey || '')}" placeholder="AIza...">
        </div>
      </div>
      <div class="flex gap-8" style="margin-top:10px;">
        <button class="btn btn-primary btn-sm" id="gs-save-key">Save key</button>
        <button class="btn btn-ghost btn-sm" id="gs-clear-key">Clear saved key</button>
      </div>
      <p class="muted" style="font-size:11.5px; margin-top:10px;">
        This only works for sheets shared as <b>"Anyone with the link can view"</b> — an API key alone
        cannot read a private/restricted sheet, and this app has no way to sign in with your Google account.
        In Google Cloud Console, also restrict this key to the Sheets API only, ideally with an HTTP referrer
        restriction, so it can't be reused elsewhere if it ever leaks.
      </p>
    </div>

    <div class="panel">
      <div class="panel-title">Import tabs from a Google Sheet</div>
      <div class="form-grid">
        <div class="form-field full">
          <label>Google Sheet URL</label>
          <input type="text" id="gs-sheet-url" placeholder="https://docs.google.com/spreadsheets/d/.../edit">
        </div>
      </div>
      <button class="btn btn-secondary btn-sm" id="gs-list-tabs" style="margin-top:10px;">List tabs</button>
      <div id="gs-tabs-result" style="margin-top:14px;"></div>
    </div>
  `;

  document.getElementById('gs-save-key').onclick = async () => {
    cfg.apiKey = document.getElementById('gs-api-key').value.trim();
    await db.put('settings', cfg);
    toast('API key saved locally', 'success');
  };
  document.getElementById('gs-clear-key').onclick = async () => {
    cfg.apiKey = '';
    document.getElementById('gs-api-key').value = '';
    await db.put('settings', cfg);
    toast('API key cleared', 'success');
  };

  document.getElementById('gs-list-tabs').onclick = async () => {
    const resultEl = document.getElementById('gs-tabs-result');
    const url = document.getElementById('gs-sheet-url').value.trim();
    const apiKey = (await db.get('settings', 'googleSheetsIntegration'))?.apiKey;
    if (!apiKey) { toast('Save an API key first', 'error'); return; }
    const idMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!idMatch) { toast('Could not find a spreadsheet ID in that URL', 'error'); return; }
    const spreadsheetId = idMatch[1];
    resultEl.innerHTML = `<p class="muted">Loading sheet list…</p>`;
    try {
      const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?key=${encodeURIComponent(apiKey)}&fields=properties.title,sheets.properties`);
      const meta = await metaRes.json();
      if (!metaRes.ok) {
        const reason = meta?.error?.message || 'Unknown error';
        resultEl.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠</div><h3>Could not read this sheet</h3><p>${escapeHtml(reason)}</p><p class="muted" style="font-size:11.5px;">Common causes: the sheet isn't shared as "Anyone with the link can view", the Sheets API isn't enabled on this API key's Google Cloud project, or the key is restricted to different domains/APIs.</p></div>`;
        return;
      }
      const sheetTitle = meta.properties?.title || 'Untitled spreadsheet';
      const sheetTabs = meta.sheets || [];
      resultEl.innerHTML = `
        <p style="font-size:12.5px; margin-bottom:10px;"><b>${escapeHtml(sheetTitle)}</b> — ${sheetTabs.length} tab(s) found.</p>
        <div class="table-wrap" style="border:none; max-height:320px; overflow:auto;">
          <table class="data-table">
            <thead><tr><th style="width:30px;"><input type="checkbox" id="gs-select-all-tabs"></th><th>Tab name</th><th>Rows × Cols</th></tr></thead>
            <tbody>
              ${sheetTabs.map(s => `
                <tr>
                  <td><input type="checkbox" class="gs-tab-check" data-title="${escapeHtml(s.properties.title)}" data-gid="${s.properties.sheetId}"></td>
                  <td>${escapeHtml(s.properties.title)}</td>
                  <td class="muted">${s.properties.gridProperties?.rowCount || '?'} × ${s.properties.gridProperties?.columnCount || '?'}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="form-grid" style="margin-top:12px;">
          <div class="form-field">
            <label>Import selected tabs into</label>
            <select id="gs-target-store">
              <option value="vendorMatrix">Vendor Matrix</option>
              <option value="solutionMatrix">Solution Matrix</option>
            </select>
          </div>
        </div>
        <button class="btn btn-primary btn-sm" id="gs-import-selected" style="margin-top:10px;">Import selected tabs</button>
      `;
      document.getElementById('gs-select-all-tabs').onchange = (e) => {
        document.querySelectorAll('.gs-tab-check').forEach(cb => cb.checked = e.target.checked);
      };
      document.getElementById('gs-import-selected').onclick = async () => {
        const selected = [...document.querySelectorAll('.gs-tab-check:checked')];
        if (!selected.length) { toast('Select at least one tab', 'error'); return; }
        const targetStore = document.getElementById('gs-target-store').value;
        let totalRows = 0;
        for (const cb of selected) {
          const tabTitle = cb.getAttribute('data-title');
          const gid = cb.getAttribute('data-gid');
          try {
            const valRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(tabTitle)}?key=${encodeURIComponent(apiKey)}`);
            const valData = await valRes.json();
            if (!valRes.ok) { toast(`Skipped "${tabTitle}": ${valData?.error?.message || 'fetch failed'}`, 'error'); continue; }
            const rows = valData.values || [];
            if (rows.length < 2) { toast(`"${tabTitle}" has no data rows — skipped`, 'warning'); continue; }
            const headers = rows[0];
            const dataRows = rows.slice(1);
            const productLine = tabTitle;
            const category = classifyCategoryFromTitle(productLine);
            const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit?gid=${gid}#gid=${gid}`;
            for (let i = 0; i < dataRows.length; i++) {
              const row = dataRows[i];
              if (!row.some(v => v && String(v).trim())) continue;
              const rawRecord = {}; const normalized = {}; const custom = {};
              headers.forEach((h, idx) => {
                if (!h) return;
                const v = row[idx];
                if (v === undefined || v === null || String(v).trim() === '') return;
                rawRecord[h] = v;
                const canon = normalize_header_js(h);
                if (canon) normalized[canon] = v; else custom[h] = v;
              });
              if (!Object.keys(rawRecord).length) continue;
              const id = 'gsync_' + spreadsheetId.slice(0, 6) + '_' + gid + '_' + i + '_' + Date.now().toString(36).slice(-4);
              const record = {
                id, recordType: targetStore === 'vendorMatrix' ? 'vendor_matrix' : 'solution_matrix',
                category, categorySource: 'inferred_from_sheet_name', productLine, normalized, customFields: custom,
                rawRecord, fieldDescriptions: {},
                source: { sourceFile: 'Google Sheets (live sync)', sourceWorkbook: sheetTitle, sourceSheet: tabTitle, sourceRow: i + 2, importDate: new Date().toISOString() },
                sheetLink: { url: sheetUrl, confirmed: true },
                lastUpdated: new Date().toISOString(), deletedAt: null,
              };
              await db.put(targetStore, record);
              totalRows++;
            }
          } catch (err) {
            toast(`Error importing "${tabTitle}": ${err.message}`, 'error');
          }
        }
        await db.logActivity('import', targetStore, 'google_sheets_sync', null, { spreadsheetId, tabs: selected.length, totalRows });
        toast(`Imported ${totalRows} row(s) from ${selected.length} tab(s)`, 'success');
        SEARCH_INDEX = null;
      };
    } catch (err) {
      resultEl.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠</div><h3>Request failed</h3><p>${escapeHtml(err.message)}</p></div>`;
    }
  };
}

function classifyCategoryFromTitle(title) {
  const key = title.toLowerCase();
  const rules = [
    ['IT Infrastructure', ['networking','firewall','access point','printer','laptop','interactive panel','projector','aqm','wireless','camera','cctv','it ','server','router','switch']],
    ['Furniture', ['chair','sofa','desk','rack','dustbin','door closer','organizer']],
    ['Safety & Security', ['fire','extinguisher','ac ','oil','security','alarm']],
    ['Sanitary & Hygiene', ['sink','flooring','glass cleaning','lab coat','pest control','discard','dryer','dispenser','purifier']],
    ['Pantry & Hospitality', ['milk','coffee','pantry','kitchen']],
    ['Facility & Wellness', ['gym']],
  ];
  for (const [cat, kws] of rules) if (kws.some(k => key.includes(k))) return cat;
  return 'Uncategorized / General Procurement';
}

async function renderAboutTab(content) {
  content.innerHTML = `
    <div class="panel">
      <div class="panel-title">Users &amp; roles</div>
      <p class="muted" style="font-size:12.5px; margin-bottom:14px;">
        This prototype runs entirely client-side with a single local session — there is no server-side authentication.
        Client-side role checks below are suitable for an internal single-user tool but are <b>not</b> equivalent to production access control.
        A real deployment (see README → Future backend migration) would enforce these roles server-side.
      </p>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Role</th><th>Permissions</th></tr></thead>
          <tbody>
            <tr><td style="font-weight:600;">Admin</td><td>Full access — edit records, manage categories, configure scoring, import/export, view audit log, permanently delete</td></tr>
            <tr><td style="font-weight:600;">Editor</td><td>Create and edit vendor / solution / reference records; cannot manage users, scoring config, or permanently delete</td></tr>
            <tr><td style="font-weight:600;">Viewer</td><td>Read-only access to all modules</td></tr>
          </tbody>
        </table>
      </div>
      <p class="muted" style="font-size:12px; margin-top:12px;">Current session: <b>${escapeHtml(AppState.currentUser.name)}</b> — acting as <b>${escapeHtml(AppState.currentUser.role)}</b>.</p>
    </div>
  `;
}
