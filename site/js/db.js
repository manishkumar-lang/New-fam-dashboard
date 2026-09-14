/**
 * Wellversed FAM DataService
 *
 * Fast-start architecture:
 * Privacy-first architecture:
 * 1) Dashboard data is not rendered or activated until a verified Google user is present.
 * 2) IndexedDB/localStorage opens only after a verified Google user is activated.
 * 3) Persisted data is namespaced to the signed-in email and cleared on account changes.
 * 4) Live Google Sheets data is fetched server-side after authentication.
 *
 * This prevents a browser/enterprise policy issue with IndexedDB from freezing
 * the entire dashboard at "Loading source data…".
 */
const DB_NAME = 'wellversed_fam_intelligence';
const DB_VERSION = 2;
const STORES = [
  'vendorMatrix', 'solutionMatrix', 'vendors', 'referenceDocs', 'referenceDecisions',
  'knowledgeBaseDocs', 'employees', 'categories', 'projects', 'tasks',
  'auditLog', 'savedFilters', 'settings', 'columnConfig', 'scoringConfig', 'trash'
];

// Last-known-good minimums. These are integrity floors, not hard maximums: live data may grow.
// They prevent a partial Google Sheets response from ever replacing a complete dataset.
const DATA_INTEGRITY_FLOOR = Object.freeze({
  vendorMatrixRecords: 542,
  solutionMatrixRecords: 233,
  distinctVendorCount: 343,
  categoryCount: 7,
  knowledgeBaseDocCount: 165,
  referenceDocCount: 10,
  employeeCount: 17,
});

function dashboardBundleCounts(bundle) {
  const vendorRows = Array.isArray(bundle?.vendorMatrixRecords) ? bundle.vendorMatrixRecords.filter(Boolean) : [];
  const solutionRows = Array.isArray(bundle?.solutionMatrixRecords) ? bundle.solutionMatrixRecords.filter(Boolean) : [];
  const refs = Array.isArray(bundle?.referenceDocs) ? bundle.referenceDocs.filter(Boolean) : [];
  const kb = Array.isArray(bundle?.knowledgeBaseDocs) ? bundle.knowledgeBaseDocs.filter(Boolean) : [];
  const employees = Array.isArray(bundle?.employees) ? bundle.employees.filter(Boolean) : [];
  const categories = Array.isArray(bundle?.categories) ? bundle.categories.filter(Boolean) : [];
  const vendors = Array.isArray(bundle?.vendors) ? bundle.vendors.filter(Boolean) : [];
  return {
    vendorMatrixRecords: vendorRows.length, solutionMatrixRecords: solutionRows.length,
    distinctVendorCount: vendors.length, categoryCount: categories.length,
    knowledgeBaseDocCount: kb.length, referenceDocCount: refs.length, employeeCount: employees.length,
  };
}

function assertDashboardIntegrity(bundle) {
  const counts = dashboardBundleCounts(bundle);
  const missing = Object.entries(DATA_INTEGRITY_FLOOR)
    .filter(([key, floor]) => counts[key] < floor)
    .map(([key, floor]) => `${key} ${counts[key]}/${floor}`);
  if (missing.length) {
    const err = new Error(`Dashboard dataset failed integrity check: ${missing.join(', ')}`);
    err.code = 'DATASET_INTEGRITY_FAILED';
    err.counts = counts;
    throw err;
  }
  return counts;
}

const CATEGORY_COLORS = {
  'Furniture': '#8b5cf6',
  'Safety & Security': '#ef4444',
  'Sanitary & Hygiene': '#06b6d4',
  'IT Infrastructure': '#4f46e5',
  'Pantry & Hospitality': '#f59e0b',
  'Facility & Wellness': '#10b981',
  'Uncategorized / General Procurement': '#64748b',
  'Reference / Source Documents': '#0ea5e9',
};

function emptyStores() {
  const x = {};
  STORES.forEach(s => { x[s] = []; });
  return x;
}

function categoryRows(categories) {
  return (categories || []).map((c, i) => ({
    id: 'cat_' + i,
    name: c,
    description: '',
    color: CATEGORY_COLORS[c] || '#6366f1',
    order: i,
  }));
}

