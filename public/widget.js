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

  // -------- CSS (injecté dans Shadow DOM) --------
  function buildCss(brand) {
    const title = brand.titleColor || '#62a70f';
    const text = brand.textColor || '#002d5d';
    const bg = brand.bgColor || '#FFFFFF';
    const accent = brand.accentColor || title;
    const font = brand.font || "'Source Sans Pro', sans-serif";
    const heygen = brand.heygen || {};
    const hasAvatar = heygen.enabled;
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
      .sx-send:disabled { opacity: .5; cursor: not-allowed; }
      .sx-poweredby { text-align: center; font-size: 11px; color: rgba(0,0,0,0.45); padding: 6px 0 2px; }
      .sx-poweredby a { color: inherit; text-decoration: none; }

      /* Avatar video */
      .sx-avatar-area { display: none; width: 100%; background: #000; border-radius: 12px; overflow: hidden; margin-bottom: 8px; }
      .sx-avatar-area.sx-open { display: block; }
      .sx-avatar-area video { width: 100%; display: block; }
      .sx-avatar-toggle {
        background: ${accent}; color: #fff; border: none; border-radius: 10px;
        padding: 8px 12px; cursor: pointer; font-size: 12px; font-weight: 600;
        white-space: nowrap;
      }
      .sx-avatar-toggle.sx-active { background: #d23f3f; }
      .sx-avatar-btn-row { display: flex; gap: 6px; align-items: center; }


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
    const avatarArea = h('div', { class: 'sx-avatar-area' },
      h('video', { autoplay: true, muted: true, playsinline: true })
    );
    const input = h('input', { class: 'sx-input', type: 'text', placeholder: 'Écrivez votre message…', autocomplete: 'off' });
    const sendBtn = h('button', { class: 'sx-send' }, 'Envoyer');
    const avatarBtn = h('button', { class: 'sx-avatar-toggle', style: 'display:none' },
      '🎭 Avatar'
    );

    // Avatar state
    let avatarActive = false;
    let heygenSessionId = null;
    const footer = h('div', { class: 'sx-footer' },
      h('div', { class: 'sx-input-row' },
        avatarBtn,
        input, sendBtn
      ),
      h('div', { class: 'sx-poweredby' }, 'Propulsé par Soluxa')
    );

    const closeBtn = h('button', { class: 'sx-close', 'aria-label': 'Fermer' }, '×');
    const headerEls = [];
    if (brand.logoUrl) headerEls.push(h('img', { class: 'sx-logo', src: brand.logoUrl, alt: config.name || 'Logo' }));
    headerEls.push(h('div', { class: 'sx-title' }, config.name || 'Assistant'));
    headerEls.push(closeBtn);
    const header = h('div', { class: 'sx-header' }, ...headerEls);

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

    const panel = h('div', { class: 'sx-panel' }, header, avatarArea, body, footer, modalBackdrop);
    shadow.appendChild(panel);

    // -------- State --------
    const state = getStore();
    let conversationId = state.conversationId || null;
    let visitorId = state.visitorId || null;
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

    // -------- HeyGen Avatar initialization --------
    const videoEl = avatarArea.querySelector('video');
    let avatarStream = null;

    if (config.heygenEnabled) {
      avatarBtn.style.display = '';
      avatarBtn.addEventListener('click', async () => {
        avatarActive = !avatarActive;
        avatarBtn.textContent = avatarActive ? '✕ Avatar' : '🎭 Avatar';
        avatarBtn.classList.toggle('sx-active', avatarActive);
        avatarArea.classList.toggle('sx-open', avatarActive);

        if (avatarActive) {
          try {
            // Start HeyGen session
            const res = await fetch(`${baseUrl}/api/public/bots/${botId}/heygen/start`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
            });
            const data = await res.json();
            heygenSessionId = data.sessionId;
            toast('Avatar activé !');
          } catch (e) {
            console.error('[avatar] start error:', e);
            avatarActive = false;
            avatarBtn.textContent = '🎭 Avatar';
            avatarBtn.classList.remove('sx-active');
            avatarArea.classList.remove('sx-open');
          }
        } else {
          // Stop HeyGen session
          try {
            await fetch(`${baseUrl}/api/public/bots/${botId}/heygen/stop`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
            });
          } catch {}
          heygenSessionId = null;
        }
      });
    }

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
        const chatEndpoint = avatarActive && heygenSessionId
          ? `${baseUrl}/api/public/bots/${botId}/heygen/talk`
          : `${baseUrl}/api/public/bots/${botId}/chat`;
        const resp = await fetch(chatEndpoint, {
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
