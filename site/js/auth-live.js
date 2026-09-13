/* Wellversed FAM — Google Identity Services */
const GOOGLE_CLIENT_ID = '255689281984-2t3k3fe19srh84tnjqk3um3psfda58ie.apps.googleusercontent.com';
window.__WV_GOOGLE_CLIENT_ID = GOOGLE_CLIENT_ID;

window.WVAuth = {
  user: null,
  _initialized: false,
  _buttonHost: null,
  _started: false,

  init() {
    if (!window.google?.accounts?.id) return false;
    if (!this._initialized) {
      try {
        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: this.handleCredential.bind(this),
          auto_select: false,
          cancel_on_tap_outside: true,
          use_fedcm_for_prompt: true,
        });
        this._initialized = true;
        console.info('[WVAuth] Google Identity Services initialized', {
          clientId: GOOGLE_CLIENT_ID,
          origin: location.origin,
        });
      } catch (e) {
        console.error('[WVAuth] GIS initialization failed', e);
        return false;
      }
    }
    this.restore();
    this.renderUser();
    return true;
  },

  renderButton() {
    if (!window.google?.accounts?.id) return;
    const host = document.getElementById('google-signin');
    if (!host || this._buttonHost === host) return;
    host.innerHTML = '';
    try {
      google.accounts.id.renderButton(host, {
        theme: 'outline', size: 'medium', shape: 'pill',
        text: 'signin_with', logo_alignment: 'left',
      });
      this._buttonHost = host;
    } catch (e) {
      console.error('[WVAuth] Google button render failed', e);
      host.innerHTML = '<span style="font-size:12px;color:#b91c1c">Google Sign-In unavailable. Check the OAuth JavaScript origin.</span>';
    }
  },

  handleCredential(response) {
    try {
      const part = response.credential.split('.')[1];
      const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
      if (!payload.email) throw new Error('Google did not return an email address.');
      this.user = {
        name: payload.name || payload.given_name || 'Google User',
        email: payload.email,
        picture: payload.picture || '',
      };
      sessionStorage.setItem('wv_google_user', JSON.stringify(this.user));
      sessionStorage.setItem('wv_google_credential', response.credential);
      this.renderUser();
      if (typeof toast === 'function') toast(`Signed in as ${this.user.name}`, 'success');
      // Live Sheets is authenticated server-side; fetch it only after login.
      setTimeout(() => window.__wvRefreshRemoteData?.(), 0);
    } catch (e) {
      console.error('[WVAuth] Credential handling failed', e);
    }
  },

  restore() {
    try {
      this.user = JSON.parse(sessionStorage.getItem('wv_google_user') || 'null');
    } catch (_) { this.user = null; }
  },

  getCredential() { return sessionStorage.getItem('wv_google_credential') || ''; },

  signOut() {
    if (window.google?.accounts?.id) google.accounts.id.disableAutoSelect();
    sessionStorage.removeItem('wv_google_user');
    sessionStorage.removeItem('wv_google_credential');
    this.user = null;
    this._buttonHost = null;
    this.renderUser();
  },

  renderUser() {
    const host = document.getElementById('google-user');
    if (!host) return;
    if (!this.user) {
      host.innerHTML = '<div id="google-signin"></div>';
      this._buttonHost = null;
      this.renderButton();
      return;
    }
    host.innerHTML = `<div class="wv-user-chip"><img src="${escapeHtml(this.user.picture)}" alt="" onerror="this.style.display='none'"><span><b>${escapeHtml(this.user.name)}</b><small>${escapeHtml(this.user.email)}</small></span><button class="btn btn-ghost btn-sm" id="wv-signout">Sign out</button></div>`;
    document.getElementById('wv-signout')?.addEventListener('click', () => this.signOut());
  },
};

(function waitForGIS() {
  let tries = 0;
  const tick = () => {
    if (window.WVAuth?.init()) return;
    if (++tries < 80) setTimeout(tick, 250);
    else console.warn('[WVAuth] Google Identity Services did not become ready.');
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tick, { once: true });
  else tick();
})();
