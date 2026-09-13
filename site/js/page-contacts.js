const VendorContactsState = { search: '', category: '', page: 1, pageSize: 24 };

PAGE_RENDERERS.contacts = async function (root) {
  if (db.ready) await db.ready;
  await renderVendorContacts(root);
};

async function renderVendorContacts(root) {
  const records = (await db.getAll('vendorMatrix')).filter(r => !r.deletedAt);
  const imported = await loadImportedVendorContacts();
  const contacts = mergeVendorContacts(dedupeVendorContacts(records), imported);
  const categories = [...new Set(contacts.map(r => r.category).filter(Boolean))].sort();
  const q = VendorContactsState.search.toLowerCase().trim();
  const filtered = contacts.filter(r => {
    if (VendorContactsState.category && r.category !== VendorContactsState.category) return false;
    if (!q) return true;
    return [r.vendorName, r.mobile, r.email, r.location, r.category].some(v => String(v || '').toLowerCase().includes(q));
  }).sort((a, b) => String(a.vendorName).localeCompare(String(b.vendorName)));
  const { pageItems, total, totalPages, page } = paginate(filtered, VendorContactsState.page, VendorContactsState.pageSize);
  VendorContactsState.page = page;

  root.innerHTML = `
    <div class="contacts-hero">
      <div>
        <div class="eyebrow">RELATIONSHIP DIRECTORY</div>
        <h2>Vendor Contacts</h2>
        <div class="section-sub">A focused directory of ${contacts.length.toLocaleString('en-IN')} unique vendor contacts, organized for quick outreach and discovery.</div>
      </div>
      <div class="contacts-hero-stat"><span>${filtered.length.toLocaleString('en-IN')}</span><small>matching contacts</small></div>
    </div>
    <div class="contacts-toolbar">
      <label class="contacts-search"><span>⌕</span><input id="vc-search" type="search" placeholder="Search name, mobile, email, location…" value="${escapeHtml(VendorContactsState.search)}"></label>
      <select id="vc-category"><option value="">All categories</option>${categories.map(c => `<option value="${escapeHtml(c)}" ${VendorContactsState.category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}</select>
      <select id="vc-pagesize">${[12, 24, 48].map(n => `<option value="${n}" ${VendorContactsState.pageSize === n ? 'selected' : ''}>${n} / page</option>`).join('')}</select>
      ${(VendorContactsState.search || VendorContactsState.category) ? '<button class="btn btn-ghost btn-sm" id="vc-clear">Clear filters</button>' : ''}
    </div>
    <div class="contacts-summary"><span><b>${filtered.length.toLocaleString('en-IN')}</b> contacts shown</span><span>Search includes vendor name, mobile, email, location, and category</span></div>
    <div id="vc-list"></div>
  `;

  updateVendorContactsResults(root, contacts);

  const searchInput = document.getElementById('vc-search');
  searchInput.oninput = debounce(e => {
    VendorContactsState.search = e.target.value;
    VendorContactsState.page = 1;
    updateVendorContactsResults(root, contacts);
  }, 160);
  document.getElementById('vc-category').onchange = e => { VendorContactsState.category = e.target.value; VendorContactsState.page = 1; renderVendorContacts(root); };
  document.getElementById('vc-pagesize').onchange = e => { VendorContactsState.pageSize = Number(e.target.value); VendorContactsState.page = 1; renderVendorContacts(root); };
  document.getElementById('vc-clear')?.addEventListener('click', () => { VendorContactsState.search = ''; VendorContactsState.category = ''; VendorContactsState.page = 1; renderVendorContacts(root); });
}

function updateVendorContactsResults(root, contacts) {
  const q = VendorContactsState.search.toLowerCase().trim();
  const filtered = contacts.filter(r => {
    if (VendorContactsState.category && r.category !== VendorContactsState.category) return false;
    if (!q) return true;
    return [r.vendorName, r.mobile, r.email, r.location, r.category].some(v => String(v || '').toLowerCase().includes(q));
  }).sort((a, b) => String(a.vendorName).localeCompare(String(b.vendorName)));
  const { pageItems, total, totalPages, page } = paginate(filtered, VendorContactsState.page, VendorContactsState.pageSize);
  VendorContactsState.page = page;

  const stat = root.querySelector('.contacts-hero-stat span');
  if (stat) stat.textContent = filtered.length.toLocaleString('en-IN');
  const summary = root.querySelector('.contacts-summary');
  if (summary) summary.innerHTML = `<span><b>${filtered.length.toLocaleString('en-IN')}</b> contacts shown</span><span>Search includes vendor name, mobile, email, location, and category</span>`;

  const list = root.querySelector('#vc-list');
  if (!list) return;
  if (!pageItems.length) {
    list.innerHTML = emptyState({ icon: '⌕', title: 'No contacts found', message: 'Try another search term or clear the category filter.' });
  } else {
    list.innerHTML = `<div class="contact-grid">${pageItems.map(contactCardHtml).join('')}</div>${paginationControlsHtml(page, totalPages, total, 'vc')}`;
    list.querySelectorAll('[data-contact-id]').forEach(card => card.onclick = () => {
      const id = card.dataset.contactId;
      const record = contacts.find(c => c.id === id);
      if (record?.sourceRecordId) openRecordDetail('vendorMatrix', record.sourceRecordId, () => renderVendorContacts(root));
    });
  }
  bindPagination(list, VendorContactsState, () => renderVendorContacts(root));
}

async function loadImportedVendorContacts() {
  try {
    const response = await fetch('assets/vendor-contacts-import.json?v=20260911');
    if (!response.ok) return [];
    const payload = await response.json();
    return (payload.records || []).map(r => ({ ...r, sourceRecordId: '' }));
  } catch (err) {
    console.warn('Imported vendor contacts could not be loaded:', err);
    return [];
  }
}

function mergeVendorContacts(existing, imported) {
  const output = [...existing];
  const keys = new Set(output.map(contactKey));
  imported.forEach(contact => {
    const key = contactKey(contact);
    if (keys.has(key)) return;
    keys.add(key);
    output.push(contact);
  });
  return output;
}

function contactKey(contact) {
  return [contact.vendorName, contact.mobile, contact.email, contact.location, contact.category]
    .map(v => String(v || '').trim().toLowerCase()).join('|');
}

function dedupeVendorContacts(records) {
  const map = new Map();
  records.forEach(r => {
    const raw = r.rawRecord || {};
    const n = r.normalized || {};
    const pick = (...values) => values.find(v => v !== undefined && v !== null && String(v).trim() !== '') || '';
    const pickPhone = (...values) => values.find(v => /(?:\+?\d[\d\s().-]{7,}\d)/.test(String(v || ''))) || '';
    const pickEmail = (...values) => values.find(v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim())) || '';
    const pickLocation = (...values) => values.find(v => {
      const text = String(v || '').trim();
      return text.length > 2 && /[A-Za-z]/.test(text) && !/^\d+(?:\.\d+)?$/.test(text);
    }) || '';
    const contact = {
      id: r.id,
      sourceRecordId: r.id,
      vendorName: pick(n.vendorName, raw.vendorName, raw.Vendor, raw['Vendor Name'], r.productLine, 'Unnamed vendor'),
      mobile: pickPhone(n.phone, raw.Phone, raw.phone, raw.Mobile, raw.mobile),
      email: pickEmail(n.email, raw.Email, raw.email),
      location: pickLocation(n.address, raw.Address, raw.address, raw.Location, raw.location),
      category: r.category || '',
      productLine: r.productLine || '',
    };
    const key = [contact.vendorName, contact.mobile, contact.email, contact.location, contact.category].map(v => String(v).trim().toLowerCase()).join('|');
    if (!map.has(key)) map.set(key, contact);
    else if (!map.get(key).mobile && contact.mobile) map.get(key).mobile = contact.mobile;
  });
  return [...map.values()];
}

function contactCardHtml(c) {
  const initials = String(c.vendorName).split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
  return `<article class="contact-card" data-contact-id="${escapeHtml(c.id)}" tabindex="0" title="Open vendor record">
    <div class="contact-card-head"><div class="contact-avatar">${escapeHtml(initials || 'V')}</div><div class="contact-name"><h3>${escapeHtml(c.vendorName)}</h3><span>${escapeHtml(c.productLine || 'Vendor record')}</span></div></div>
    <div class="contact-fields">
      <div class="contact-field"><span class="contact-field-icon">☎</span><div><small>Mobile</small><b>${c.mobile ? escapeHtml(c.mobile) : '<span class="na">Not available</span>'}</b></div></div>
      <div class="contact-field"><span class="contact-field-icon">✉</span><div><small>Email</small><b>${c.email ? escapeHtml(c.email) : '<span class="na">Not available</span>'}</b></div></div>
      <div class="contact-field"><span class="contact-field-icon">⌖</span><div><small>Location</small><b>${c.location ? escapeHtml(c.location) : '<span class="na">Not available</span>'}</b></div></div>
    </div>
    <div class="contact-card-foot">${categoryBadge(c.category)}<span class="contact-open">View record ↗</span></div>
  </article>`;
}
