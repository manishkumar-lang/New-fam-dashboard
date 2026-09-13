/** ================= App State ================= */
const AppState = {
  theme: localStorage.getItem('wv_theme') || 'light',
  sidebarCollapsed: localStorage.getItem('wv_sidebar_collapsed') === '1',
  route: 'overview',
  routeParams: {},
  globalFilters: { category: '', status: '', location: '' },
  currentUser: { name: 'Local Admin', role: 'Admin' },
};

const NAV_SECTIONS = [
  { title: 'Intelligence', items: [
    { id: 'overview', label: 'Overview', icon: 'dashboard' },
    // Analytics removed from navigation per brand-refresh request (page renderer left intact, just unlinked)
  ]},
  { title: 'Procurement', items: [
    { id: 'vendors', label: 'Vendor Matrix', icon: 'tag' },
    { id: 'contacts', label: 'Vendor Contacts', icon: 'phone' },
    { id: 'solutions', label: 'Solution Matrix', icon: 'diamond' },
    { id: 'categories', label: 'Categories', icon: 'grid' },
  ]},
  { title: 'Research', items: [
    { id: 'referencing', label: 'Referencing', icon: 'link' },
    { id: 'knowledge', label: 'Knowledge Base', icon: 'book' },
  ]},
  { title: 'System', items: [
    { id: 'admin', label: 'Admin', icon: 'settings' },
    { id: 'trash', label: 'Trash', icon: 'trash' },
  ]},
];

const PAGE_RENDERERS = {}; // populated by page-*.js files: PAGE_RENDERERS.overview = async (root) => {...}
const PAGE_TITLES = {
  overview: 'Overview', analytics: 'Analytics', vendors: 'Vendor Matrix', contacts: 'Vendor Contacts', solutions: 'Solution Matrix',
  categories: 'Categories', referencing: 'Referencing', knowledge: 'Knowledge Base', admin: 'Admin',
  trash: 'Trash',
};

/** ================= Boot ================= */
async function boot() {
  document.documentElement.setAttribute('data-theme', AppState.theme);
  // Never block the dashboard on the remote Google Sheets function. The
  // bundled snapshot is the guaranteed boot source; live sync happens in the
  // background after the UI is usable. This prevents a slow/missing Netlify
  // Function from producing the misleading "initialization timed out" screen.
  try {
    await ensureSeededLocalFirst();
  } catch (err) {
    console.error('Dashboard local boot failed:', err);
    const overlay = document.getElementById('boot-overlay');
    if (overlay) {
      overlay.innerHTML = `<div style="max-width:620px;text-align:center;padding:28px;">
        <div style="font-size:42px;margin-bottom:12px;">⚠</div>
        <div style="font-family:Sora,sans-serif;font-weight:700;font-size:18px;margin-bottom:8px;">Dashboard data could not be initialized</div>
        <div style="font-size:13px;color:#b9c0e8;line-height:1.6;margin-bottom:18px;">${escapeHtml(err.message || 'Unknown startup error')}</div>
        <button onclick="location.reload()" style="border:0;border-radius:10px;padding:10px 18px;cursor:pointer;margin-right:8px;">Reload Dashboard</button>
        <button onclick="window.__wvForceContinue && window.__wvForceContinue()" style="border:1px solid #3a4180;background:transparent;color:#c7cbee;border-radius:10px;padding:10px 18px;cursor:pointer;">Continue anyway (offline mode)</button>
      </div>`;
    }
    return;
  }
  window.CATEGORY_COLORS_MAP = CATEGORY_COLORS;
  renderShell();
  // Google auth initializes before the app shell is rendered on some loads.
  // Re-run it after the shell exists so #google-user/#google-signin is rendered.
  if (window.WVAuth) WVAuth.init();
  if (!window.__wvListenersAttached) {
    window.__wvListenersAttached = true;
    window.addEventListener('hashchange', handleRoute);
    setupKeyboardShortcuts();
  }
  setupGlobalSearch(); // rebinds to the fresh search input renderShell() just created
  handleRoute();
}

