/* Soluxa Chatbots Admin SPA (vanilla JS) */

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
const el = (tag, props = {}, ...children) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
};

const api = async (path, opts = {}) => {
  const r = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  if (r.status === 401) { location.href = '/admin/'; throw new Error('unauthorized'); }
  if (!r.ok) {
    let detail = '';
    try { detail = (await r.json()).error || ''; } catch {}
    throw new Error(detail || `HTTP ${r.status}`);
  }
  if (r.headers.get('content-type')?.includes('application/json')) return r.json();
  return r;
};

const toast = (msg, ok = true) => {
  const t = $('#toast');
  t.textContent = msg;
  t.style.background = ok ? '#002d5d' : '#d23f3f';
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
};

const state = {
  bots: [],
  current: null,
  tab: 'general',
};

const SOLUXA_BRANDING = {
  titleColor: '#62a70f',
  textColor: '#002d5d',
  bgColor: '#FFFFFF',
  accentColor: '#62a70f',
  font: "'Source Sans Pro', sans-serif",
  logoUrl: 'https://cdn.shopify.com/s/files/1/0609/6397/9463/files/logo-soluxa.svg?v=1778675983',
};

// ------------- Init -------------
async function init() {
  try {
    const me = await api('/api/admin/me');
    $('#admin-email').textContent = me.email;
  } catch { location.href = '/admin/'; return; }

  $('#logout-btn').addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST' });
    location.href = '/admin/';
  });
  $('#new-bot-btn').addEventListener('click', openNewBotModal);

  await loadBots();
}
init();

async function loadBots() {
  state.bots = await api('/api/admin/bots');
  renderBotList();
  if (!state.current && state.bots.length) selectBot(state.bots[0].id);
}

function renderBotList() {
  const list = $('#bot-list');
  list.innerHTML = '';
  for (const b of state.bots) {
    list.appendChild(el('div', {
      class: 'item' + (state.current?.id === b.id ? ' active' : ''),
      onclick: () => selectBot(b.id),
    },
      el('span', {}, b.name),
      el('span', { class: 'badge' }, b.audience === 'public' ? 'externe' : 'interne')
    ));
  }
}

async function selectBot(id) {
  state.current = await api(`/api/admin/bots/${id}`);
  state.tab = 'general';
  renderBotList();
  renderBotView();
}

// ------------- New bot modal -------------
function openNewBotModal() {
  const modal = $('#modal-content');
  modal.innerHTML = '';
  const nameInput = el('input', { type: 'text', placeholder: 'Soluxa Public' });
  const audSelect = el('select', {},
    el('option', { value: 'public' }, 'Externe (site public)'),
    el('option', { value: 'internal' }, 'Interne (collaborateurs)')
  );
  modal.appendChild(el('h3', {}, 'Nouveau chatbot'));
  modal.appendChild(el('div', { class: 'field' }, el('label', {}, 'Nom'), nameInput));
  modal.appendChild(el('div', { class: 'field', style: { marginTop: '10px' } }, el('label', {}, 'Audience'), audSelect));
  modal.appendChild(el('div', { class: 'modal-actions' },
    el('button', { class: 'btn-secondary', onclick: closeModal }, 'Annuler'),
    el('button', { class: 'btn-primary', onclick: async () => {
      if (!nameInput.value.trim()) return nameInput.focus();
      try {
        const bot = await api('/api/admin/bots', {
          method: 'POST',
          body: JSON.stringify({ name: nameInput.value.trim(), audience: audSelect.value }),
        });
        closeModal();
        await loadBots();
        selectBot(bot.id);
        toast('Chatbot créé');
      } catch (e) { toast('Erreur : ' + e.message, false); }
    } }, 'Créer')
  ));
  $('#modal').classList.add('open');
}
function closeModal() { $('#modal').classList.remove('open'); }
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

