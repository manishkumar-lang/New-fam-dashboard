PAGE_RENDERERS.overview = async function (root) {
  // Prevent the page from rendering against a partially hydrated store.
  if (db.ready) await db.ready;
  const [vendorRecords, solutionRecords, vendors, categories, refDocs, kbDocs, trash, dashboardContent] = await Promise.all([
    db.getAll('vendorMatrix'), db.getAll('solutionMatrix'), db.getAll('vendors'),
    db.getAll('categories'), db.getAll('referenceDocs'), db.getAll('knowledgeBaseDocs'), db.getAll('trash'),
    db.get('settings', 'dashboardContent'),
  ]);
  const dashTitle = dashboardContent?.title || 'WELLVERSED — FAM INTELLIGENCE';
  const dashSubtitle = dashboardContent?.subtitle || 'Procurement • Vendor Research • Solutions • Knowledge — computed live from imported source data';
  const announcement = dashboardContent?.announcement || '';
  const labels = dashboardContent?.labels || {};
  const widgets = { kpis: true, categoryChart: true, productChart: true, locationChart: true, averageChart: true, provenance: true, ...(dashboardContent?.widgets || {}) };
  const text = (key, fallback) => labels[key] || fallback;
  const activeVendorRecords = vendorRecords.filter(r => !r.deletedAt);
  const activeSolutionRecords = solutionRecords.filter(r => !r.deletedAt);
  const activeRefDocs = refDocs.filter(r => !r.deletedAt);

  const withScore = activeVendorRecords.filter(r => r.normalized.rating != null && !isNaN(Number(r.normalized.rating)));
  const withGrandTotal = activeVendorRecords.filter(r => r.normalized.grandTotal != null && !isNaN(Number(r.normalized.grandTotal)));
  const withContact = activeVendorRecords.filter(r => r.normalized.phone || r.normalized.email || r.normalized.address);
  const confirmedCategories = activeVendorRecords.filter(r => r.categorySource === 'confirmed' || r.categoryConfirmed === true).length;
  const refreshAt = window.SEED_DATA?.meta?.generatedAt || window.SEED_DATA?.meta?.updatedAt || null;
  const completeness = [
    { label: 'Contact coverage', value: activeVendorRecords.length ? Math.round(withContact.length / activeVendorRecords.length * 100) : 0 },
    { label: 'Price coverage', value: activeVendorRecords.length ? Math.round(withGrandTotal.length / activeVendorRecords.length * 100) : 0 },
    { label: 'Scored records', value: activeVendorRecords.length ? Math.round(withScore.length / activeVendorRecords.length * 100) : 0 },
  ];

  const kpis = [
    { id: 'vendors', label: text('kpiVendors', 'Distinct Vendors'), value: vendors.length, icon: '🏢', color: 'var(--indigo-600)', route: 'vendors' },
    { id: 'vendor-records', label: text('kpiVendorRecords', 'Vendor Matrix Records'), value: activeVendorRecords.length, icon: '🏷', color: 'var(--cyan-500)', route: 'vendors' },
    { id: 'solution-records', label: text('kpiSolutionRecords', 'Solution Matrix Records'), value: activeSolutionRecords.length, icon: '⚙', color: 'var(--purple-500)', route: 'solutions' },
    { id: 'categories', label: text('kpiCategories', 'Categories'), value: categories.length, icon: '▤', color: 'var(--emerald-500)', route: 'categories' },
    { id: 'references', label: text('kpiReferences', 'Reference Documents'), value: activeRefDocs.length, icon: '☍', color: 'var(--amber-500)', route: 'referencing' },
    { id: 'kb', label: text('kpiKnowledge', 'Knowledge Base Docs'), value: kbDocs.filter(d=>!d.deletedAt).length, icon: '☰', color: '#0ea5e9', route: 'knowledge' },
    { id: 'scored', label: text('kpiScored', 'Vendor Records Scored'), value: withScore.length, icon: '★', color: '#f97316', route: 'vendors' },
    { id: 'trash', label: text('kpiTrash', 'Items in Trash'), value: trash.length, icon: '🗑', color: '#64748b', route: 'trash' },
  ];

  const categoryCounts = {};
  activeVendorRecords.forEach(r => { categoryCounts[r.category] = (categoryCounts[r.category] || 0) + 1; });

  const categoryIconMap = {
    'Facility & Wellness': 'vendor',
    'Furniture': 'grid',
    'IT Infrastructure': 'dashboard',
    'Pantry & Hospitality': 'book',
    'Safety & Security': 'settings',
    'Sanitary & Hygiene': 'diamond',
    'Uncategorized / General Procurement': 'tag',
  };
  const productLineCounts = {};
  activeVendorRecords.forEach(r => { const label = displaySourceLabel(r.productLine); productLineCounts[label] = (productLineCounts[label] || 0) + 1; });
  const topProductLines = Object.entries(productLineCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

  const locationCounts = {};
  activeVendorRecords.forEach(r => {
    const loc = (r.normalized.address || '').toString().split(',')[0].trim();
    if (loc && loc.length < 30) locationCounts[loc] = (locationCounts[loc] || 0) + 1;
  });
  const topLocations = Object.entries(locationCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

  const avgTicketByCategory = {};
  const countByCategory = {};
  withGrandTotal.forEach(r => {
    const cat = r.category;
    avgTicketByCategory[cat] = (avgTicketByCategory[cat] || 0) + Number(r.normalized.grandTotal);
    countByCategory[cat] = (countByCategory[cat] || 0) + 1;
  });
  Object.keys(avgTicketByCategory).forEach(cat => { avgTicketByCategory[cat] = Math.round(avgTicketByCategory[cat] / countByCategory[cat]); });

  root.innerHTML = `
    <div class="section-head">
      <div>
        <h2>${escapeHtml(dashTitle)}</h2>
        <div class="section-sub">${escapeHtml(dashSubtitle)}</div>
        ${announcement ? `<div class="dashboard-announcement"><span class="announcement-icon">✦</span>${escapeHtml(announcement)}</div>` : ''}
      </div>
      <div class="flex gap-8">
        <span class="data-refresh" title="Snapshot generated from the imported source bundle">${refreshAt ? `Updated ${escapeHtml(fmtDate(refreshAt))}` : 'Live imported snapshot'}</span>
        <button class="btn btn-ghost btn-sm" id="ov-export">Export snapshot (JSON)</button>
      </div>
    </div>

    <div class="kpi-grid" id="kpi-grid" style="display:${widgets.kpis ? '' : 'none'}"></div>
    <div class="grid-2" id="overview-charts-primary">
      <div class="chart-card" style="display:${widgets.categoryChart ? '' : 'none'}">
        <div class="panel-title"><span>Vendor records by category <span class="muted" title="Active vendor matrix records grouped by assigned category" style="font-weight:400; font-size:11.5px;">ⓘ real data</span></span><button class="chart-table-toggle btn btn-ghost btn-sm" data-chart-table="category">Table</button></div>
        <canvas id="chart-category"></canvas>
        <div id="chart-category-table" class="chart-table" hidden></div>
        <div class="chart-hint">Click a slice to see the vendor records behind it</div>
        <div id="chart-category-drilldown"></div>
      </div>
      <div class="chart-card" style="display:${widgets.productChart ? '' : 'none'}">
        <div class="panel-title"><span>Top 8 requirement / product lines by vendor count</span><button class="chart-table-toggle btn btn-ghost btn-sm" data-chart-table="productlines">Table</button></div>
        <canvas id="chart-productlines"></canvas>
        <div id="chart-productlines-table" class="chart-table" hidden></div>
        <div class="chart-hint">Click a bar to see the vendor records behind it</div>
        <div id="chart-productlines-drilldown"></div>
      </div>
    </div>

    <div class="grid-2" style="margin-top:16px;" id="overview-charts-secondary">
      <div class="chart-card" style="display:${widgets.locationChart ? '' : 'none'}">
        <div class="panel-title"><span>Top vendor locations <span class="muted" title="First comma-separated address token; location names are source-derived" style="font-weight:400; font-size:11.5px;">ⓘ source-derived</span></span><button class="chart-table-toggle btn btn-ghost btn-sm" data-chart-table="locations">Table</button></div>
        ${topLocations.length ? `<canvas id="chart-locations"></canvas>` : emptyState({ icon: '📍', title: 'Location data insufficient', message: 'Not enough structured location data to chart yet.' })}
      </div>
      <div class="chart-card" style="display:${widgets.averageChart ? '' : 'none'}">
        <div class="panel-title"><span>Average Grand Total by category <span class="muted" title="Average of numeric Grand Total values only; records without a usable value are excluded" style="font-weight:400; font-size:11.5px;">ⓘ captured values only</span></span><button class="chart-table-toggle btn btn-ghost btn-sm" data-chart-table="average">Table</button></div>
        ${Object.keys(avgTicketByCategory).length ? `<canvas id="chart-avgtotal"></canvas>` : emptyState({ icon: '₹', title: 'Insufficient pricing data', message: 'Not enough records include a Grand Total to compute this.' })}
      </div>
    </div>

    <div class="panel overview-quality" style="margin-top:16px;">
      <div class="panel-title"><span>Data quality &amp; coverage</span><span class="muted" title="Coverage is calculated from active Vendor Matrix records">${activeVendorRecords.length.toLocaleString('en-IN')} active records</span></div>
      <div class="quality-grid">${completeness.map(item => `<div class="quality-item"><div class="quality-label"><span>${escapeHtml(item.label)}</span><b>${item.value}%</b></div><div class="quality-track"><span style="width:${item.value}%"></span></div></div>`).join('')}</div>
      <div class="quality-footnote">${confirmedCategories ? `${confirmedCategories.toLocaleString('en-IN')} records carry confirmed category lineage.` : 'Category lineage is retained on each record; confirmed/inferred status is available in record details.'} Trend comparison is unavailable until a prior snapshot is stored.</div>
    </div>

    <div class="panel" style="margin-top:16px; display:${widgets.provenance ? '' : 'none'}">
      <div class="panel-title">Data provenance</div>
      <p class="muted" style="font-size:12.5px; line-height:1.7;">
        This overview is computed from the authenticated Wellversed Google Sheets source and refreshed from the live backend. Every displayed record retains its source sheet and row lineage where available.
        No vendor, price, GST figure, or rating on this dashboard was invented — every number traces back to a specific sheet and row, viewable from any record's "Source &amp; Lineage" tab.
        Categories marked "inferred" were assigned from the sheet's own title (not fabricated); categories marked "confirmed" are drawn directly from the Vendor Matrix Link document.
      </p>
      
    </div>
  `;

  // KPI cards with count-up animation
  const kpiGrid = document.getElementById('kpi-grid');
  kpis.forEach(k => {
    const card = document.createElement('div');
    card.className = 'kpi-card';
    card.innerHTML = `
      <div class="kpi-icon" style="background:${k.color}">${k.icon}</div>
      <div class="kpi-value" data-target="${k.value}">0</div>
      <div class="kpi-label">${escapeHtml(k.label)}</div>`;
    card.onclick = () => navigate(k.route);
    kpiGrid.appendChild(card);
    animateCountUp(card.querySelector('.kpi-value'), k.value);
  });

  // Charts
  const palette = Object.values(CATEGORY_COLORS);
  const categoryLabels = Object.keys(categoryCounts);
  if (categoryLabels.length && widgets.categoryChart && window.Chart) {
    new Chart(document.getElementById('chart-category'), {
      type: 'doughnut',
      data: {
        labels: categoryLabels,
        datasets: [{ data: Object.values(categoryCounts), backgroundColor: categoryLabels.map(c => CATEGORY_COLORS[c] || '#32B4AC'), borderWidth: 0 }],
      },
      options: {
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } },
        cutout: '62%',
        onHover: (evt, els, chart) => { chart.canvas.style.cursor = els.length ? 'pointer' : 'default'; },
        onClick: (evt, els, chart) => {
          if (!els.length) return;
          const label = categoryLabels[els[0].index];
          const color = CATEGORY_COLORS[label] || '#32B4AC';
          const records = activeVendorRecords.filter(r => r.category === label);
          const solutionMatches = activeSolutionRecords.filter(r => r.category === label);
          renderChartDrilldown('chart-category-drilldown', {
            title: `${escapeHtml(label)} — ${records.length} vendor record${records.length === 1 ? '' : 's'} · ${solutionMatches.length} solution record${solutionMatches.length === 1 ? '' : 's'}`,
            color,
            records,
            solutionRecords: solutionMatches,
          });
        },
      },
    });
  }
  if (topProductLines.length && widgets.productChart && window.Chart) {
    new Chart(document.getElementById('chart-productlines'), {
      type: 'bar',
      data: {
        labels: topProductLines.map(x => x[0]),
        datasets: [{ label: 'Vendor records', data: topProductLines.map(x => x[1]), backgroundColor: '#32B4AC', borderRadius: 6 }],
      },
      options: {
        indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
        onHover: (evt, els, chart) => { chart.canvas.style.cursor = els.length ? 'pointer' : 'default'; },
        onClick: (evt, els, chart) => {
          if (!els.length) return;
          const label = topProductLines[els[0].index][0];
          const records = activeVendorRecords.filter(r => displaySourceLabel(r.productLine) === label);
          const solutionMatches = activeSolutionRecords.filter(r => displaySourceLabel(r.productLine) === label);
          renderChartDrilldown('chart-productlines-drilldown', {
            title: `${escapeHtml(label)} — ${records.length} vendor record${records.length === 1 ? '' : 's'} · ${solutionMatches.length} solution record${solutionMatches.length === 1 ? '' : 's'}`,
            color: '#32B4AC',
            records,
            solutionRecords: solutionMatches,
          });
        },
      },
    });
  }
  if (topLocations.length && widgets.locationChart && window.Chart) {
    new Chart(document.getElementById('chart-locations'), {
      type: 'bar',
      data: { labels: topLocations.map(x => x[0]), datasets: [{ label: 'Vendors', data: topLocations.map(x => x[1]), backgroundColor: '#06B6D4', borderRadius: 6 }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
    });
  }
  if (Object.keys(avgTicketByCategory).length && widgets.averageChart && window.Chart) {
    new Chart(document.getElementById('chart-avgtotal'), {
      type: 'bar',
      data: {
        labels: Object.keys(avgTicketByCategory),
        datasets: [{ label: 'Avg Grand Total (₹)', data: Object.values(avgTicketByCategory), backgroundColor: '#F59E0B', borderRadius: 6 }],
      },
      options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${fmtCurrency(ctx.raw)}` } } }, scales: { y: { beginAtZero: true, ticks: { callback: value => compactCurrency(value) } } } },
    });
  }

  const tableData = {
    category: { title: 'Vendor records by category', rows: Object.entries(categoryCounts), format: v => fmtNumber(v) },
    productlines: { title: 'Top product lines by vendor count', rows: topProductLines, format: v => fmtNumber(v) },
    locations: { title: 'Top vendor locations', rows: topLocations, format: v => fmtNumber(v) },
    average: { title: 'Average Grand Total by category', rows: Object.entries(avgTicketByCategory), format: v => fmtCurrency(v) },
  };
  Object.entries(tableData).forEach(([key, config]) => {
    const tableHost = document.getElementById(`chart-${key}-table`);
    if (tableHost) tableHost.innerHTML = chartTableHtml(config.title, config.rows, config.format);
  });
  document.querySelectorAll('[data-chart-table]').forEach(btn => {
    btn.onclick = () => {
      const host = document.getElementById(`chart-${btn.dataset.chartTable}-table`);
      if (!host) return;
      const hidden = host.hasAttribute('hidden');
      host.toggleAttribute('hidden', !hidden);
      const chart = btn.closest('.chart-card')?.querySelector('canvas');
      if (chart) chart.hidden = !hidden;
      btn.textContent = hidden ? 'Chart' : 'Table';
    };
  });

  document.getElementById('ov-export').onclick = () => {
    const snapshot = { generatedAt: new Date().toISOString(), kpis, categoryCounts, topProductLines, topLocations, avgTicketByCategory };
    downloadFile('wellversed-overview-snapshot.json', JSON.stringify(snapshot, null, 2), 'application/json');
    toast('Snapshot exported', 'success');
  };
};

function compactCurrency(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '₹0';
  if (Math.abs(n) >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (Math.abs(n) >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.round(n)}`;
}

function chartTableHtml(title, rows, format) {
  if (!rows?.length) return emptyState({ icon: '∅', title: 'No data', message: 'No usable data is available for this view.' });
  return `<div class="table-wrap chart-table-wrap"><table class="data-table"><caption>${escapeHtml(title)}</caption><thead><tr><th>Label</th><th>Value</th></tr></thead><tbody>${rows.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(format(value))}</td></tr>`).join('')}</tbody></table></div>`;
}

/**
 * Renders an inline, in-page accordion list under a clicked chart —
 * no modal. Each row is a vendor record; clicking a row expands it
 * to show the full normalized field set for that record.
 */
function renderChartDrilldown(hostId, { title, color, records = [], solutionRecords = [] }) {
  const host = document.getElementById(hostId);
  if (!host) return;
  const pageSize = 20;
  let vendorPage = 1;
  let solutionPage = 1;
  let query = '';
  let activeTab = 'vendors';

  const normalizeHaystack = (r, kind) => {
    const normalized = r.normalized || {};
    const raw = r.rawRecord || {};
    return JSON.stringify({
      kind,
      vendor: normalized.vendorName || raw.Vendor || raw['Vendor Name'],
      product: normalized.productName || raw['Product Name'] || raw.Item || raw.Product,
      productLine: displaySourceLabel(r.productLine),
      category: r.category,
      phone: normalized.phone || raw.Phone || raw.Mobile || raw['Contact Number'],
      email: normalized.email || raw.Email,
      address: normalized.address || raw.Address || raw.Location,
    }).toLowerCase();
  };

  const draw = (focusSearch = false) => {
    const q = query.trim().toLowerCase();
    const filteredVendors = records.filter(r => !q || normalizeHaystack(r, 'vendor').includes(q));
    const filteredSolutions = solutionRecords.filter(r => !q || normalizeHaystack(r, 'solution').includes(q));
    const vendorPages = Math.max(1, Math.ceil(filteredVendors.length / pageSize));
    const solutionPages = Math.max(1, Math.ceil(filteredSolutions.length / pageSize));
    vendorPage = Math.min(vendorPage, vendorPages);
    solutionPage = Math.min(solutionPage, solutionPages);

    const vendorItems = filteredVendors.slice((vendorPage - 1) * pageSize, vendorPage * pageSize);
    const solutionItems = filteredSolutions.slice((solutionPage - 1) * pageSize, solutionPage * pageSize);

    const itemHtml = (r, idx, kind) => {
      const normalized = r.normalized || {};
      const raw = r.rawRecord || {};
      const isVendor = kind === 'vendor';
      const name = isVendor
        ? (normalized.vendorName || raw.Vendor || raw['Vendor Name'] || displaySourceLabel(r.productLine) || 'Untitled vendor')
        : (normalized.productName || raw['Product Name'] || raw.Item || raw.Product || displaySourceLabel(r.productLine) || 'Untitled solution');
      const secondary = isVendor
        ? [displaySourceLabel(r.productLine), r.category, normalized.productName].filter(Boolean).join(' · ')
        : [r.category, displaySourceLabel(r.productLine), normalized.vendorName || raw.Vendor].filter(Boolean).join(' · ');
      return `<div class="cd-item" data-cd-kind="${kind}" data-cd-idx="${idx}">
        <button class="cd-item-head" type="button" data-cd-toggle="${kind}:${idx}">
          <span>
            <span class="cd-item-title">${escapeHtml(name)}</span>
            <span class="cd-item-sub">${escapeHtml(secondary || (isVendor ? 'Vendor Matrix record' : 'Solution Matrix record'))}</span>
            <span class="cd-item-contact">${escapeHtml(chartContactSummary(r))}</span>
          </span>
          <span class="cd-caret">▶</span>
        </button>
        <div class="cd-item-body" id="${hostId}-body-${kind}-${idx}"></div>
      </div>`;
    };

    const sectionHtml = (kind, items, total, page, pages, emptyTitle, emptyMessage) => `
      <section class="cd-matrix-section" data-cd-section="${kind}">
        <div class="cd-section-title"><span>${kind === 'vendor' ? 'Vendor Matrix' : 'Solution Matrix'}</span><b>${total.toLocaleString('en-IN')}</b></div>
        <div class="cd-list">${items.length ? items.map((r, i) => itemHtml(r, i, kind)).join('') : emptyState({icon:'📭', title:emptyTitle, message:emptyMessage})}</div>
        ${paginationControlsHtml(page, pages, total, `${hostId}-${kind}`)}
      </section>`;

    host.innerHTML = `<div class="chart-drilldown">
      <div class="chart-drilldown-head">
        <span class="cd-title"><span class="cd-dot" style="background:${color}"></span>${title}</span>
        <button class="cd-close" data-cd-close type="button">Close ✕</button>
      </div>
      <div class="cd-filter"><input type="search" data-cd-search placeholder="Search vendor, solution, phone, email, product…" value="${escapeHtml(query)}"><span>${(filteredVendors.length + filteredSolutions.length).toLocaleString('en-IN')} matching records</span></div>
      <div class="cd-tabs">
        <button type="button" class="cd-tab ${activeTab === 'vendors' ? 'active' : ''}" data-cd-tab="vendors">Vendor Matrix <b>${filteredVendors.length}</b></button>
        <button type="button" class="cd-tab ${activeTab === 'solutions' ? 'active' : ''}" data-cd-tab="solutions">Solution Matrix <b>${filteredSolutions.length}</b></button>
      </div>
      <div data-cd-panel="vendors" style="display:${activeTab === 'vendors' ? '' : 'none'}">
        ${sectionHtml('vendor', vendorItems, filteredVendors.length, vendorPage, vendorPages, 'No vendor matches', 'Try a vendor, product, phone, email, or location.')}
      </div>
      <div data-cd-panel="solutions" style="display:${activeTab === 'solutions' ? '' : 'none'}">
        ${sectionHtml('solution', solutionItems, filteredSolutions.length, solutionPage, solutionPages, 'No solution matches', 'Try a solution, vendor, product line, phone, or email.')}
      </div>
    </div>`;

    host.querySelector('[data-cd-close]').onclick = () => { host.innerHTML = ''; };
    const search = host.querySelector('[data-cd-search]');
    search.oninput = (e) => {
      query = e.target.value;
      vendorPage = 1;
      solutionPage = 1;
      const pos = e.target.selectionStart;
      draw(true);
      const next = host.querySelector('[data-cd-search]');
      if (next) { next.focus(); try { next.setSelectionRange(pos, pos); } catch (_) {} }
    };

    host.querySelectorAll('[data-cd-tab]').forEach(btn => btn.onclick = () => {
      activeTab = btn.dataset.cdTab === 'solutions' ? 'solutions' : 'vendors';
      draw(false);
    });

    host.querySelectorAll('[data-page-action]').forEach(btn => btn.onclick = () => {
      const action = btn.dataset.pageAction;
      const section = btn.closest('[data-cd-section]');
      const isSolution = section?.dataset.cdSection === 'solution';
      let page = isSolution ? solutionPage : vendorPage;
      const totalPages = isSolution ? solutionPages : vendorPages;
      if (action === 'first') page = 1;
      if (action === 'prev') page = Math.max(1, page - 1);
      if (action === 'next') page = Math.min(totalPages, page + 1);
      if (action === 'last') page = totalPages;
      if (isSolution) solutionPage = page; else vendorPage = page;
      draw(false);
    });

    host.querySelectorAll('[data-cd-toggle]').forEach(btn => btn.onclick = () => {
      const [kind, idxText] = btn.dataset.cdToggle.split(':');
      const idx = Number(idxText);
      const item = btn.closest('.cd-item');
      if (!item) return;
      const body = host.querySelector(`#${hostId}-body-${kind}-${idx}`);
      const isOpen = item.classList.contains('open');
      host.querySelectorAll('.cd-item.open').forEach(el => { if (el !== item) el.classList.remove('open'); });
      if (isOpen) { item.classList.remove('open'); return; }

      const list = kind === 'vendor' ? vendorItems : solutionItems;
      const record = list[idx];
      if (!record || !body) return;
      if (!body.dataset.rendered) {
        const fields = chartRecordFields(record);
        const titleName = kind === 'vendor'
          ? (record.normalized?.vendorName || record.rawRecord?.Vendor || 'Vendor record')
          : (record.normalized?.productName || record.rawRecord?.Item || record.rawRecord?.['Product Name'] || 'Solution record');
        body.innerHTML = `<div class="cd-item-body-inner">
          <div class="cd-detail-banner" style="grid-column:1/-1;"><span class="cd-detail-icon">${kind === 'vendor' ? 'V' : 'S'}</span><span><b>${escapeHtml(titleName)}</b><small>${kind === 'vendor' ? 'Complete Vendor Matrix details' : 'Complete Solution Matrix details'}</small></span></div>
          ${fields.map(([k, v]) => `<div class="cd-field"><label>${escapeHtml(prettyLabel(k))}</label><div class="v">${fmtValue(v)}</div></div>`).join('')}
          <div class="cd-field"><label>Category</label><div class="v">${escapeHtml(record.category || 'N/A')}</div></div>
          <div class="cd-field"><label>Product / Requirement</label><div class="v">${escapeHtml(displaySourceLabel(record.productLine) || 'N/A')}</div></div>
          ${record.source ? `<div class="cd-field" style="grid-column:1/-1;"><label>Source</label><div class="v">${escapeHtml([record.source.sourceWorkbook, record.source.sourceSheet, record.source.sourceRow ? `Row ${record.source.sourceRow}` : ''].filter(Boolean).join(' · ') || 'Imported source data')}</div></div>` : ''}
          ${chartSourceLink(record) ? `<div class="cd-field cd-source-link" style="grid-column:1/-1;"><label>Source Link</label><div class="v"><a href="${escapeHtml(chartSourceLink(record))}" target="_blank" rel="noopener noreferrer">Open source directly ↗</a></div></div>` : ''}
        </div>`;
        body.dataset.rendered = '1';
      }
      item.classList.add('open');
    });
  };
  draw(false);
}