// Manual escape hatch wired to the "Continue anyway" button in index.html.
// If storage init is truly stuck (some corporate Chrome policies leave
// indexedDB.open() neither resolving nor rejecting), this bypasses it by
// forcing the DataService into in-memory mode and re-running boot. Data
// won't persist across a reload in that mode, but the dashboard becomes
// usable immediately rather than staying stuck.
window.__wvForceContinue = function () {
  console.warn('Forcing continue past storage initialization — switching to in-memory mode.');
  db.mode = 'memory';
  db.ready = Promise.resolve(null);
  boot();
};

async function ensureSeededLocalFirst() {
  const overlay = document.getElementById('boot-overlay');
  // Prefer the bundled dataset for deterministic, instant startup.
  const seeded = await db.isSeeded();
  if (!seeded) {
    const label = document.getElementById('boot-label');
    const bar = document.getElementById('boot-bar');
    await db.seedFromBundle(window.SEED_DATA, (step, total, msg) => {
      if (label) label.textContent = msg;
      if (bar) bar.style.width = Math.round((step / total) * 100) + '%';
    });
  }
  if (overlay) overlay.remove();

  // Live Sheets refresh is authenticated and intentionally happens in the
  // background. The local snapshot always renders first.
  setTimeout(() => {
    if (window.WVAuth?.getCredential?.()) refreshRemoteInBackground();
  }, 0);
}

async function refreshRemoteInBackground() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const credential = window.WVAuth?.getCredential?.() || '';
    if (!credential) return;
    const res = await fetch('/.netlify/functions/fam-data', { cache: 'no-store', signal: controller.signal, headers: { Authorization: `Bearer ${credential}` } });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || `Remote sync failed (${res.status})`);
    if (!payload || !Array.isArray(payload.vendorMatrixRecords)) throw new Error('Remote sync returned an invalid dashboard dataset.');
    const before = window.SEED_DATA?.meta?.generatedAt || '';
    await db.replaceFromRemoteBundle(payload);
    window.SEED_DATA = payload;
    console.info('Live Google Sheets sync complete:', payload.meta);
    // Refresh the current route once when a newer remote dataset arrives.
    const after = payload.meta?.generatedAt || '';
    if (after && after !== before && sessionStorage.getItem('wv_remote_refresh') !== after) {
      sessionStorage.setItem('wv_remote_refresh', after);
      location.reload();
    }
  } catch (err) {
    console.warn('Live Google Sheets sync unavailable; continuing with local snapshot.', err);
  } finally {
    clearTimeout(timer);
  }
}
window.__wvRefreshRemoteData = refreshRemoteInBackground;

// Backward-compatible helper used by any older code paths.
async function ensureSeeded() {
  return ensureSeededLocalFirst();
}