// ------------- Bot view -------------
function renderBotView() {
  const m = $('#main');
  m.innerHTML = '';
  const b = state.current;
  if (!b) return;

  const header = el('div', { class: 'main-header' },
    el('div', {},
      el('h1', {}, b.name),
      el('div', { class: 'muted' }, `ID : ${b.id} · ${b.audience === 'public' ? 'Audience externe' : 'Audience interne'}`)
    ),
    el('div', { class: 'actions' },
      el('button', { class: 'btn-danger', onclick: deleteBotConfirm }, 'Supprimer')
    )
  );
  m.appendChild(header);

  const tabs = [
    ['general', 'Général'],
    ['branding', 'Branding'],
    ['llm', 'IA / Clé API'],
    ['documents', 'Documents'],
    ['contact', 'Contact'],
    ['embed', 'Intégration'],
    ['leads', 'Leads'],
    ['conversations', 'Conversations'],
  ];
  const tabBar = el('div', { class: 'tabs' },
    ...tabs.map(([k, label]) => el('div', {
      class: 'tab' + (state.tab === k ? ' active' : ''),
      onclick: () => { state.tab = k; renderBotView(); },
    }, label))
  );
  m.appendChild(tabBar);

  const content = el('div', { id: 'tab-content' });
  m.appendChild(content);

  switch (state.tab) {
    case 'general': renderGeneral(content); break;
    case 'branding': renderBranding(content); break;
    case 'llm': renderLlm(content); break;
    case 'documents': renderDocuments(content); break;
    case 'contact': renderContact(content); break;
    case 'embed': renderEmbed(content); break;
    case 'leads': renderLeads(content); break;
    case 'conversations': renderConversations(content); break;
  }
}

async function deleteBotConfirm() {
  if (!confirm(`Supprimer "${state.current.name}" et toutes ses données ?`)) return;
  await api(`/api/admin/bots/${state.current.id}`, { method: 'DELETE' });
  state.current = null;
  await loadBots();
  if (!state.bots.length) {
    $('#main').innerHTML = '<div class="empty">Aucun chatbot. Créez-en un.</div>';
  }
  toast('Chatbot supprimé');
}

async function saveBot(patch) {
  const updated = await api(`/api/admin/bots/${state.current.id}`, {
    method: 'PUT', body: JSON.stringify(patch),
  });
  state.current = updated;
  await loadBots();
  toast('Enregistré');
}

// ------------- TAB: General -------------
function renderGeneral(c) {
  const b = state.current;
  const card = el('div', { class: 'card' });

  const name = el('input', { value: b.name });
  const welcome = el('input', { value: b.welcome_message || '' });
  const scope = el('textarea', { rows: 3 }); scope.value = b.scope_topics || '';
  const refusal = el('textarea', { rows: 2 }); refusal.value = b.refusal_message || '';
  const systemPrompt = el('textarea', { rows: 5 }); systemPrompt.value = b.system_prompt || '';
  const audSelect = el('select', {},
    el('option', { value: 'public' }, 'Externe (visiteurs)'),
    el('option', { value: 'internal' }, 'Interne (collaborateurs)')
  );
  audSelect.value = b.audience;
  const leadCapture = el('input', { type: 'checkbox' });
  if (b.lead_capture_enabled) leadCapture.checked = true;

  card.appendChild(el('div', { class: 'form-grid' },
    el('div', { class: 'field full' }, el('label', {}, 'Nom du chatbot'), name),
    el('div', { class: 'field' }, el('label', {}, 'Audience'), audSelect),
    el('div', { class: 'field' },
      el('label', {}, 'Capture de leads'),
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0' } },
        leadCapture, el('span', { class: 'muted' }, 'Activer le formulaire de prise de contact')
      )
    ),
    el('div', { class: 'field full' },
      el('label', {}, 'Message d\'accueil'),
      el('small', {}, 'Première phrase qu\'affiche le chatbot.'),
      welcome
    ),
    el('div', { class: 'field full' },
      el('label', {}, 'Sujets autorisés (scope)'),
      el('small', {}, 'Décris en quelques phrases sur quoi le bot doit répondre. Hors de ce cadre, il refusera.'),
      scope
    ),
    el('div', { class: 'field full' },
      el('label', {}, 'Message de refus'),
      el('small', {}, 'Phrase exacte que le bot répondra hors-sujet.'),
      refusal
    ),
    el('div', { class: 'field full' },
      el('label', {}, 'Persona / instructions système'),
      el('small', {}, 'Ton, style, rôle. Laissé tel quel sera concaténé en début de system prompt.'),
      systemPrompt
    )
  ));
  card.appendChild(el('div', { style: { marginTop: '16px' } },
    el('button', { class: 'btn-primary', onclick: () => saveBot({
      name: name.value, audience: audSelect.value,
      welcome_message: welcome.value, scope_topics: scope.value,
      refusal_message: refusal.value, system_prompt: systemPrompt.value,
      lead_capture_enabled: leadCapture.checked,
    }) }, 'Enregistrer')
  ));
  c.appendChild(card);
}