function chartRecordFields(record) {
  const output = [];
  const seen = new Set();
  const add = (key, value) => {
    if (value === null || value === undefined || String(value).trim() === '') return;
    const normalizedKey = String(key).trim().toLowerCase();
    if (seen.has(normalizedKey)) return;
    seen.add(normalizedKey);
    output.push([key, value]);
  };
  Object.entries(record.normalized || {}).forEach(([key, value]) => add(key, value));
  Object.entries(record.customFields || {}).forEach(([key, value]) => add(key, value));
  const raw = record.rawRecord || {};
  const aliases = [
    ['Phone', raw.Phone || raw.phone || raw.Mobile || raw.mobile],
    ['Email', raw.Email || raw.email],
    ['Address', raw.Address || raw.address || raw.Location || raw.location],
    ['Website', raw.Website || raw.website || raw['Web site']],
  ];
  aliases.forEach(([key, value]) => add(key, value));
  return output;
}

function chartContactSummary(record) {
  const raw = record.rawRecord || {};
  const normalized = record.normalized || {};
  const pick = (...values) => values.find(v => v !== null && v !== undefined && String(v).trim()) || '';
  const phone = pick(normalized.phone, raw.Phone, raw.phone, raw.Mobile, raw.mobile);
  const email = pick(normalized.email, raw.Email, raw.email);
  const address = pick(normalized.address, raw.Address, raw.address, raw.Location, raw.location);
  return [phone && `☎ ${phone}`, email && `✉ ${email}`, address && `⌖ ${String(address).slice(0, 72)}`].filter(Boolean).join(' · ') || 'Contact details available on expand';
}