class DataService {
  constructor() {
    this.db = null;
    this.mode = 'memory';
    this.memory = emptyStores();
    this.local = emptyStores();
    this.ready = Promise.resolve();
    this.persistenceReady = Promise.resolve(false);
    this._localSaveTimer = null;
    this.currentUserEmail = '';
    this.userActivated = false;
    this.persistenceStarted = false;
    // Privacy-first: bundled baseline data is never hydrated before a verified
    // Google user is activated. Persistence is opened only after login.
  }

  async activateForUser(email) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized) throw new Error('A verified Google account is required.');
    if (this.userActivated && this.currentUserEmail === normalized) return true;
    this.currentUserEmail = normalized;
    this.userActivated = true;
    this.memory = emptyStores();
    this.local = emptyStores();
    if (!this.persistenceStarted) {
      this.persistenceStarted = true;
      await this._openPersistence(normalized);
    } else if (this.db || this.mode === 'local') {
      const owner = this.mode === 'idb' ? await this._idbGet('settings', 'owner') : this._getLocalOwner();
      if (owner?.email !== normalized) await this.clearSessionData(false);
    }
    return true;
  }

  _getLocalOwner() {
    try { return JSON.parse(localStorage.getItem(DB_NAME + '_owner') || 'null'); } catch (_) { return null; }
  }

  async clearSessionData(resetOwner = true) {
    this.memory = emptyStores();
    if (this.mode === 'idb' && this.db) {
      await Promise.all(STORES.map(s => this._idbClear(s)));
      if (resetOwner) await this._idbPut('settings', { id:'owner', email:this.currentUserEmail || '' });
    } else if (this.mode === 'local') {
      try { localStorage.removeItem(DB_NAME + '_data'); if (resetOwner) localStorage.setItem(DB_NAME + '_owner', JSON.stringify({email:this.currentUserEmail || ''})); } catch (_) {}
    }
    this.memory.settings = resetOwner ? [{id:'owner',email:this.currentUserEmail || ''}] : [];
  }

  _hydrateBundle(bundle) {
    if (!bundle || !Array.isArray(bundle.vendorMatrixRecords)) return;
    this.memory.vendorMatrix = bundle.vendorMatrixRecords.slice();
    this.memory.solutionMatrix = (bundle.solutionMatrixRecords || []).slice();
    this.memory.vendors = (bundle.vendors || []).slice();
    this.memory.referenceDocs = (bundle.referenceDocs || []).slice();
    this.memory.knowledgeBaseDocs = (bundle.knowledgeBaseDocs || []).slice();
    this.memory.employees = (bundle.employees || []).slice();
    this.memory.categories = categoryRows(bundle.categories || []);
    if (bundle.categoryMappingReference) {
      const ref = {
        id: bundle.categoryMappingReference.id,
        title: bundle.categoryMappingReference.title,
        docType: bundle.categoryMappingReference.docType,
        category: 'Reference / Source Documents',
        categorySource: 'source_document',
        tabs: bundle.categoryMappingReference.tabs,
        source: bundle.categoryMappingReference.source,
        lastUpdated: bundle.meta?.generatedAt || new Date().toISOString(),
        deletedAt: null,
      };
      const exists = this.memory.referenceDocs.some(x => x.id === ref.id);
      if (!exists) this.memory.referenceDocs.push(ref);
    }
    this.memory.settings = [{
      id: 'seedStatus',
      seeded: true,
      seededAt: new Date().toISOString(),
      meta: bundle.meta || {},
      remote: !!bundle.meta?.remote,
    }];
  }

  async _openPersistence(userEmail = this.currentUserEmail) {
    // file:// and restricted profiles should not block the dashboard.
    if (!window.indexedDB || location.protocol === 'file:') {
      this._activateLocalFallback(userEmail);
      return;
    }

    this.persistenceReady = new Promise(resolve => {
      let settled = false;
      const done = value => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };
      const timer = setTimeout(() => {
        console.warn('[DataService] IndexedDB startup timed out; using local persistence fallback.');
        this._activateLocalFallback(userEmail);
        done(false);
      }, 1800);

      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = e => {
          const idb = e.target.result;
          STORES.forEach(name => {
            if (!idb.objectStoreNames.contains(name)) idb.createObjectStore(name, { keyPath: 'id' });
          });
        };
        req.onerror = () => {
          console.warn('[DataService] IndexedDB unavailable; using local persistence fallback.');
          this._activateLocalFallback(userEmail);
          done(false);
        };
        req.onblocked = () => {
          console.warn('[DataService] IndexedDB blocked; using local persistence fallback.');
          this._activateLocalFallback(userEmail);
          done(false);
        };
        req.onsuccess = async e => {
          // The startup timeout may already have switched the app to the local
          // fallback. In that case close the late IndexedDB handle instead of
          // allowing a second persistence mode to race with the fallback.
          if (settled) {
            try { e.target.result.close(); } catch (_) {}
            return;
          }
          this.db = e.target.result;
          this.db.onversionchange = () => this.db.close();
          this.mode = 'idb';
          try {
            const owner = await this._idbGet('settings', 'owner');
            if (owner?.email === userEmail) {
              const loaded = await Promise.all(STORES.map(s => this._idbGetAll(s)));
              STORES.forEach((s, i) => { this.memory[s] = loaded[i]; });
            } else {
              await Promise.all(STORES.map(s => this._idbClear(s)));
              this.memory = emptyStores();
              await this._idbPut('settings', { id:'owner', email:userEmail });
            }
            this.memory.settings = this.memory.settings.filter(x => x.id !== 'owner');
            this.memory.settings.push({ id:'owner', email:userEmail });
          } catch (err) {
            console.warn('[DataService] Secure IndexedDB user hydrate failed; starting empty.', err);
            this.memory = emptyStores();
            await Promise.all(STORES.map(s => this._idbClear(s)));
            await this._idbPut('settings', { id:'owner', email:userEmail });
          }
          done(true);
        };
      } catch (err) {
        console.warn('[DataService] IndexedDB exception; using local persistence fallback.', err);
        this._activateLocalFallback(userEmail);
        done(false);
      }
    });
  }

  _activateLocalFallback(userEmail = this.currentUserEmail) {
    this.mode = 'local';
    try {
      const owner = this._getLocalOwner();
      if (owner?.email === userEmail) {
        const raw = localStorage.getItem(DB_NAME + '_data');
        if (raw) {
          const parsed = JSON.parse(raw);
          STORES.forEach(s => { if (Array.isArray(parsed[s])) this.memory[s] = parsed[s]; });
        }
      } else {
        localStorage.removeItem(DB_NAME + '_data');
      }
      localStorage.setItem(DB_NAME + '_owner', JSON.stringify({email:userEmail}));
      this.memory.settings = this.memory.settings.filter(x => x.id !== 'owner');
      this.memory.settings.push({ id:'owner', email:userEmail });
      this.local = this.memory;
      this._saveLocal();
    } catch (e) {
      console.warn('[DataService] localStorage unavailable; memory-only mode.', e);
      this.mode = 'memory';
      this.memory = emptyStores();
    }
  }

  _saveLocal() {
    if (this.mode !== 'local') return;
    clearTimeout(this._localSaveTimer);
    this._localSaveTimer = setTimeout(() => {
      try { localStorage.setItem(DB_NAME + '_data', JSON.stringify(this.memory)); }
      catch (e) { console.warn('[DataService] localStorage save failed; memory-only mode.', e); this.mode = 'memory'; }
    }, 250);
  }

  async _idbGet(store, id) {
    return new Promise(resolve => {
      try {
        const req = this.db.transaction(store, 'readonly').objectStore(store).get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (_) { resolve(null); }
    });
  }

  async _idbGetAll(store) {
    return new Promise(resolve => {
      try {
        const req = this.db.transaction(store, 'readonly').objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch (_) { resolve([]); }
    });
  }

  _idbPut(store, obj) {
    if (!this.db) return Promise.resolve();
    return new Promise(resolve => {
      try {
        const req = this.db.transaction(store, 'readwrite').objectStore(store).put(obj);
        req.onsuccess = req.onerror = () => resolve();
      } catch (_) { resolve(); }
    });
  }

  _idbDelete(store, id) {
    if (!this.db) return Promise.resolve();
    return new Promise(resolve => {
      try {
        const req = this.db.transaction(store, 'readwrite').objectStore(store).delete(id);
        req.onsuccess = req.onerror = () => resolve();
      } catch (_) { resolve(); }
    });
  }

  _idbClear(store) {
    if (!this.db) return Promise.resolve();
    return new Promise(resolve => {
      try {
        const req = this.db.transaction(store, 'readwrite').objectStore(store).clear();
        req.onsuccess = req.onerror = () => resolve();
      } catch (_) { resolve(); }
    });
  }

  _idbBulkPut(store, arr) {
    if (!this.db || !arr?.length) return Promise.resolve();
    return new Promise(resolve => {
      try {
        const tx = this.db.transaction(store, 'readwrite');
        const os = tx.objectStore(store);
        arr.forEach(obj => os.put(obj));
        tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
      } catch (_) { resolve(); }
    });
  }

  async _persistAllIdb() {
    if (!this.db) return;
    await Promise.all(STORES.map(async store => {
      await this._idbClear(store);
      await this._idbBulkPut(store, this.memory[store]);
    }));
  }

  async getAll(store) {
    return (this.memory[store] || []).slice();
  }

  async get(store, id) {
    return (this.memory[store] || []).find(x => x.id === id) || null;
  }

  async put(store, obj) {
    const arr = this.memory[store] || (this.memory[store] = []);
    const i = arr.findIndex(x => x.id === obj.id);
    if (i >= 0) arr[i] = obj; else arr.push(obj);
    if (this.mode === 'local') this._saveLocal();
    else this.persistenceReady.then(ok => ok && this._idbPut(store, obj));
    return obj;
  }

  async bulkPut(store, arr) {
    const current = this.memory[store] || (this.memory[store] = []);
    const map = new Map(current.map(x => [x.id, x]));
    (arr || []).forEach(x => map.set(x.id, x));
    this.memory[store] = [...map.values()];
    if (this.mode === 'local') this._saveLocal();
    else this.persistenceReady.then(ok => ok && this._idbBulkPut(store, arr || []));
    return (arr || []).length;
  }

  async delete(store, id) {
    this.memory[store] = (this.memory[store] || []).filter(x => x.id !== id);
    if (this.mode === 'local') this._saveLocal();
    else this.persistenceReady.then(ok => ok && this._idbDelete(store, id));
    return true;
  }

  async clearStore(store) {
    this.memory[store] = [];
    if (this.mode === 'local') this._saveLocal();
    else this.persistenceReady.then(ok => ok && this._idbClear(store));
    return true;
  }

  async count(store) { return (this.memory[store] || []).length; }

  async logActivity(action, entityType, entityId, before, after, user = 'local-admin') {
    const entry = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      action, entityType, entityId,
      before: before ? JSON.parse(JSON.stringify(before)) : null,
      after: after ? JSON.parse(JSON.stringify(after)) : null,
      user, timestamp: new Date().toISOString(),
    };
    await this.put('auditLog', entry);
    return entry;
  }

  async softDelete(store, id, user = 'local-admin') {
    const obj = await this.get(store, id);
    if (!obj) return null;
    const before = { ...obj };
    obj.deletedAt = new Date().toISOString();
    obj.deletedBy = user;
    await this.put(store, obj);
    await this.put('trash', { id: `${store}::${id}`, store, recordId: id, deletedAt: obj.deletedAt, deletedBy: user, snapshot: before });
    await this.logActivity('delete', store, id, before, obj, user);
    return obj;
  }

  async restore(store, id, user = 'local-admin') {
    const obj = await this.get(store, id);
    if (!obj) return null;
    const before = { ...obj };
    obj.deletedAt = null; obj.deletedBy = null;
    await this.put(store, obj);
    await this.delete('trash', `${store}::${id}`);
    await this.logActivity('restore', store, id, before, obj, user);
    return obj;
  }

  async permanentDelete(store, id, user = 'local-admin') {
    const obj = await this.get(store, id);
    await this.delete(store, id);
    await this.delete('trash', `${store}::${id}`);
    await this.logActivity('permanent_delete', store, id, obj, null, user);
    return true;
  }

  async replaceFromRemoteBundle(bundle) {
    if (!bundle || !Array.isArray(bundle.vendorMatrixRecords)) throw new Error('Remote sync returned an invalid dashboard dataset.');
    // Never replace an existing complete workspace with a partial/empty response.
    // The server performs the same integrity check, but this second gate protects the browser.
    const incoming = { ...bundle, categories: Array.isArray(bundle.categories) ? bundle.categories : [] };
    const incomingCounts = dashboardBundleCounts(incoming);
    if (incomingCounts.vendorMatrixRecords < DATA_INTEGRITY_FLOOR.vendorMatrixRecords ||
        incomingCounts.solutionMatrixRecords < DATA_INTEGRITY_FLOOR.solutionMatrixRecords ||
        incomingCounts.distinctVendorCount < DATA_INTEGRITY_FLOOR.distinctVendorCount ||
        incomingCounts.categoryCount < DATA_INTEGRITY_FLOOR.categoryCount ||
        incomingCounts.knowledgeBaseDocCount < DATA_INTEGRITY_FLOOR.knowledgeBaseDocCount ||
        incomingCounts.referenceDocCount < DATA_INTEGRITY_FLOOR.referenceDocCount ||
        incomingCounts.employeeCount < DATA_INTEGRITY_FLOOR.employeeCount) {
      const err = new Error(`Remote dashboard data is incomplete; keeping the last known-good workspace. ${Object.entries(DATA_INTEGRITY_FLOOR).map(([k,v]) => `${k}=${incomingCounts[k]}/${v}`).join(', ')}`);
      err.code = 'DATASET_INTEGRITY_FAILED';
      console.warn('[DataService] rejected incomplete remote dataset', incomingCounts);
      throw err;
    }
    const updates = {
      vendorMatrix: bundle.vendorMatrixRecords,
      solutionMatrix: bundle.solutionMatrixRecords || [],
      vendors: bundle.vendors || [],
      referenceDocs: bundle.referenceDocs || [],
      knowledgeBaseDocs: bundle.knowledgeBaseDocs || [],
      employees: bundle.employees || [],
      categories: categoryRows(bundle.categories || []),
    };
    Object.entries(updates).forEach(([store, rows]) => { this.memory[store] = rows.slice(); });
    this.memory.settings = this.memory.settings.filter(x => x.id !== 'seedStatus');
    this.memory.settings.push({ id: 'seedStatus', seeded: true, seededAt: new Date().toISOString(), meta: bundle.meta, remote: true });
    if (this.currentUserEmail && !this.memory.settings.some(x => x.id === 'owner')) this.memory.settings.push({ id:'owner', email:this.currentUserEmail });

    // Persist remotely-fetched state in the background; UI does not wait for storage.
    if (this.mode === 'local') this._saveLocal();
    else this.persistenceReady.then(ok => ok && this._persistAllIdb());
    return bundle;
  }

  async syncFromRemote() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const credential = window.WVAuth?.getCredential?.() || '';
      const headers = credential ? { Authorization: `Bearer ${credential}` } : {};
      const res = await fetch('/.netlify/functions/fam-data', { cache: 'no-store', signal: controller.signal, headers });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `Remote sync failed (${res.status})`);
      return await this.replaceFromRemoteBundle(payload);
    } finally {
      clearTimeout(timer);
    }
  }

  async isSeeded() { return !!this.memory.settings.find(x => x.id === 'seedStatus' && x.seeded); }

  async seedFromBundle(bundle) {
    if (!this.userActivated) throw new Error('Login required before data can be loaded.');
    return this.replaceFromRemoteBundle(bundle);
  }
}

const db = new DataService();
window.db = db;
