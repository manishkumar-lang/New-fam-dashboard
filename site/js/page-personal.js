const PersonalPageState = { connections: [], data: null, timer: null, activeTab: 'workspace' };

function personalCredential() { return window.WVAuth?.getCredential?.() || ''; }
async function personalApi(method='GET', body=null) {
  const credential = personalCredential();
  if (!credential) throw new Error('Please sign in again to access your personal workspace.');
  const res = await fetch('/.netlify/functions/personal-data', {
    method, cache:'no-store', headers:{ Authorization:`Bearer ${credential}`, ...(body ? {'Content-Type':'application/json'} : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(payload.error || `Personal workspace request failed (${res.status})`);
  return payload;
}

PAGE_RENDERERS.personal = async function(root) {
  clearInterval(PersonalPageState.timer);
  root.innerHTML = `<div class="panel"><div class="skeleton" style="height:260px"></div></div>`;
  try {
    await renderPersonal(root);
    PersonalPageState.timer = setInterval(() => refreshPersonal(root, true), 120000);
  } catch (e) {
    root.innerHTML = `<div class="panel"><div class="empty-state"><div class="empty-icon">⚠</div><h3>Personal workspace unavailable</h3><p>${escapeHtml(e.message)}</p><button class="btn btn-primary btn-sm" id="personal-retry">Retry</button></div></div>`;
    document.getElementById('personal-retry').onclick = () => renderPersonal(root);
  }
};

async function renderPersonal(root) {
  const payload = await personalApi('GET');
  PersonalPageState.data = payload;
  PersonalPageState.connections = payload.connections || [];
  const user = payload.user || window.WVAuth?.user || {};
  const rows = (payload.sheets || []).reduce((n,s)=>n+(s.totalRows||0),0);
  const tabs = (payload.sheets || []).reduce((n,s)=>n+(s.tabs?.length||0),0);
  const hasConnections = PersonalPageState.connections.length > 0;
  root.innerHTML = `
    <div class="personal-hero">
      <div class="personal-profile-main">
        <img class="personal-avatar-lg" src="${escapeHtml(user.picture || '')}" alt="" onerror="this.style.display='none'">
        <div><div class="eyebrow">PERSONAL WORKSPACE</div><h2>${escapeHtml(user.name || 'Google User')}</h2><p>${escapeHtml(user.email || '')}</p><span class="personal-verified">✓ Verified Wellversed account</span></div>
      </div>
      <div class="personal-hero-actions"><button class="btn btn-primary btn-sm" id="personal-refresh">↻ Refresh now</button></div>
    </div>

    <div class="personal-tabs">
      <button class="personal-tab active" data-ptab="workspace">My Dashboard</button>
      <button class="personal-tab" data-ptab="profile">My Profile</button>
      <button class="personal-tab" data-ptab="settings">Settings</button>
    </div>
    <div id="personal-tab-content"></div>`;

  const renderTab = tab => {
    PersonalPageState.activeTab = tab;
    document.querySelectorAll('.personal-tab').forEach(b=>b.classList.toggle('active',b.dataset.ptab===tab));
    const host=document.getElementById('personal-tab-content');
    if(tab==='workspace') renderPersonalWorkspace(host,payload,rows,tabs);
    if(tab==='profile') renderPersonalProfile(host,user);
    if(tab==='settings') renderPersonalSettings(host,payload);
  };
  document.querySelectorAll('.personal-tab').forEach(b=>b.onclick=()=>renderTab(b.dataset.ptab));
  document.getElementById('personal-refresh').onclick=()=>refreshPersonal(root,false);
  renderTab(PersonalPageState.activeTab || 'workspace');
}

function renderPersonalWorkspace(host,payload,totalRows,totalTabs) {
  const connections=payload.connections||[];
  host.innerHTML = `
    <div class="kpi-grid personal-kpis">
      <div class="kpi-card"><div class="kpi-icon" style="background:var(--wv-teal)">▦</div><div class="kpi-value">${connections.length}</div><div class="kpi-label">Connected Sheets</div></div>
      <div class="kpi-card"><div class="kpi-icon" style="background:#4f46e5">⌁</div><div class="kpi-value">${totalTabs.toLocaleString('en-IN')}</div><div class="kpi-label">Sheet Tabs</div></div>
      <div class="kpi-card"><div class="kpi-icon" style="background:#8b5cf6">≡</div><div class="kpi-value">${totalRows.toLocaleString('en-IN')}</div><div class="kpi-label">Rows Available</div></div>
      <div class="kpi-card"><div class="kpi-icon" style="background:#f59e0b">↻</div><div class="kpi-value" style="font-size:16px">${payload.generatedAt ? timeAgo(payload.generatedAt) : '—'}</div><div class="kpi-label">Last Sync</div></div>
    </div>
    <div class="panel personal-connect-panel">
      <div class="panel-title"><span>My Google Sheets</span><span class="badge badge-muted">Private to your account</span></div>
      <p class="muted personal-help">Add a Google Sheet below. The dashboard reads it only for the Google account that connected it. To allow the secure backend to read the sheet, share the sheet with <b>${escapeHtml(payload.serviceAccountEmail || 'the Wellversed service account')}</b> as <b>Viewer</b>.</p>
      <div class="personal-add-grid">
        <input id="personal-sheet-url" type="text" placeholder="Paste Google Sheet URL or Sheet ID">
        <input id="personal-sheet-label" type="text" placeholder="Label (e.g. My Procurement Tracker)">
        <button class="btn btn-primary" id="personal-add">+ Add Sheet</button>
      </div>
      <div class="personal-share-note">🔐 Your sheet URL is stored against your Google email. Other signed-in users cannot read or manage your connection.</div>
    </div>
    <div class="personal-sheet-list">
      ${connections.length ? connections.map(c=>personalConnectionCard(c,payload)).join('') : `<div class="panel"><div class="empty-state"><div class="empty-icon">▤</div><h3>No personal sheet connected</h3><p>Add your private Google Sheet above to create your personal dashboard.</p></div></div>`}
    </div>
    ${(payload.errors||[]).length ? `<div class="panel personal-error-panel"><div class="panel-title">Sheet access warnings</div>${payload.errors.map(e=>`<div class="personal-error-row"><b>${escapeHtml(e.label||e.sheetId)}</b><span>${escapeHtml(e.error)}</span></div>`).join('')}</div>` : ''}
  `;
  document.getElementById('personal-add').onclick=async()=>{
    const sheetUrl=document.getElementById('personal-sheet-url').value.trim();
    const label=document.getElementById('personal-sheet-label').value.trim() || 'My Personal Sheet';
    if(!sheetUrl){toast('Paste a Google Sheet URL or Sheet ID first.','warning');return;}
    const btn=document.getElementById('personal-add'); btn.disabled=true; btn.textContent='Connecting…';
    try { await personalApi('POST',{sheetUrl,label}); toast('Personal sheet connected.','success'); await renderPersonal(document.getElementById('page-root')); }
    catch(e){toast(e.message,'error');btn.disabled=false;btn.textContent='+ Add Sheet';}
  };
  document.querySelectorAll('[data-personal-remove]').forEach(btn=>btn.onclick=async()=>{
    const sid=btn.dataset.personalRemove; if(!confirm('Disconnect this personal sheet?')) return;
    try { await personalApi('DELETE',{sheetId:sid}); toast('Sheet disconnected.','success'); await renderPersonal(document.getElementById('page-root')); }
    catch(e){toast(e.message,'error');}
  });
}

function personalConnectionCard(c,payload) {
  const sheet= (payload.sheets||[]).find(s=>s.sheetId===c.sheetId);
  return `<div class="panel personal-sheet-card">
    <div class="personal-sheet-head"><div><div class="eyebrow">CONNECTED SHEET</div><h3>${escapeHtml(c.label || sheet?.title || 'Personal Sheet')}</h3><a href="${escapeHtml(c.url)}" target="_blank" rel="noopener">Open in Google Sheets ↗</a></div><button class="btn btn-danger btn-sm" data-personal-remove="${escapeHtml(c.sheetId)}">Disconnect</button></div>
    ${sheet ? `<div class="personal-sheet-meta"><span>${sheet.totalRows.toLocaleString('en-IN')} rows</span><span>${sheet.tabs.length} tabs</span><span>Synced ${timeAgo(payload.generatedAt)}</span></div>${sheet.tabs.map(tab=>personalTabPreview(tab)).join('')}` : `<div class="personal-error-row">Sheet could not be read. Make sure it is shared with the service account as Viewer.</div>`}
  </div>`;
}
function personalTabPreview(tab) {
  const headers=tab.headers||[]; const rows=tab.rows||[]; const visibleHeaders=headers.slice(0,8);
  return `<div class="personal-table-block"><div class="personal-table-title"><b>${escapeHtml(tab.sheetName)}</b><span>${tab.totalRows.toLocaleString('en-IN')} rows</span></div><div class="table-wrap"><table class="data-table"><thead><tr>${visibleHeaders.map(h=>`<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.slice(0,12).map(r=>`<tr>${visibleHeaders.map((_,i)=>`<td>${escapeHtml(r[i] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${tab.totalRows>12?`<div class="muted" style="font-size:10.5px;margin-top:7px">Showing first 12 rows for a fast personal view.</div>`:''}</div>`;
}
function renderPersonalProfile(host,user) {
  host.innerHTML=`<div class="grid-2"><div class="panel"><div class="panel-title">Google Profile</div><div class="profile-card-large"><img src="${escapeHtml(user.picture||'')}" alt="" onerror="this.style.display='none'"><div><h3>${escapeHtml(user.name||'Google User')}</h3><p>${escapeHtml(user.email||'')}</p><span class="badge badge-success">Verified</span></div></div></div><div class="panel"><div class="panel-title">Privacy</div><div class="detail-grid"><div class="detail-field"><label>Account scope</label><div class="value">${escapeHtml(user.email||'')}</div></div><div class="detail-field"><label>Personal data</label><div class="value">Visible only to the signed-in account.</div></div><div class="detail-field"><label>Authentication</label><div class="value">Google Workspace</div></div></div></div></div>`;
}
function renderPersonalSettings(host,payload) {
  const user=payload.user||{};
  host.innerHTML=`<div class="grid-2"><div class="panel"><div class="panel-title">Display settings</div><div class="detail-grid"><div class="detail-field"><label>Theme</label><div class="value"><button class="btn btn-ghost btn-sm" id="personal-theme">Toggle ${AppState.theme==='dark'?'light':'dark'} mode</button></div></div><div class="detail-field"><label>Auto refresh</label><div class="value">Every 2 minutes while My Workspace is open.</div></div></div></div><div class="panel"><div class="panel-title">Account</div><div class="detail-grid"><div class="detail-field"><label>Signed in as</label><div class="value">${escapeHtml(user.email||'')}</div></div><div class="detail-field"><label>Sign out</label><div class="value"><button class="btn btn-danger btn-sm" id="personal-signout">Sign out securely</button></div></div></div></div></div>`;
  document.getElementById('personal-theme').onclick=()=>document.getElementById('theme-toggle-btn')?.click();
  document.getElementById('personal-signout').onclick=()=>window.WVAuth?.signOut?.();
}
async function refreshPersonal(root,silent=false) {
  try { await renderPersonal(root); if(!silent) toast('Personal workspace refreshed.','success'); }
  catch(e){ if(!silent) toast(e.message,'error'); else console.warn('[Personal]',e); }
}