function chartSourceLink(record) {
  const candidate = record.sheetLink?.url || record.source?.url || record.source?.sourceUrl || '';
  return /^https?:\/\//i.test(String(candidate)) ? String(candidate) : '';
}

PAGE_RENDERERS.analytics = async function (root) {
  const [vendorRecords, solutionRecords] = await Promise.all([db.getAll('vendorMatrix'), db.getAll('solutionMatrix')]);
  const active = vendorRecords.filter(r => !r.deletedAt);
  const activeSol = solutionRecords.filter(r => !r.deletedAt);

  const gstBuckets = {};
  active.forEach(r => {
    let g = r.normalized.gstPercent;
    if (g == null) return;
    g = Number(g);
    if (isNaN(g)) return;
    if (g > 100) return; // this field sometimes holds GST amount not %, skip out-of-range
    const bucket = g === 0 ? '0%' : g <= 5 ? '≤5%' : g <= 12 ? '6–12%' : g <= 18 ? '13–18%' : '>18%';
    gstBuckets[bucket] = (gstBuckets[bucket] || 0) + 1;
  });

  const warrantyBuckets = {};
  active.forEach(r => {
    const w = r.normalized.warranty;
    if (w == null || w === '') return;
    const key = String(w);
    warrantyBuckets[key] = (warrantyBuckets[key] || 0) + 1;
  });
  const topWarranty = Object.entries(warrantyBuckets).sort((a, b) => b[1] - a[1]).slice(0, 8);

  const solutionByCategory = {};
  activeSol.forEach(r => { solutionByCategory[r.category] = (solutionByCategory[r.category] || 0) + 1; });

  const ratingDistribution = {};
  active.concat(activeSol).forEach(r => {
    const rt = r.normalized.rating;
    if (rt == null) return;
    const n = parseFloat(String(rt).replace(/\/.*/, ''));
    if (isNaN(n)) return;
    const bucket = n < 5 ? '<5' : n < 7 ? '5–7' : n < 9 ? '7–9' : '9–10';
    ratingDistribution[bucket] = (ratingDistribution[bucket] || 0) + 1;
  });

  root.innerHTML = `
    <div class="section-head">
      <div><h2>Analytics</h2><div class="section-sub">Deeper cuts across the same real dataset — charts only render when the underlying data supports them.</div></div>
    </div>
    <div class="grid-2" id="overview-charts-primary">
      <div class="chart-card" style="display:${widgets.categoryChart ? '' : 'none'}">
        <div class="panel-title">GST rate distribution <span class="muted" style="font-weight:400; font-size:11px;">records with a valid 0–100% GST field</span></div>
        ${Object.keys(gstBuckets).length ? `<canvas id="a-gst"></canvas>` : emptyState({icon:'%', title:'No usable GST data', message:'GST fields across sheets were inconsistent (amounts vs percentages) — not enough clean values to chart.'})}
      </div>
      <div class="chart-card">
        <div class="panel-title">Solution Matrix records by category</div>
        ${Object.keys(solutionByCategory).length ? `<canvas id="a-sol"></canvas>` : emptyState({icon:'⚙', title:'No solution records', message:'No Solution Matrix data available yet.'})}
      </div>
    </div>
    <div class="grid-2" style="margin-top:16px;" id="overview-charts-secondary">
      <div class="chart-card" style="display:${widgets.locationChart ? '' : 'none'}">
        <div class="panel-title">Most common warranty terms</div>
        ${topWarranty.length ? `<canvas id="a-warranty"></canvas>` : emptyState({icon:'🛡', title:'No warranty data', message:'Warranty field not populated across enough records.'})}
      </div>
      <div class="chart-card">
        <div class="panel-title">Admin / evaluation score distribution</div>
        ${Object.keys(ratingDistribution).length ? `<canvas id="a-rating"></canvas>` : emptyState({icon:'★', title:'No scored records', message:'Scores exist only on a subset of Solution Matrix sheets — none met the threshold to chart.'})}
      </div>
    </div>
  `;

  if (Object.keys(gstBuckets).length) new Chart(document.getElementById('a-gst'), {
    type: 'pie',
    data: { labels: Object.keys(gstBuckets), datasets: [{ data: Object.values(gstBuckets), backgroundColor: ['#4F46E5','#06B6D4','#10B981','#F59E0B','#EF4444'] }] },
    options: { plugins: { legend: { position: 'bottom' } } },
  });
  if (Object.keys(solutionByCategory).length) new Chart(document.getElementById('a-sol'), {
    type: 'bar',
    data: { labels: Object.keys(solutionByCategory), datasets: [{ data: Object.values(solutionByCategory), backgroundColor: '#8B5CF6', borderRadius: 6 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
  });
  if (topWarranty.length) new Chart(document.getElementById('a-warranty'), {
    type: 'bar',
    data: { labels: topWarranty.map(x=>x[0]), datasets: [{ data: topWarranty.map(x=>x[1]), backgroundColor: '#10B981', borderRadius: 6 }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false } } },
  });
  if (Object.keys(ratingDistribution).length) new Chart(document.getElementById('a-rating'), {
    type: 'bar',
    data: { labels: Object.keys(ratingDistribution), datasets: [{ data: Object.values(ratingDistribution), backgroundColor: '#F59E0B', borderRadius: 6 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
  });
};
