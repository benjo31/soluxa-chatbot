(function () {
  'use strict';

  // -------- Bootstrap & config --------
  const currentScript = document.currentScript || (() => {
    const ss = document.getElementsByTagName('script');
    return ss[ss.length - 1];
  })();

  const botId = currentScript.getAttribute('data-bot-id');
  if (!botId) {
    console.error('[Soluxa Chatbot] data-bot-id manquant sur la balise <script>.');
    return;
  }

  // Base URL = origin du script
  const scriptSrc = currentScript.src;
  const baseUrl = scriptSrc ? new URL(scriptSrc).origin : window.location.origin;

  // -------- Helpers --------
  const STORE_KEY = `sx_${botId}`;
  const getStore = () => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); }
    catch { return {}; }
  };
  const setStore = (v) => localStorage.setItem(STORE_KEY, JSON.stringify(v));

  const h = (tag, props = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'class') el.className = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) el.setAttribute(k, v);
    }
    for (const c of children) {
      if (c == null || c === false) continue;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return el;
  };

  // Simple toast notification
  function toast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    Object.assign(t.style, {
      position: 'fixed', bottom: '100px', right: '24px',
      background: '#002d5d', color: '#fff', padding: '10px 18px',
      borderRadius: '10px', fontSize: '13px', fontWeight: '600',
      boxShadow: '0 4px 16px rgba(0,0,0,0.2)', zIndex: '2147483647',
      opacity: '0', transform: 'translateY(8px)', transition: 'all 0.2s ease',
    });
    document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.opacity = '1'; t.style.transform = 'translateY(0)'; });
    setTimeout(() => {
      t.style.opacity = '0'; t.style.transform = 'translateY(8px)';
      setTimeout(() => t.remove(), 300);
    }, 2200);
  }

  // -------- CSS (injecté dans Shadow DOM) --------
  function buildCss(brand) {
    const title = brand.titleColor || '#62a70f';
    const text = brand.textColor || '#002d5d';
    const bg = brand.bgColor || '#FFFFFF';
    const accent = brand.accentColor || title;
    const font = brand.font || "'Source Sans Pro', sans-serif";
    return `
      :host { all: initial; }
      * { box-sizing: border-box; font-family: ${font}; }
      .sx-launcher {
        position: fixed; bottom: 24px; right: 24px;
        width: 60px; height: 60px; border-radius: 50%;
        background: ${title}; color: #fff;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 8px 24px rgba(0,0,0,0.18);
        cursor: pointer; border: none; z-index: 2147483646;
        transition: transform .15s ease;
      }
      .sx-launcher:hover { transform: scale(1.06); }
      .sx-launcher svg { width: 26px; height: 26px; fill: #fff; }

      .sx-panel {
        position: fixed; bottom: 96px; right: 24px;
        width: 380px; max-width: calc(100vw - 32px);
        height: 600px; max-height: calc(100vh - 120px);
        background: ${bg}; color: ${text};
        border-radius: 16px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.22);
        display: none; flex-direction: column;
        overflow: hidden; z-index: 2147483647;
        animation: sxSlide .25s ease;
      }
      .sx-panel.sx-open { display: flex; }
      @keyframes sxSlide {
        from { opacity: 0; transform: translateY(12px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      .sx-header {
        background: ${bg};
        padding: 14px 16px;
        border-bottom: 1px solid rgba(0,0,0,0.06);
        display: flex; align-items: center; gap: 12px;
      }
      .sx-logo { height: 28px; max-width: 130px; object-fit: contain; }
      .sx-title { color: ${title}; font-weight: 700; font-size: 16px; flex: 1; }
      .sx-close {
        background: none; border: none; cursor: pointer;
        color: ${text}; font-size: 22px; line-height: 1; padding: 4px 8px;
      }

      .sx-body {
        flex: 1; overflow-y: auto;
        padding: 16px; display: flex; flex-direction: column; gap: 10px;
        background: ${bg};
      }
      .sx-msg { max-width: 85%; padding: 10px 13px; border-radius: 14px; font-size: 14.5px; line-height: 1.45; white-space: pre-wrap; word-wrap: break-word; }
      .sx-msg-bot   { background: #f3f6fa; color: ${text}; align-self: flex-start; border-bottom-left-radius: 4px; }
      .sx-msg-user  { background: ${accent}; color: #fff; align-self: flex-end; border-bottom-right-radius: 4px; }
      .sx-typing { display: inline-flex; gap: 4px; padding: 12px 14px; background: #f3f6fa; border-radius: 14px; align-self: flex-start; }
      .sx-typing span { width: 6px; height: 6px; border-radius: 50%; background: ${text}; opacity: .4; animation: sxBounce 1.2s infinite ease-in-out; }
      .sx-typing span:nth-child(2) { animation-delay: .15s; }
      .sx-typing span:nth-child(3) { animation-delay: .3s; }
      @keyframes sxBounce { 0%, 60%, 100% { transform: translateY(0); opacity: .4; } 30% { transform: translateY(-5px); opacity: 1; } }

      .sx-lead-cta {
        align-self: flex-start; margin-top: 4px;
        background: ${title}; color: #fff;
        border: none; border-radius: 10px; cursor: pointer;
        padding: 9px 14px; font-size: 13.5px; font-weight: 600;
      }

      .sx-footer { border-top: 1px solid rgba(0,0,0,0.06); padding: 10px; background: ${bg}; }
      .sx-input-row { display: flex; gap: 8px; }
      .sx-input {
        flex: 1; padding: 10px 12px;
        border: 1px solid rgba(0,0,0,0.12); border-radius: 10px;
        font-size: 14px; color: ${text}; background: #fff; outline: none;
        font-family: ${font};
      }
      .sx-input:focus { border-color: ${title}; }
      .sx-send {
        background: ${title}; color: #fff; border: none;
        border-radius: 10px; padding: 0 14px; cursor: pointer; font-weight: 600;
      }
      .sx-send:disabled { opacity: .5; cursor: not-allowed; }
      .sx-poweredby { text-align: center; font-size: 11px; color: rgba(0,0,0,0.45); padding: 6px 0 2px; }
      .sx-poweredby a { color: inherit; text-decoration: none; }

      /* Avatar toggle button in footer */
      .sx-avatar-btn {
        background: rgba(0,0,0,0.04); color: ${text};
        border: 1px solid rgba(0,0,0,0.08); border-radius: 10px;
        padding: 0 10px; cursor: pointer; font-size: 14px; font-weight: 500;
        white-space: nowrap; font-family: ${font};
        transition: all 0.15s ease;
      }
      .sx-avatar-btn:hover { background: rgba(0,0,0,0.07); }

      /* Avatar overlay - full panel takeover */
      .sx-avatar-overlay {
        display: none;
        position: absolute; inset: 0;
        background: #0d0d1a;
        z-index: 20;
        flex-direction: column;
        border-radius: 16px;
        overflow: hidden;
      }
      .sx-avatar-overlay.sx-open { display: flex; }
      .sx-avatar-overlay .sx-av-head {
        display: flex; align-items: center; justify-content: center;
        padding: 16px 16px 0;
        position: relative;
      }
      .sx-avatar-overlay .sx-av-head .sx-av-name {
        color: rgba(255,255,255,0.7); font-size: 13px; font-weight: 500;
      }
      .sx-avatar-overlay .sx-av-head .sx-av-back {
        position: absolute; left: 12px; top: 12px;
        background: rgba(255,255,255,0.08); border: none; color: #fff;
        padding: 6px 12px; border-radius: 8px; cursor: pointer; font-size: 13px;
      }
      .sx-avatar-overlay .sx-av-video {
        flex: 1;
        display: flex; align-items: center; justify-content: center;
        padding: 12px;
      }
      .sx-avatar-overlay .sx-av-video video {
        max-width: 100%; max-height: 100%;
        border-radius: 16px; object-fit: contain;
        box-shadow: 0 0 60px rgba(98,167,15,0.08);
      }
      .sx-avatar-overlay .sx-av-status {
        text-align: center;
        padding: 0 16px 8px;
        min-height: 20px;
        font-size: 12px; color: rgba(255,255,255,0.35);
      }
      .sx-avatar-overlay .sx-av-status .sx-av-dots span {
        display: inline-block; width: 5px; height: 5px;
        border-radius: 50%; background: ${accent};
        margin: 0 2px; animation: sxAvPulse 1s ease-in-out infinite;
      }
      .sx-avatar-overlay .sx-av-status .sx-av-dots span:nth-child(2) { animation-delay: 0.15s; }
      .sx-avatar-overlay .sx-av-status .sx-av-dots span:nth-child(3) { animation-delay: 0.3s; }
      @keyframes sxAvPulse { 0%, 100% { opacity: 0.2; } 50% { opacity: 1; } }

      .sx-avatar-overlay .sx-av-footer {
        padding: 12px 16px 16px;
      }
      .sx-avatar-overlay .sx-av-input-row {
        display: flex; gap: 8px;
      }
      .sx-avatar-overlay .sx-av-input {
        flex: 1; padding: 10px 14px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.1); border-radius: 10px;
        font-size: 14px; color: #fff; outline: none; font-family: ${font};
      }
      .sx-avatar-overlay .sx-av-input:focus { border-color: ${accent}; }
      .sx-avatar-overlay .sx-av-input::placeholder { color: rgba(255,255,255,0.3); }
      .sx-avatar-overlay .sx-av-send {
        background: ${accent}; color: #fff; border: none;
        border-radius: 10px; padding: 0 16px; cursor: pointer; font-weight: 600;
      }
      .sx-avatar-overlay .sx-av-send:disabled { opacity: 0.3; cursor: not-allowed; }

      /* Lead form modal */
      .sx-modal-backdrop {
        position: absolute; inset: 0; background: rgba(0,45,93,0.35);
        display: none; align-items: center; justify-content: center; z-index: 10;
      }
      .sx-modal-backdrop.sx-open { display: flex; }
      .sx-modal {
        background: ${bg}; border-radius: 14px; padding: 18px;
        width: 90%; max-width: 320px;
        box-shadow: 0 12px 40px rgba(0,0,0,0.25);
      }
      .sx-modal h3 { margin: 0 0 12px; color: ${title}; font-size: 16px; }
      .sx-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
      .sx-field label { font-size: 12px; color: ${text}; font-weight: 600; }
      .sx-field input, .sx-field textarea {
        padding: 9px 11px; border: 1px solid rgba(0,0,0,0.12);
        border-radius: 8px; font-size: 13.5px; color: ${text}; font-family: ${font};
        outline: none; resize: vertical;
      }
      .sx-field input:focus, .sx-field textarea:focus { border-color: ${title}; }
      .sx-modal-actions { display: flex; gap: 8px; margin-top: 6px; }
      .sx-modal-actions button {
        flex: 1; padding: 9px 12px; border-radius: 9px;
        border: none; cursor: pointer; font-weight: 600; font-size: 13.5px;
      }
      .sx-btn-cancel { background: #f0f2f5; color: ${text}; }
      .sx-btn-submit { background: ${title}; color: #fff; }
      .sx-thanks { color: ${title}; font-weight: 600; text-align: center; padding: 10px 0; }

      @media (max-width: 480px) {
        .sx-panel {
          width: calc(100vw - 16px); height: calc(100vh - 100px); right: 8px; bottom: 80px;
        }
      }
    `;
  }

  // -------- Font loading (Source Sans Pro) --------
  function ensureFont() {
    if (document.querySelector('link[data-sx-font]')) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Source+Sans+Pro:wght@400;600;700&display=swap';
    l.setAttribute('data-sx-font', '1');
    document.head.appendChild(l);
  }

  // -------- Main mount --------
  async function mount() {
    let config;
    try {
      const r = await fetch(`${baseUrl}/api/public/bots/${botId}/config`);
      if (!r.ok) throw new Error('config_fetch_failed');
      config = await r.json();
    } catch (e) {
      console.error('[Soluxa Chatbot] Impossible de charger la configuration:', e);
      return;
    }

    ensureFont();
    const brand = config.branding || {};
    const heygenEnabled = config.heygenEnabled;

    // Container + Shadow DOM
    const host = document.createElement('div');
    host.id = 'soluxa-chatbot-host';
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = buildCss(brand);
    shadow.appendChild(style);

    // Launcher button
    const launcher = h('button', { class: 'sx-launcher', 'aria-label': 'Ouvrir le chat' },
      (() => {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', 'M20 2H4c-1.1 0-2 .9-2 2v14l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z');
        svg.appendChild(p);
        return svg;
      })()
    );
    shadow.appendChild(launcher);

    // Panel
    const body = h('div', { class: 'sx-body' });
    const input = h('input', { class: 'sx-input', type: 'text', placeholder: 'Écrivez votre message…', autocomplete: 'off' });
    const sendBtn = h('button', { class: 'sx-send' }, 'Envoyer');

    // Avatar button (visible only if enabled)
    const avatarPreviewUrl = config.heygenAvatarPreview;
    const avatarBtnContent = avatarPreviewUrl
      ? h('img', { src: avatarPreviewUrl, style: 'width:22px;height:22px;border-radius:11px;object-fit:cover;vertical-align:middle;margin-right:4px' })
      : '🎭';
    const avatarBtn = heygenEnabled
      ? h('button', { class: 'sx-avatar-btn', title: 'Mode avatar' }, avatarBtnContent)
      : null;

    const footerChildren = avatarBtn
      ? [h('div', { class: 'sx-input-row' }, avatarBtn, input, sendBtn)]
      : [h('div', { class: 'sx-input-row' }, input, sendBtn)];
    footerChildren.push(h('div', { class: 'sx-poweredby' }, 'Propulsé par Soluxa'));
    const footer = h('div', { class: 'sx-footer' }, ...footerChildren);

    const closeBtn = h('button', { class: 'sx-close', 'aria-label': 'Fermer' }, '×');
    const headerEls = [];
    if (brand.logoUrl) headerEls.push(h('img', { class: 'sx-logo', src: brand.logoUrl, alt: config.name || 'Logo' }));
    headerEls.push(h('div', { class: 'sx-title' }, config.name || 'Assistant'));
    headerEls.push(closeBtn);
    const header = h('div', { class: 'sx-header' }, ...headerEls);

    // ---- Avatar overlay ----
    let avatarOverlay = null;
    let avatarSession = null; // LiveAvatarSession instance
    let avatarReady = false;
    let avatarSpeaking = false;

    // Avatar DOM elements (created inside if(heygenEnabled))
    let avVideo = null;
    let avStatus = null;
    let avInput = null;
    let avSend = null;
    let avBack = null;

    function avatarStatus(msg) {
      if (avStatus) avStatus.textContent = msg;
    }

    if (heygenEnabled) {
      avVideo = h('video', { autoplay: true, muted: true, playsinline: true });
      avStatus = h('div', { class: 'sx-av-status' }, 'Appuyez sur Entrée pour parler à Lumia');
      avInput = h('input', { class: 'sx-av-input', type: 'text', placeholder: 'Écrivez votre message…', autocomplete: 'off' });
      avSend = h('button', { class: 'sx-av-send' }, 'Envoyer');
      avBack = h('button', { class: 'sx-av-back' }, '←  Chat');
      const avFooter = h('div', { class: 'sx-av-footer' },
        h('div', { class: 'sx-av-input-row' }, avInput, avSend)
      );

      avatarOverlay = h('div', { class: 'sx-avatar-overlay' },
        h('div', { class: 'sx-av-head' },
          avBack,
          h('span', { class: 'sx-av-name' }, '🎭  ' + (config.name || 'Assistant'))
        ),
        h('div', { class: 'sx-av-video' }, avVideo),
        avStatus,
        avFooter
      );

      avBack.addEventListener('click', closeAvatarMode);
      avSend.addEventListener('click', () => avatarSend(avInput.value));
      avInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); avatarSend(avInput.value); }
      });
    }

    // Avatar send logic — gets LLM reply, then sends to avatar SDK
    async function avatarSend(text) {
      if (!text.trim() || !avatarReady || !avatarSession) return;
      if (!avInput) return;
      avInput.value = '';
      if (avSend) avSend.disabled = true;
      avatarStatus('🧠 Réflexion…');
      try {
        await ensureConversation();

        // Get LLM reply as plain JSON (no SSE)
        const resp = await fetch(`${baseUrl}/api/public/bots/${botId}/heygen/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId, message: text }),
        });
        if (!resp.ok) {
          const errBody = await resp.json().catch(() => ({}));
          // If session expired, the client can re-init
          if (resp.status === 400 && errBody.action === 'restart') {
            avatarStatus('⚠ Session expirée, rechargez l\'avatar');
            return;
          }
          throw new Error(errBody.error || 'chat_failed');
        }
        const data = await resp.json();
        const reply = data.reply || '';

        if (reply.trim()) {
          avatarStatus('🎙 Lumia parle…');
          // Send the text to the avatar SDK via the message() method
          avatarSession.message(reply);
        } else {
          avatarStatus('✔ Pas de réponse');
        }
      } catch (e) {
        console.error('[avatar] send error:', e);
        avatarStatus('⚠ Erreur, réessayez');
      } finally {
        avatarSpeaking = false;
        if (avSend) avSend.disabled = false;
        setTimeout(() => {
          if (!avatarSpeaking && avatarReady) avatarStatus('Appuyez sur Entrée pour parler à Lumia');
        }, 1500);
      }
    }

    function closeAvatarMode() {
      if (!avatarOverlay) return;
      avatarOverlay.classList.remove('sx-open');
      if (avatarBtn) avatarBtn.classList.remove('sx-active');
      avatarReady = false;
      if (avatarSession) {
        try {
          avatarSession.stop().catch(() => {});
        } catch (e) {
          // Ignore errors on stop
        }
        avatarSession = null;
      }
      fetch(`${baseUrl}/api/public/bots/${botId}/heygen/stop`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
      }).catch(() => {});
      setTimeout(() => input.focus(), 100);
    }

    function openAvatarMode() {
      if (!avatarOverlay) return;
      avatarOverlay.classList.add('sx-open');
      if (avatarBtn) avatarBtn.classList.add('sx-active');
      const avInputEl = avatarOverlay.querySelector('.sx-av-input');
      setTimeout(() => avInputEl?.focus(), 100);
      avatarStatus('🚀 Connexion…');
      console.log('[avatar] openAvatarMode called, loading SDK...');

      // 1. Load the HeyGen SDK dynamically
      loadHeyGenSDK().then(() => {
        console.log('[avatar] SDK loaded, fetching token...');
        // 2. Get token from our backend — with a 30s timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);
        return fetch(`${baseUrl}/api/public/bots/${botId}/heygen/start`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
        }).finally(() => clearTimeout(timeoutId));
      }).then(r => {
        console.log('[avatar] token response status:', r.status);
        return r.text().then(text => {
          console.log('[avatar] token response body:', text);
          if (!r.ok) {
            let detail;
            try { const j = JSON.parse(text); detail = j.error || j.detail || JSON.stringify(j); } catch(e) { detail = text; }
            throw new Error('HTTP ' + r.status + ': ' + detail);
          }
          return JSON.parse(text);
        });
      }).then(data => {
        console.log('[avatar] token data:', JSON.stringify(data));
        const token = data.session_token || data.token;
        if (!token) throw new Error('no_token: field missing from response');

        // 3. Create and start LiveAvatar session
        avatarReady = false;
        const LiveAvatarSessionClass = window.LiveAvatarSDK.LiveAvatarSession;
        avatarSession = new LiveAvatarSessionClass(token);
        console.log('[avatar] LiveAvatarSession created');

        // Listen for stream ready — attach video
        avatarSession.on('session.stream_ready', () => {
          console.log('[avatar] stream_ready event fired');
          const videoEl = avatarOverlay.querySelector('.sx-av-video video');
          if (videoEl) {
            avatarSession.attach(videoEl);
            videoEl.play().catch(() => {});
          }
          avatarReady = true;
          avatarStatus('🎭 Lumia est prêt !');
          setTimeout(() => avatarStatus('Appuyez sur Entrée pour parler à Lumia'), 2000);
        });

        // Avatar speak events
        avatarSession.on('avatar.speak_started', () => {
          avatarSpeaking = true;
          avatarStatus('🎙 Lumia parle…');
        });
        avatarSession.on('avatar.speak_ended', () => {
          avatarSpeaking = false;
          avatarStatus('Appuyez sur Entrée pour parler à Lumia');
        });

        // State changes
        avatarSession.on('session.state_changed', (state) => {
          if (state === 'CONNECTING') {
            avatarStatus('🚀 Connexion…');
          } else if (state === 'CONNECTED') {
            avatarStatus('🔄 Préparation…');
          } else if (state === 'DISCONNECTED') {
            avatarStatus('🔌 Déconnecté');
            avatarReady = false;
            avatarSession = null;
          }
        });

        // Error handling
        avatarSession.on('session.disconnected', () => {
          avatarStatus('🔌 Session terminée');
          avatarReady = false;
          avatarSession = null;
        });

        // Start the session
        avatarSession.start().catch((err) => {
          console.error('[avatar] session start error:', err, 'message:', err.message, 'stack:', err.stack);
          avatarStatus('⚠ ' + (err.message || 'Erreur de connexion'));
          avatarReady = false;
        });
      }).catch((err) => {
        console.error('[avatar] init error:', err, 'message:', err.message, 'stack:', err.stack);
        avatarStatus('⚠ ' + (err.message || 'Erreur initialisation'));
      });
    }

    // Load the HeyGen LiveAvatar SDK UMD bundle dynamically
    let sdkLoadPromise = null;
    function loadHeyGenSDK() {
      if (window.LiveAvatarSDK && window.LiveAvatarSDK.LiveAvatarSession) {
        return Promise.resolve();
      }
      if (sdkLoadPromise) return sdkLoadPromise;
      
      // First, ensure events$1 shim is loaded (SDK depends on Node.js 'events' module)
      sdkLoadPromise = new Promise((resolve, reject) => {
        if (!window.events$1) {
          // Minimal EventEmitter shim compatible with Node.js EventEmitter
          class MinimalEventEmitter {
            constructor() {
              this._events = {};
            }
            _callListeners(type, ...args) {
              const list = this._events[type];
              if (!list) return;
              const listeners = Array.isArray(list) ? [...list] : [list];
              for (const fn of listeners) {
                try { fn.apply(this, args); } catch(e) { /* ignore */ }
              }
            }
            on(type, listener) {
              if (!this._events[type]) this._events[type] = [];
              this._events[type].push(listener);
              return this;
            }
            off(type, listener) {
              const list = this._events[type];
              if (!list) return this;
              const idx = list.indexOf(listener);
              if (idx !== -1) list.splice(idx, 1);
              if (list.length === 0) delete this._events[type];
              return this;
            }
            removeListener(type, listener) { return this.off(type, listener); }
            addListener(type, listener) { return this.on(type, listener); }
            emit(type, ...args) {
              this._callListeners(type, ...args);
              // Also call 'error' handler if error event
              if (type === 'error') {
                const err = args[0];
                if (!this._events['error']) throw err;
              }
              return true;
            }
            once(type, listener) {
              const wrapper = (...args) => {
                this.off(type, wrapper);
                listener.apply(this, args);
              };
              return this.on(type, wrapper);
            }
            listenerCount(type) {
              const list = this._events[type];
              return list ? (Array.isArray(list) ? list.length : 1) : 0;
            }
            removeAllListeners(type) {
              if (type) delete this._events[type];
              else this._events = {};
              return this;
            }
            eventNames() { return Object.keys(this._events); }
            rawListeners(type) {
              const list = this._events[type];
              return list ? (Array.isArray(list) ? [...list] : [list]) : [];
            }
            listeners(type) { return this.rawListeners(type); }
          }
          MinimalEventEmitter.prototype.EventEmitter = MinimalEventEmitter;
          window.events$1 = { EventEmitter: MinimalEventEmitter };
        }

        // Now load the SDK
        const script = document.createElement('script');
        script.src = `${baseUrl}/vendor/heygen-liveavatar-sdk.js`;
        script.async = true;
        script.onload = resolve;
        script.onerror = () => reject(new Error('SDK load failed'));
        document.head.appendChild(script);
      });
      return sdkLoadPromise;
    }

    if (avatarBtn) {
      avatarBtn.addEventListener('click', () => {
        if (avatarOverlay.classList.contains('sx-open')) {
          closeAvatarMode();
        } else {
          openAvatarMode();
        }
      });
    }

    // Modal lead
    const modalNameInput = h('input', { type: 'text', placeholder: 'Votre nom' });
    const modalEmailInput = h('input', { type: 'email', placeholder: 'email@exemple.ch' });
    const modalPhoneInput = h('input', { type: 'tel', placeholder: '+41 …' });
    const modalMsgInput = h('textarea', { rows: '3', placeholder: 'Votre demande (facultatif)' });
    const modalCancel = h('button', { class: 'sx-btn-cancel' }, 'Annuler');
    const modalSubmit = h('button', { class: 'sx-btn-submit' }, 'Envoyer');
    const modal = h('div', { class: 'sx-modal' },
      h('h3', {}, 'Être recontacté'),
      h('div', { class: 'sx-field' }, h('label', {}, 'Nom'), modalNameInput),
      h('div', { class: 'sx-field' }, h('label', {}, 'Email'), modalEmailInput),
      h('div', { class: 'sx-field' }, h('label', {}, 'Téléphone'), modalPhoneInput),
      h('div', { class: 'sx-field' }, h('label', {}, 'Message'), modalMsgInput),
      h('div', { class: 'sx-modal-actions' }, modalCancel, modalSubmit)
    );
    const modalBackdrop = h('div', { class: 'sx-modal-backdrop' }, modal);

    const panel = h('div', { class: 'sx-panel' }, header, avatarOverlay || null, body, footer, modalBackdrop);
    shadow.appendChild(panel);

    // -------- State --------
    const store = getStore();
    let conversationId = store.conversationId || null;
    let visitorId = store.visitorId || null;
    let leadSubmitted = false;

    // -------- Load conversation history --------
    async function loadHistory() {
      if (!conversationId) return false;
      try {
        const r = await fetch(`${baseUrl}/api/public/bots/${botId}/conversations/${conversationId}/messages`);
        if (!r.ok) throw new Error('history_fetch_failed');
        const data = await r.json();
        if (data.messages && data.messages.length > 0) {
          for (const msg of data.messages) {
            const cls = msg.role === 'user' ? 'sx-msg-user' : 'sx-msg-bot';
            body.appendChild(h('div', { class: `sx-msg ${cls}` }, msg.content));
          }
          body.scrollTop = body.scrollHeight;
          return true;
        }
      } catch (e) {
        console.warn('[Soluxa Chatbot] Impossible de charger l\'historique:', e);
      }
      return false;
    }

    // Welcome message (skip if history already loaded)
    loadHistory().then((hasHistory) => {
      if (!hasHistory && config.welcome) {
        body.appendChild(h('div', { class: 'sx-msg sx-msg-bot' }, config.welcome));
      }
    });

    // -------- Behaviors --------
    const openPanel = () => { panel.classList.add('sx-open'); launcher.style.display = 'none'; setTimeout(() => input.focus(), 100); };
    const closePanel = () => { panel.classList.remove('sx-open'); launcher.style.display = 'flex'; };
    launcher.addEventListener('click', openPanel);
    closeBtn.addEventListener('click', closePanel);

    async function ensureConversation() {
      if (conversationId) return conversationId;
      const r = await fetch(`${baseUrl}/api/public/bots/${botId}/conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId }),
      });
      const j = await r.json();
      conversationId = j.conversationId;
      visitorId = j.visitorId;
      setStore({ conversationId, visitorId });
      return conversationId;
    }

    function openLeadModal(prefill = {}) {
      if (prefill.email) modalEmailInput.value = prefill.email;
      if (prefill.phone) modalPhoneInput.value = prefill.phone;
      modalBackdrop.classList.add('sx-open');
    }
    modalCancel.addEventListener('click', () => modalBackdrop.classList.remove('sx-open'));
    modalSubmit.addEventListener('click', async () => {
      const payload = {
        conversationId,
        name: modalNameInput.value.trim(),
        email: modalEmailInput.value.trim(),
        phone: modalPhoneInput.value.trim(),
        message: modalMsgInput.value.trim(),
      };
      if (!payload.email && !payload.phone) {
        modalEmailInput.focus();
        return;
      }
      modalSubmit.disabled = true;
      try {
        await fetch(`${baseUrl}/api/public/bots/${botId}/lead`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        modal.innerHTML = '';
        modal.appendChild(h('div', { class: 'sx-thanks' }, 'Merci ! Nous vous recontactons rapidement.'));
        leadSubmitted = true;
        setTimeout(() => modalBackdrop.classList.remove('sx-open'), 1500);
      } catch {
        modalSubmit.disabled = false;
      }
    });

    async function sendMessage(text) {
      if (!text.trim()) return;
      input.value = '';
      sendBtn.disabled = true;

      body.appendChild(h('div', { class: 'sx-msg sx-msg-user' }, text));
      body.scrollTop = body.scrollHeight;

      const typing = h('div', { class: 'sx-typing' }, h('span'), h('span'), h('span'));
      body.appendChild(typing);
      body.scrollTop = body.scrollHeight;

      const botMsg = h('div', { class: 'sx-msg sx-msg-bot' }, '');
      let botMsgAdded = false;
      let suggestPayload = null;

      try {
        await ensureConversation();
        const resp = await fetch(`${baseUrl}/api/public/bots/${botId}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId, message: text }),
        });
        if (!resp.ok || !resp.body) throw new Error('chat_failed');

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop();
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            try {
              const obj = JSON.parse(payload);
              if (obj.delta) {
                if (!botMsgAdded) { typing.remove(); body.appendChild(botMsg); botMsgAdded = true; }
                botMsg.textContent += obj.delta;
                body.scrollTop = body.scrollHeight;
              } else if (obj.event === 'suggest_lead') {
                suggestPayload = { email: obj.email, phone: obj.phone };
              }
            } catch {}
          }
        }
      } catch (e) {
        typing.remove();
        body.appendChild(h('div', { class: 'sx-msg sx-msg-bot' }, "Une erreur est survenue. Merci de réessayer."));
      } finally {
        if (typing.parentNode) typing.remove();
        sendBtn.disabled = false;
        input.focus();

        if (suggestPayload && config.leadCaptureEnabled && !leadSubmitted) {
          const cta = h('button', { class: 'sx-lead-cta', onclick: () => openLeadModal(suggestPayload) }, 'Être recontacté');
          body.appendChild(cta);
          body.scrollTop = body.scrollHeight;
        }
      }
    }

    sendBtn.addEventListener('click', () => sendMessage(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); sendMessage(input.value); }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