// ------------- TAB: Branding -------------
function renderBranding(c) {
  const b = state.current;
  const brand = { ...SOLUXA_BRANDING, ...(b.branding_json || {}) };
  const card = el('div', { class: 'card' });

  const titleColor = el('input', { type: 'color', value: brand.titleColor });
  const titleColorTxt = el('input', { type: 'text', value: brand.titleColor });
  const textColor = el('input', { type: 'color', value: brand.textColor });
  const textColorTxt = el('input', { type: 'text', value: brand.textColor });
  const bgColor = el('input', { type: 'color', value: brand.bgColor });
  const bgColorTxt = el('input', { type: 'text', value: brand.bgColor });
  const accentColor = el('input', { type: 'color', value: brand.accentColor });
  const accentColorTxt = el('input', { type: 'text', value: brand.accentColor });
  const fontInput = el('input', { type: 'text', value: brand.font });
  const logoInput = el('input', { type: 'text', value: brand.logoUrl });

  const sync = (a, b) => {
    a.addEventListener('input', () => { b.value = a.value; updatePreview(); });
    b.addEventListener('input', () => { if (/^#[0-9a-f]{3,8}$/i.test(b.value)) a.value = b.value; updatePreview(); });
  };
  sync(titleColor, titleColorTxt);
  sync(textColor, textColorTxt);
  sync(bgColor, bgColorTxt);
  sync(accentColor, accentColorTxt);
  fontInput.addEventListener('input', updatePreview);
  logoInput.addEventListener('input', updatePreview);

  const preview = el('div', {
    style: {
      padding: '20px', borderRadius: '14px', boxShadow: '0 8px 30px rgba(0,45,93,.12)',
      marginTop: '20px',
    }
  });

  function updatePreview() {
    preview.style.background = bgColor.value;
    preview.style.fontFamily = fontInput.value;
    preview.innerHTML = '';
    if (logoInput.value) {
      preview.appendChild(el('img', { src: logoInput.value, style: { height: '32px', marginBottom: '10px' } }));
    }
    preview.appendChild(el('div', {
      style: { color: titleColor.value, fontWeight: '700', fontSize: '16px', marginBottom: '8px' }
    }, 'Assistant ' + b.name));
    preview.appendChild(el('div', {
      style: { color: textColor.value, background: '#f3f6fa', padding: '10px 13px', borderRadius: '14px', display: 'inline-block', maxWidth: '85%' }
    }, 'Bonjour ! Comment puis-je vous aider ?'));
    preview.appendChild(el('div', {
      style: { color: '#fff', background: accentColor.value, padding: '10px 13px', borderRadius: '14px', display: 'inline-block', maxWidth: '85%', marginTop: '8px', marginLeft: 'auto', float: 'right' }
    }, 'Bonjour, je voudrais en savoir plus.'));
  }
  updatePreview();

  card.appendChild(el('div', { class: 'form-grid' },
    el('div', { class: 'field' },
      el('label', {}, 'Couleur des titres'),
      el('div', { class: 'color-row' }, titleColor, titleColorTxt)
    ),
    el('div', { class: 'field' },
      el('label', {}, 'Couleur des textes'),
      el('div', { class: 'color-row' }, textColor, textColorTxt)
    ),
    el('div', { class: 'field' },
      el('label', {}, 'Couleur de fond'),
      el('div', { class: 'color-row' }, bgColor, bgColorTxt)
    ),
    el('div', { class: 'field' },
      el('label', {}, 'Couleur d\'accent (bulles utilisateur, boutons)'),
      el('div', { class: 'color-row' }, accentColor, accentColorTxt)
    ),
    el('div', { class: 'field full' }, el('label', {}, 'Police (CSS)'), fontInput),
    el('div', { class: 'field full' }, el('label', {}, 'URL du logo'), logoInput)
  ));

  card.appendChild(el('h3', { style: { marginTop: '24px' } }, 'Aperçu'));
  card.appendChild(preview);

  card.appendChild(el('div', { style: { marginTop: '20px', display: 'flex', gap: '8px' } },
    el('button', { class: 'btn-primary', onclick: () => saveBot({ branding: {
      titleColor: titleColor.value, textColor: textColor.value,
      bgColor: bgColor.value, accentColor: accentColor.value,
      font: fontInput.value, logoUrl: logoInput.value,
    } }) }, 'Enregistrer'),
    el('button', { class: 'btn-secondary', onclick: () => {
      titleColor.value = titleColorTxt.value = SOLUXA_BRANDING.titleColor;
      textColor.value = textColorTxt.value = SOLUXA_BRANDING.textColor;
      bgColor.value = bgColorTxt.value = SOLUXA_BRANDING.bgColor;
      accentColor.value = accentColorTxt.value = SOLUXA_BRANDING.accentColor;
      fontInput.value = SOLUXA_BRANDING.font;
      logoInput.value = SOLUXA_BRANDING.logoUrl;
      updatePreview();
    } }, 'Réinitialiser (Soluxa)')
  ));
  c.appendChild(card);
}

// ------------- TAB: LLM -------------
function renderLlm(c) {
  const b = state.current;
  const card = el('div', { class: 'card' });

  const providerSelect = el('select', {},
    el('option', { value: 'openai' }, 'OpenAI'),
    el('option', { value: 'anthropic' }, 'Anthropic (Claude)')
  );
  providerSelect.value = b.llm_provider || 'openai';

  const modelInput = el('input', { type: 'text', value: b.llm_model || (providerSelect.value === 'anthropic' ? 'claude-haiku-4-5' : 'gpt-4o-mini') });
  providerSelect.addEventListener('change', () => {
    modelInput.value = providerSelect.value === 'anthropic' ? 'claude-haiku-4-5' : 'gpt-4o-mini';
  });

  const apiKeyInput = el('input', { type: 'password', placeholder: b.has_api_key ? '•••••••• (clé déjà enregistrée — saisir pour remplacer)' : 'sk-… ou sk-ant-…' });
  const testBtn = el('button', { class: 'btn-secondary' }, 'Tester la clé');
  const testRes = el('span', { class: 'muted', style: { marginLeft: '10px' } });

  testBtn.addEventListener('click', async () => {
    testBtn.disabled = true; testRes.textContent = 'Test en cours…';
    try {
      const r = await api(`/api/admin/bots/${b.id}/test-llm`, {
        method: 'POST',
        body: JSON.stringify({
          llm_provider: providerSelect.value, llm_model: modelInput.value,
          llm_api_key: apiKeyInput.value || undefined,
        }),
      });
      testRes.textContent = r.ok ? '✅ Connexion réussie' : '❌ Échec';
      testRes.style.color = r.ok ? '#62a70f' : '#d23f3f';
    } catch (e) {
      testRes.textContent = '❌ ' + e.message;
      testRes.style.color = '#d23f3f';
    } finally { testBtn.disabled = false; }
  });

  card.appendChild(el('div', { class: 'form-grid' },
    el('div', { class: 'field' }, el('label', {}, 'Fournisseur'), providerSelect),
    el('div', { class: 'field' }, el('label', {}, 'Modèle'), modelInput),
    el('div', { class: 'field full' },
      el('label', {}, 'Clé API'),
      el('small', {}, 'Stockée chiffrée (AES-256-GCM). Jamais renvoyée au navigateur.'),
      apiKeyInput
    ),
    el('div', { class: 'field full', style: { display: 'flex', alignItems: 'center' } }, testBtn, testRes)
  ));
  card.appendChild(el('div', { style: { marginTop: '16px' } },
    el('button', { class: 'btn-primary', onclick: () => {
      const patch = { llm_provider: providerSelect.value, llm_model: modelInput.value };
      if (apiKeyInput.value) patch.llm_api_key = apiKeyInput.value;
      saveBot(patch).then(() => { apiKeyInput.value = ''; });
    } }, 'Enregistrer')
  ));
  c.appendChild(card);
}

// ------------- TAB: Documents -------------
async function renderDocuments(c) {
  const b = state.current;
  const card = el('div', { class: 'card' });
  const dz = el('div', { class: 'dropzone' }, 'Glissez-déposez vos fichiers ici, ou cliquez pour parcourir. (PDF, DOCX, TXT, MD, images)');
  const fileInput = el('input', { type: 'file', style: { display: 'none' }, multiple: true });
  dz.appendChild(fileInput);
  dz.addEventListener('click', () => fileInput.click());
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('hover'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('hover'));
  dz.addEventListener('drop', (e) => {
    e.preventDefault(); dz.classList.remove('hover');
    upload(e.dataTransfer.files);
  });
  fileInput.addEventListener('change', () => upload(fileInput.files));

  const list = el('ul', { class: 'doc-list' });
  const budget = el('div');
  card.appendChild(dz);
  card.appendChild(budget);
  card.appendChild(list);
  c.appendChild(card);

  async function refresh() {
    const data = await api(`/api/admin/bots/${b.id}/documents`);
    list.innerHTML = '';
    if (!data.documents.length) {
      list.appendChild(el('li', { class: 'muted', style: { justifyContent: 'center' } }, 'Aucun document.'));
    }
    for (const d of data.documents) {
      list.appendChild(el('li', {},
        el('div', {},
          el('div', {}, d.filename),
          el('div', { class: 'meta' }, `${d.char_count.toLocaleString()} caractères · ${(d.size_bytes/1024).toFixed(1)} Ko · ${d.created_at}`)
        ),
        el('button', { class: 'btn-danger', onclick: async () => {
          if (!confirm(`Supprimer "${d.filename}" ?`)) return;
          await api(`/api/admin/bots/${b.id}/documents/${d.id}`, { method: 'DELETE' });
          refresh();
        } }, 'Supprimer')
      ));
    }
    const pct = Math.min(100, (data.total_chars / data.limit_chars) * 100);
    budget.innerHTML = '';
    budget.appendChild(el('div', { class: 'muted', style: { marginTop: '14px' } },
      `Base de connaissance utilisée : ${data.total_chars.toLocaleString()} / ${data.limit_chars.toLocaleString()} caractères`
    ));
    const bar = el('div', { class: 'budget-bar' });
    const fill = el('span'); fill.style.width = pct + '%';
    if (pct > 90) fill.style.background = '#d23f3f';
    bar.appendChild(fill);
    budget.appendChild(bar);
  }

  async function upload(files) {
    for (const f of files) {
      const fd = new FormData(); fd.append('file', f);
      try {
        const r = await fetch(`/api/admin/bots/${b.id}/documents`, {
          method: 'POST', body: fd, credentials: 'same-origin',
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          toast(`Échec : ${f.name} (${err.error || r.status})`, false);
        } else {
          toast(`Ajouté : ${f.name}`);
        }
      } catch (e) { toast('Erreur upload', false); }
    }
    fileInput.value = '';
    refresh();
  }

  refresh();
}

// ------------- TAB: Contact -------------
function renderContact(c) {
  const b = state.current;
  const ci = b.contact_info_json || {};
  const card = el('div', { class: 'card' });
  const email = el('input', { type: 'email', value: ci.email || '' });
  const phone = el('input', { type: 'tel', value: ci.phone || '' });
  const address = el('input', { type: 'text', value: ci.address || '' });
  const hours = el('input', { type: 'text', value: ci.hours || '' });
  const url = el('input', { type: 'url', value: ci.url || '' });

  card.appendChild(el('p', { class: 'muted' }, 'Ces informations sont transmises au bot pour qu\'il puisse les proposer au visiteur. Elles ne sont pas affichées d\'office.'));
  card.appendChild(el('div', { class: 'form-grid' },
    el('div', { class: 'field' }, el('label', {}, 'Email'), email),
    el('div', { class: 'field' }, el('label', {}, 'Téléphone'), phone),
    el('div', { class: 'field full' }, el('label', {}, 'Adresse'), address),
    el('div', { class: 'field' }, el('label', {}, 'Horaires'), hours),
    el('div', { class: 'field' }, el('label', {}, 'Site web'), url)
  ));
  card.appendChild(el('div', { style: { marginTop: '16px' } },
    el('button', { class: 'btn-primary', onclick: () => saveBot({
      contact_info: { email: email.value, phone: phone.value, address: address.value, hours: hours.value, url: url.value },
    }) }, 'Enregistrer')
  ));
  c.appendChild(card);
}

// ------------- TAB: Embed -------------
function renderEmbed(c) {
  const b = state.current;
  const card = el('div', { class: 'card' });
  const url = `${location.origin}/widget.js`;
  const snippet = `<script src="${url}" data-bot-id="${b.id}" defer><\/script>`;
  card.appendChild(el('p', {}, 'Copiez le snippet ci-dessous et collez-le juste avant la fermeture du ', el('code', {}, '</body>'), ' (ou dans le ', el('code', {}, '<head>'), ' avec ', el('code', {}, 'defer'), ').'));
  const snippetBox = el('div', { class: 'snippet' }, snippet);
  card.appendChild(snippetBox);
  card.appendChild(el('button', { class: 'btn-secondary', style: { marginTop: '12px' },
    onclick: () => { navigator.clipboard.writeText(snippet); toast('Snippet copié'); } }, 'Copier'));

  card.appendChild(el('h3', { style: { marginTop: '24px' } }, 'Domaines autorisés'));
  card.appendChild(el('p', { class: 'muted' }, 'Origines acceptées par le widget (séparées par des virgules). Utilisez * pour autoriser toutes les origines.'));
  const origins = el('input', { type: 'text', value: b.allowed_origins || '*', style: { width: '100%' } });
  card.appendChild(origins);
  card.appendChild(el('div', { style: { marginTop: '12px' } },
    el('button', { class: 'btn-primary', onclick: () => saveBot({ allowed_origins: origins.value }) }, 'Enregistrer')
  ));

  c.appendChild(card);
}

// ------------- TAB: Leads -------------
async function renderLeads(c) {
  const b = state.current;
  const card = el('div', { class: 'card' });
  const actions = el('div', { class: 'main-header' },
    el('h2', {}, 'Leads'),
    el('div', {},
      el('a', { class: 'btn-secondary', href: `/api/admin/bots/${b.id}/leads.csv`, download: true,
        style: { textDecoration: 'none' } }, 'Exporter CSV')
    )
  );
  card.appendChild(actions);
  const tableWrap = el('div'); card.appendChild(tableWrap);
  c.appendChild(card);

  const rows = await api(`/api/admin/bots/${b.id}/leads`);
  if (!rows.length) {
    tableWrap.appendChild(el('div', { class: 'empty' }, 'Aucun lead pour le moment.'));
    return;
  }
  const table = el('table', {},
    el('thead', {}, el('tr', {},
      el('th', {}, 'Date'), el('th', {}, 'Nom'), el('th', {}, 'Email'), el('th', {}, 'Téléphone'),
      el('th', {}, 'Message'), el('th', {}, 'Statut'), el('th', {}, '')
    )),
    el('tbody', {}, ...rows.map((r) => {
      const sel = el('select', {},
        ...['new', 'contacted', 'closed'].map((s) => el('option', { value: s }, s))
      );
      sel.value = r.status;
      sel.addEventListener('change', async () => {
        await api(`/api/admin/bots/${b.id}/leads/${r.id}`, {
          method: 'PUT', body: JSON.stringify({ status: sel.value }),
        });
        toast('Statut mis à jour');
      });
      return el('tr', {},
        el('td', {}, new Date(r.created_at + 'Z').toLocaleString()),
        el('td', {}, r.name || '—'),
        el('td', {}, r.email || '—'),
        el('td', {}, r.phone || '—'),
        el('td', { style: { maxWidth: '220px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, title: r.message || '' }, r.message || '—'),
        el('td', {}, el('span', { class: `status-pill status-${r.status}` }, r.status)),
        el('td', {}, sel)
      );
    }))
  );
  tableWrap.appendChild(table);
}

// ------------- TAB: Conversations -------------
async function renderConversations(c) {
  const b = state.current;
  const card = el('div', { class: 'card' });
  card.appendChild(el('h2', {}, 'Conversations récentes (100 dernières)'));
  const list = el('div'); card.appendChild(list);
  c.appendChild(card);

  const convs = await api(`/api/admin/bots/${b.id}/conversations`);
  if (!convs.length) {
    list.appendChild(el('div', { class: 'empty' }, 'Aucune conversation.'));
    return;
  }
  const table = el('table', {},
    el('thead', {}, el('tr', {},
      el('th', {}, 'Début'), el('th', {}, 'Dernier message'),
      el('th', {}, 'Messages'), el('th', {}, 'Visiteur'), el('th', {}, '')
    )),
    el('tbody', {}, ...convs.map((cv) => el('tr', {},
      el('td', {}, new Date(cv.started_at + 'Z').toLocaleString()),
      el('td', {}, cv.last_message_at ? new Date(cv.last_message_at + 'Z').toLocaleString() : '—'),
      el('td', {}, String(cv.msg_count)),
      el('td', {}, (cv.visitor_id || '').slice(0, 8)),
      el('td', {}, el('button', { class: 'btn-secondary', onclick: () => showConversation(cv.id) }, 'Voir'))
    )))
  );
  list.appendChild(table);
}

async function showConversation(convId) {
  const b = state.current;
  const msgs = await api(`/api/admin/bots/${b.id}/conversations/${convId}/messages`);
  const m = $('#modal-content');
  m.innerHTML = '';
  m.appendChild(el('h3', {}, 'Conversation'));
  const wrap = el('div', { style: { maxHeight: '500px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' } });
  for (const msg of msgs) {
    wrap.appendChild(el('div', {
      style: {
        padding: '8px 12px', borderRadius: '10px',
        background: msg.role === 'user' ? '#62a70f' : '#f3f6fa',
        color: msg.role === 'user' ? '#fff' : '#002d5d',
        alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
        maxWidth: '85%', whiteSpace: 'pre-wrap', fontSize: '13.5px',
      }
    }, msg.content));
  }
  m.appendChild(wrap);
  m.appendChild(el('div', { class: 'modal-actions' },
    el('button', { class: 'btn-secondary', onclick: closeModal }, 'Fermer')
  ));
  $('#modal').classList.add('open');
}