/** ================= Brand icon system ================= */
function wvIcon(name, size = 18) {
  const paths = {
    dashboard: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    tag: '<path d="M20.6 13.2 13.2 20.6a2 2 0 0 1-2.8 0L3.4 13.6a2 2 0 0 1 0-2.8l7.4-7.4H17a2 2 0 0 1 2 2v6.2Z"/><circle cx="15.5" cy="7.5" r="1.4"/>',
    phone: '<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M9 7h6M9 11h6M9 15h3"/>',
    diamond: '<path d="m12 3 8 9-8 9-8-9 8-9Z"/>',
    grid: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
    link: '<path d="m10 13 4-4"/><path d="M7.5 16.5 5 19a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5 0" transform="translate(2 -2)"/><path d="m16.5 7.5 2.5-2.5a3.5 3.5 0 0 1 5 5l-3 3a3.5 3.5 0 0 1-5 0" transform="translate(-2 2)"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>',
    settings: '<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/><path d="m19.4 15 .1.1a1.8 1.8 0 0 1-2.5 2.5l-.1-.1a1.8 1.8 0 0 0-3 .9v.2a1.8 1.8 0 0 1-3.6 0v-.2a1.8 1.8 0 0 0-3-.9l-.1.1a1.8 1.8 0 0 1-2.5-2.5l.1-.1a1.8 1.8 0 0 0-.9-3h-.2a1.8 1.8 0 0 1 0-3.6h.2a1.8 1.8 0 0 0 .9-3l-.1-.1A1.8 1.8 0 0 1 7.2 4l.1.1a1.8 1.8 0 0 0 3-.9V3a1.8 1.8 0 0 1 3.6 0v.2a1.8 1.8 0 0 0 3 .9l.1-.1A1.8 1.8 0 0 1 19.5 6l-.1.1a1.8 1.8 0 0 0 .9 3h.2a1.8 1.8 0 0 1 0 3h-.2a1.8 1.8 0 0 0-.9 2.9Z"/>',
    trash: '<path d="M5 7h14M10 11v6M14 11v6M8 7l1-3h6l1 3M7 7l1 14h8l1-14"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 5 5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
    moon: '<path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z"/>',
    bell: '<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/>',
    vendor: '<path d="M4 21v-9l8-6 8 6v9"/><path d="M8 21v-5h8v5M3 10l9-7 9 7"/>',
  };
  const body = paths[name] || paths.dashboard;
  return `<svg class="wv-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/** ================= Shell ================= */
function renderShell() {
  const app = document.getElementById('app');
  app.classList.toggle('sidebar-collapsed', AppState.sidebarCollapsed);
  app.innerHTML = `
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-brand">
        <img class="brand-logo" src="assets/wellversed-reference.png" alt="Wellversed">
      </div>
      <button class="sidebar-toggle icon-btn" id="sidebar-toggle-btn" title="Collapse sidebar" aria-label="Toggle sidebar">
        ${AppState.sidebarCollapsed ? '»' : '«'}
      </button>
      <nav>
        ${NAV_SECTIONS.map(sec => `
          <div class="nav-section-title">${sec.title}</div>
          <ul class="nav-list">
            ${sec.items.map(item => `
              <li class="nav-item">
                <a class="nav-link" href="#/${item.id}" data-route="${item.id}" title="${item.label}">
                  <span class="nav-icon">${wvIcon(item.icon)}</span>
                  <span class="nav-label">${item.label}</span>
                </a>
              </li>`).join('')}
          </ul>`).join('')}
      </nav>
      <div class="sidebar-footer">
        <div class="sidebar-footer-text">Procurement • Vendor Research<br>Solutions • Knowledge</div>
      </div>
    </aside>
    <div class="sidebar-scrim" id="sidebar-scrim"></div>
    <div>
      <header class="topbar">
        <button class="icon-btn" id="mobile-nav-btn" style="display:none" aria-label="Open navigation">${wvIcon('menu')}</button>
        <h1 class="page-title" id="page-title">Overview</h1>
        <div class="global-search">
          <span class="search-icon">${wvIcon('search')}</span>
          <input type="text" id="global-search-input" placeholder="Search vendors, products, solutions, categories, references…" autocomplete="off">
          <span class="kbd-hint">⌘K</span>
        </div>
        <div class="topbar-actions">
          <div id="google-user" class="google-user-area"></div>
          <button class="icon-btn" id="theme-toggle-btn" title="Toggle theme" aria-label="Toggle theme">${wvIcon(AppState.theme === 'dark' ? 'sun' : 'moon')}</button>
          <button class="icon-btn topbar-popover-trigger" id="frequent-vendors-btn" title="Regular vendor contacts" aria-label="Regular vendor contacts" aria-expanded="false">${wvIcon('phone')}<span class="topbar-badge" id="frequent-vendors-count">0</span></button>
          <button class="icon-btn" id="notif-btn" title="Activity" aria-label="Activity">${wvIcon('bell')}</button>
        </div>
      </header>
      <main class="content" id="page-root"></main>
    </div>
    <nav class="bottom-nav" id="bottom-nav">
      ${[['overview','dashboard'],['vendors','tag'],['solutions','diamond'],['referencing','link'],['admin','settings']].map(([id,icon]) => `
        <a href="#/${id}" data-route="${id}"><span class="bn-icon">${wvIcon(icon)}</span><span>${PAGE_TITLES[id]}</span></a>
      `).join('')}
    </nav>
  `;

  document.getElementById('sidebar-toggle-btn').onclick = () => {
    AppState.sidebarCollapsed = !AppState.sidebarCollapsed;
    localStorage.setItem('wv_sidebar_collapsed', AppState.sidebarCollapsed ? '1' : '0');
    app.classList.toggle('sidebar-collapsed', AppState.sidebarCollapsed);
    document.getElementById('sidebar-toggle-btn').textContent = AppState.sidebarCollapsed ? '»' : '«';
  };
  document.getElementById('theme-toggle-btn').onclick = () => {
    AppState.theme = AppState.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('wv_theme', AppState.theme);
    document.documentElement.setAttribute('data-theme', AppState.theme);
    document.getElementById('theme-toggle-btn').innerHTML = wvIcon(AppState.theme === 'dark' ? 'sun' : 'moon');
  };
  document.getElementById('notif-btn').onclick = showActivityPanel;
  document.getElementById('frequent-vendors-btn').onclick = toggleFrequentVendorsPanel;
  updateFrequentVendorsCount();
  const mobileBtn = document.getElementById('mobile-nav-btn');
  const sidebar = document.getElementById('sidebar');
  const scrim = document.getElementById('sidebar-scrim');
  if (window.matchMedia('(max-width: 900px)').matches) mobileBtn.style.display = 'flex';
  mobileBtn.onclick = () => { sidebar.classList.add('mobile-open'); scrim.classList.add('show'); };
  scrim.onclick = () => { sidebar.classList.remove('mobile-open'); scrim.classList.remove('show'); };
}

function updateActiveNav() {
  document.querySelectorAll('[data-route]').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-route') === AppState.route);
  });
  document.getElementById('page-title').textContent = PAGE_TITLES[AppState.route] || 'Overview';
  document.title = `${PAGE_TITLES[AppState.route] || 'Overview'} — Wellversed FAM Intelligence`;
}

/** ================= Router ================= */
function handleRoute() {
  const hash = location.hash.replace(/^#\//, '') || 'overview';
  const [path, queryString = ''] = hash.split('?');
  const [route, ...rest] = path.split('/');
  AppState.route = PAGE_RENDERERS[route] ? route : 'overview';
  AppState.routeParams = { sub: rest.join('/'), query: new URLSearchParams(queryString) };
  updateActiveNav();
  document.getElementById('sidebar')?.classList.remove('mobile-open');
  document.getElementById('sidebar-scrim')?.classList.remove('show');
  const root = document.getElementById('page-root');
  root.innerHTML = '<div class="panel"><div class="skeleton" style="height:120px"></div></div>';
  const renderer = PAGE_RENDERERS[AppState.route];
  if (renderer) {
    Promise.resolve(renderer(root, AppState.routeParams)).catch(err => {
      console.error(err);
      root.innerHTML = `<div class="panel">Something went wrong rendering this page. Check console for details.</div>`;
    });
  }
}

function navigate(route) { location.hash = '#/' + route; }

/** ================= Global search ================= */
let SEARCH_INDEX = null;

async function buildSearchIndex() {
  const [vendorRecords, solutionRecords, refDocs, kbDocs, categories] = await Promise.all([
    db.getAll('vendorMatrix'), db.getAll('solutionMatrix'), db.getAll('referenceDocs'),
    db.getAll('knowledgeBaseDocs'), db.getAll('categories'),
  ]);
  const idx = [];
  vendorRecords.filter(r => !r.deletedAt).forEach(r => idx.push({
    type: 'Vendor Record', id: r.id, route: `vendors/${r.id}`,
    title: String(r.normalized.vendorName || r.productLine), sub: r.productLine, category: r.category,
    haystack: JSON.stringify(r.rawRecord).toLowerCase(),
  }));
  solutionRecords.filter(r => !r.deletedAt).forEach(r => idx.push({
    type: 'Solution Record', id: r.id, route: `solutions/${r.id}`,
    title: String(r.normalized.productName || firstRawValue(r) || r.productLine), sub: r.productLine, category: r.category,
    haystack: JSON.stringify(r.rawRecord).toLowerCase(),
  }));
  refDocs.filter(r => !r.deletedAt).forEach(r => idx.push({
    type: 'Reference', id: r.id, route: `referencing/${r.id}`,
    title: r.title, sub: r.docType || '', category: r.category,
    haystack: JSON.stringify(r).toLowerCase(),
  }));
  kbDocs.filter(r => !r.deletedAt).forEach(r => idx.push({
    type: 'Knowledge Base', id: r.id, route: `knowledge/${r.id}`,
    title: r.title, sub: r.docType, category: r.employee || '',
    haystack: JSON.stringify(r).toLowerCase(),
  }));
  categories.forEach(c => idx.push({
    type: 'Category', id: c.id, route: `vendors?category=${encodeURIComponent(c.name)}`,
    title: c.name, sub: 'Category', category: c.name, haystack: c.name.toLowerCase(),
  }));
  SEARCH_INDEX = idx;
  return idx;
}

function runSearch(query) {
  if (!SEARCH_INDEX || !query.trim()) return [];
  const q = query.toLowerCase();
  return SEARCH_INDEX.filter(item => item.haystack.includes(q) || String(item.title || '').toLowerCase().includes(q))
    .slice(0, 30);
}

function setupGlobalSearch() {
  const input = document.getElementById('global-search-input');
  const runAndOpen = debounce(async (q) => {
    if (!SEARCH_INDEX) await buildSearchIndex();
    openSearchPalette(q);
  }, 200);
  input.addEventListener('input', (e) => runAndOpen(e.target.value));
  input.addEventListener('focus', async () => { if (!SEARCH_INDEX) await buildSearchIndex(); });
}

function openSearchPalette(initialQuery) {
  const host = document.getElementById('search-palette-host');
  const results = runSearch(initialQuery || '');
  host.innerHTML = `
    <div class="modal-overlay" id="search-palette-overlay" style="align-items:flex-start; padding-top:12vh;">
      <div class="modal-box modal-lg" style="max-height:70vh;">
        <div class="modal-header">
          <h3>Search everything</h3>
          <button class="icon-btn" id="sp-close">✕</button>
        </div>
        <div style="padding:0 22px;">
          <input type="text" id="sp-input" value="${escapeHtml(initialQuery || '')}" placeholder="Type to search vendors, solutions, references, categories…"
            style="width:100%; padding:12px 14px; border-radius:10px; border:1px solid var(--line); font-size:14px; margin-bottom:10px;">
        </div>
        <div class="modal-body" style="padding-top:0;" id="sp-results">
          ${renderSearchResults(results)}
        </div>
      </div>
    </div>`;
  const overlay = document.getElementById('search-palette-overlay');
  document.body.classList.add('modal-open');
  document.getElementById('sp-close').onclick = closeSearchPalette;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSearchPalette(); });
  const spInput = document.getElementById('sp-input');
  spInput.focus();
  spInput.setSelectionRange(spInput.value.length, spInput.value.length);
  spInput.addEventListener('input', debounce((e) => {
    document.getElementById('sp-results').innerHTML = renderSearchResults(runSearch(e.target.value));
    bindSearchResultClicks();
  }, 150));
  const escHandler = (e) => { if (e.key === 'Escape') closeSearchPalette(); };
  document.addEventListener('keydown', escHandler);
  overlay._escHandler = escHandler;
  bindSearchResultClicks();
}

function renderSearchResults(results) {
  if (!results.length) return emptyState({ icon: '⌕', title: 'No matches', message: 'Try a different vendor, product, category, or keyword.' });
  return `<div style="display:flex; flex-direction:column; gap:2px;">
    ${results.map(r => `
      <button class="search-result-item" data-route="${escapeHtml(r.route)}" style="text-align:left; display:flex; align-items:center; justify-content:space-between; gap:10px; padding:11px 12px; border-radius:9px; border:none; background:none; width:100%;">
        <span style="display:flex; flex-direction:column; gap:2px;">
          <span style="font-weight:600; font-size:13.5px; color:var(--ink-900);">${escapeHtml(r.title || 'Untitled')}</span>
          <span style="font-size:11.5px; color:var(--ink-500);">${escapeHtml(r.sub || '')}</span>
        </span>
        <span style="display:flex; gap:8px; align-items:center;">
          ${r.category ? categoryBadge(r.category) : ''}
          <span class="badge badge-muted">${escapeHtml(r.type)}</span>
        </span>
      </button>`).join('')}
  </div>`;
}

function bindSearchResultClicks() {
  document.querySelectorAll('.search-result-item').forEach(btn => {
    btn.onmouseenter = () => btn.style.background = 'var(--indigo-50)';
    btn.onmouseleave = () => btn.style.background = 'none';
    btn.onclick = () => {
      const route = btn.getAttribute('data-route');
      closeSearchPalette();
      navigate(route);
    };
  });
}

function closeSearchPalette() {
  const overlay = document.getElementById('search-palette-overlay');
  if (overlay) {
    document.removeEventListener('keydown', overlay._escHandler);
    overlay.remove();
  }
  document.body.classList.remove('modal-open');
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', async (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (!SEARCH_INDEX) await buildSearchIndex();
      openSearchPalette('');
    }
  });
}

/** ================= Regular vendor contacts ================= */
const FREQUENT_VENDOR_EXCLUDES = new Set([
  'amazon', 'vendor name', 'vender name', 'na', 'n/a', 'none', 'nil', 'test', 'sample'
]);

function isUsableVendorContact(v) {
  const name = String(v?.vendorName || '').trim();
  const phone = String(v?.phones?.find(p => /\d{8,}/.test(String(p || ''))) || '').trim();
  if (!name || FREQUENT_VENDOR_EXCLUDES.has(name.toLowerCase())) return false;
  if (!phone || /^https?:\/\//i.test(phone)) return false;
  return true;
}

async function getFrequentVendorContacts() {
  const vendors = await db.getAll('vendors');
  const categories = (window.SEED_DATA?.categories || []).filter(Boolean);
  const selected = [];
  const selectedEntryKeys = new Set();
  const usedVendorNames = new Set();

  const buildMatches = (category) => vendors
    .filter(v => Array.isArray(v.categories) && v.categories.includes(category) && isUsableVendorContact(v))
    .map(v => ({
      ...v,
      phone: String(v.phones?.find(p => /\d{8,}/.test(String(p || ''))) || '').trim(),
      location: String(v.locations?.find(x => x && !/^n\/?a$/i.test(String(x).trim())) || '').trim(),
    }))
    .sort((a, b) => {
      const scoreA = (Number(a.recordCount) || 0) * 100 + (a.location ? 10 : 0) + (a.productLines?.length || 0);
      const scoreB = (Number(b.recordCount) || 0) * 100 + (b.location ? 10 : 0) + (b.productLines?.length || 0);
      return scoreB - scoreA || a.vendorName.localeCompare(b.vendorName);
    });

  // Keep the top 1–2 contacts per category first.
  categories.forEach(category => {
    buildMatches(category).slice(0, 2).forEach(v => {
      const key = `${String(v.vendorName).trim().toLowerCase()}|${category.toLowerCase()}`;
      if (selectedEntryKeys.has(key)) return;
      selectedEntryKeys.add(key);
      selected.push({ ...v, category });
      usedVendorNames.add(String(v.vendorName).trim().toLowerCase());
    });
  });

  // Add 10 more distinct vendors, prioritising vendors with more records.
  let added = 0;
  for (const category of categories) {
    if (added >= 10) break;
    for (const v of buildMatches(category).slice(2)) {
      const vendorKey = String(v.vendorName).trim().toLowerCase();
      if (usedVendorNames.has(vendorKey)) continue;
      usedVendorNames.add(vendorKey);
      selected.push({ ...v, category });
      added += 1;
      if (added >= 10) break;
    }
  }

  // Enrich contacts with email/address information from vendor-matrix records.
  try {
    const records = (await db.getAll('vendorMatrix')).filter(r => !r.deletedAt);
    const byVendor = new Map();
    records.forEach(r => {
      const raw = r.rawRecord || {};
      const normalized = r.normalized || {};
      const name = String(normalized.vendorName || raw.Vendor || raw['Vendor Name'] || '').trim().toLowerCase();
      if (!name) return;
      const entry = byVendor.get(name) || { emails: new Set(), phones: new Set(), locations: new Set() };
      Object.entries(raw).forEach(([key, value]) => {
        const k = key.toLowerCase();
        const val = String(value ?? '').trim();
        if (!val || /^(n\/?a|none|nil)$/i.test(val)) return;
        if (k.includes('mail') && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) entry.emails.add(val);
        if (/(contact|phone|mobile|tel)/.test(k) && /\d{8,}/.test(val)) entry.phones.add(val);
        if (/(location|address|city)/.test(k) && val.length > 2) entry.locations.add(val);
      });
      byVendor.set(name, entry);
    });
    selected.forEach(v => {
      const extra = byVendor.get(String(v.vendorName).trim().toLowerCase());
      v.email = extra ? [...extra.emails][0] || '' : '';
      if (!v.phone && extra) v.phone = [...extra.phones][0] || '';
      if (!v.location && extra) v.location = [...extra.locations][0] || '';
    });
  } catch (err) {
    console.warn('Could not enrich regular vendor contact details:', err);
  }

  return selected;
}

function showRegularVendorDetails(vendor) {
  const phone = String(vendor.phone || '').trim();
  const email = String(vendor.email || '').trim();
  const location = String(vendor.location || '').trim();
  const products = (vendor.productLines || []).filter(Boolean).slice(0, 8);
  openModal({
    title: vendor.vendorName || 'Vendor Contact',
    size: 'sm',
    bodyHtml: `
      <div class="regular-vendor-detail">
        <div class="regular-vendor-detail-head">
          <div class="contact-avatar">${escapeHtml(String(vendor.vendorName || 'V').split(/\s+/).filter(Boolean).slice(0,2).map(x => x[0]).join('').toUpperCase())}</div>
          <div><strong>${escapeHtml(vendor.vendorName || 'Vendor')}</strong><div>${categoryBadge(vendor.category)}</div></div>
        </div>
        <div class="regular-vendor-detail-grid">
          <div><small>Mobile</small><b>${phone ? escapeHtml(phone) : '<span class="na">Not available</span>'}</b></div>
          <div><small>Email</small><b>${email ? escapeHtml(email) : '<span class="na">Not available</span>'}</b></div>
          <div><small>Location</small><b>${location ? escapeHtml(location) : '<span class="na">Not available</span>'}</b></div>
          <div><small>Records</small><b>${escapeHtml(String(vendor.recordCount || 1))} related records</b></div>
        </div>
        ${products.length ? `<div class="regular-vendor-products"><small>Products / Services</small><div>${products.map(x => `<span>${escapeHtml(x)}</span>`).join('')}</div></div>` : ''}
      </div>`,
    footerHtml: `${phone ? `<a class="btn btn-primary" href="tel:${escapeHtml(phone.replace(/[^\d+]/g, ''))}">☎ Call Vendor</a>` : ''}${email ? `<a class="btn btn-secondary" href="mailto:${escapeHtml(email)}">✉ Email Vendor</a>` : ''}<button class="btn btn-ghost" onclick="closeModal()">Close</button>`
  });
}

function frequentVendorPanelHtml(items) {
  const groups = new Map();
  items.forEach(v => {
    if (!groups.has(v.category)) groups.set(v.category, []);
    groups.get(v.category).push(v);
  });
  const body = [...groups.entries()].map(([category, vendors]) => `
    <section class="frequent-vendor-group">
      <div class="frequent-vendor-category">${escapeHtml(category)}</div>
      ${vendors.map(v => `
        <div class="frequent-vendor-row">
          <div class="frequent-vendor-avatar">${escapeHtml(String(v.vendorName).split(/\s+/).filter(Boolean).slice(0,2).map(x => x[0]).join('').toUpperCase() || 'V')}</div>
          <button class="frequent-vendor-main frequent-vendor-details-btn" type="button" title="View contact details">
            <strong>${escapeHtml(v.vendorName)}</strong>
            <small>${escapeHtml((v.productLines || []).slice(0,2).join(' • ') || 'Vendor contact')}</small>
          </button>
          <a class="frequent-vendor-call" href="tel:${escapeHtml(String(v.phone || '').replace(/[^\d+]/g, ''))}" title="Call ${escapeHtml(v.vendorName)}">☎</a>
        </div>`).join('')}
    </section>`).join('');

  return `
    <div class="frequent-vendors-panel" id="frequent-vendors-panel" role="dialog" aria-label="Regular vendor contacts">
      <div class="frequent-vendors-head">
        <div><strong>Regular Vendor Contacts</strong><small>Top recurring contacts by category</small></div>
        <button class="icon-btn" id="frequent-vendors-close" aria-label="Close">✕</button>
      </div>
      <div class="frequent-vendors-body">${body || emptyState({icon:'☎',title:'No vendor contacts',message:'No usable recurring vendor contacts were found.'})}</div>
      <div class="frequent-vendors-foot"><button class="btn btn-secondary btn-sm" id="frequent-vendors-all">View all vendor contacts →</button></div>
    </div>`;
}

async function toggleFrequentVendorsPanel(e) {
  e?.stopPropagation();
  const existing = document.getElementById('frequent-vendors-panel');
  if (existing) {
    closeFrequentVendorsPanel();
    return;
  }
  const btn = document.getElementById('frequent-vendors-btn');
  if (!btn) return;
  const items = await getFrequentVendorContacts();
  const host = document.createElement('div');
  host.innerHTML = frequentVendorPanelHtml(items);
  const panel = host.firstElementChild;
  document.body.appendChild(panel);
  const rect = btn.getBoundingClientRect();
  const right = Math.max(12, window.innerWidth - rect.right);
  panel.style.top = `${Math.round(rect.bottom + 10)}px`;
  panel.style.right = `${Math.round(right)}px`;
  btn.setAttribute('aria-expanded', 'true');
  document.getElementById('frequent-vendors-close').onclick = closeFrequentVendorsPanel;
  panel.querySelectorAll('.frequent-vendor-details-btn').forEach(el => el.addEventListener('click', () => {
    const vendorName = el.querySelector('strong')?.textContent || '';
    const category = el.closest('.frequent-vendor-group')?.querySelector('.frequent-vendor-category')?.textContent || '';
    const vendor = items.find(v => v.vendorName === vendorName && v.category === category) || items.find(v => v.vendorName === vendorName);
    if (vendor) showRegularVendorDetails(vendor);
  }));
  document.getElementById('frequent-vendors-all').onclick = () => { closeFrequentVendorsPanel(); navigate('contacts'); };
  requestAnimationFrame(() => panel.classList.add('show'));
  setTimeout(() => document.addEventListener('click', frequentVendorOutsideClick, { once: true }), 0);
}

function frequentVendorOutsideClick(e) {
  const panel = document.getElementById('frequent-vendors-panel');
  const btn = document.getElementById('frequent-vendors-btn');
  if (!panel || panel.contains(e.target) || btn?.contains(e.target)) return;
  closeFrequentVendorsPanel();
}

function closeFrequentVendorsPanel() {
  document.getElementById('frequent-vendors-panel')?.remove();
  document.getElementById('frequent-vendors-btn')?.setAttribute('aria-expanded', 'false');
}

async function updateFrequentVendorsCount() {
  try {
    const items = await getFrequentVendorContacts();
    const count = document.getElementById('frequent-vendors-count');
    if (count) count.textContent = items.length;
  } catch (err) {
    console.warn('Could not calculate regular vendor contacts:', err);
  }
}

/** ================= Activity panel ================= */
async function showActivityPanel() {
  const log = (await db.getAll('auditLog')).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 60);
  openModal({
    title: 'Recent activity',
    size: 'lg',
    bodyHtml: log.length ? `
      <div class="table-wrap" style="border:none;">
        <table class="data-table">
          <thead><tr><th>Action</th><th>Entity</th><th>User</th><th>When</th></tr></thead>
          <tbody>
            ${log.map(l => `
              <tr>
                <td>${statusBadge(l.action)}</td>
                <td>${escapeHtml(l.entityType)} <span class="mono muted">${escapeHtml(String(l.entityId).slice(0,12))}</span></td>
                <td>${escapeHtml(l.user)}</td>
                <td>${timeAgo(l.timestamp)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>` : emptyState({ icon: '🔔', title: 'No activity yet', message: 'Actions like edits, imports, and deletions will show up here.' }),
  });
}

document.addEventListener('DOMContentLoaded', boot);
