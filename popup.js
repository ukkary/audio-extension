const KEYS = ['boost', 'threshold', 'knee', 'ratio', 'attack', 'release'];

const RANGE_META = {
  boost:     { min: 0,    max: 4,   step: 0.01  },
  threshold: { min: -100, max: 0,   step: 1     },
  knee:      { min: 0,    max: 40,  step: 1     },
  ratio:     { min: 1,    max: 20,  step: 0.1   },
  attack:    { min: 0,    max: 1,   step: 0.001 },
  release:   { min: 0,    max: 1,   step: 0.01  }
};

const fmt = {
  boost:     (v) => `${v.toFixed(2)}x`,
  threshold: (v) => `${Math.round(v)} dB`,
  knee:      (v) => `${Math.round(v)} dB`,
  ratio:     (v) => `${v.toFixed(1)}:1`,
  attack:    (v) => v < 0.01 ? `${(v * 1000).toFixed(1)} ms` : `${Math.round(v * 1000)} ms`,
  release:   (v) => `${Math.round(v * 1000)} ms`
};

const DEFAULT_SETTINGS = { threshold: -24, knee: 30, ratio: 12, attack: 0.003, release: 0.25, boost: 1.0 };

const state = {
  tabId: null,
  tabTitle: '',
  tabUrl: '',
  enabled: false,
  settings: { ...DEFAULT_SETTINGS },
  rules: {},
  scopes: [],
  currentScope: null,
  capturable: true
};

const els = {
  toggle:       document.getElementById('enableToggle'),
  tabTitle:     document.getElementById('tabTitle'),
  statusBar:    document.getElementById('statusBar'),
  statusText:   document.getElementById('statusText'),
  presetGrid:   document.getElementById('presetGrid'),
  resetBtn:     document.getElementById('resetBtn'),
  scopeCard:    document.getElementById('scopeCard'),
  scopeSelect:  document.getElementById('scopeSelect'),
  deleteBtn:    document.getElementById('deleteRuleBtn'),
  autoEnable:   document.getElementById('autoEnable'),
  saveSiteBtn:  document.getElementById('saveSiteBtn'),
  openOptsBtn:  document.getElementById('openOptionsBtn'),
  errorBar:     document.getElementById('errorBar')
};

function showError(msg) {
  els.errorBar.textContent = msg;
  els.errorBar.hidden = false;
  setTimeout(() => { els.errorBar.hidden = true; }, 4000);
}

function send(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ ...message, target: 'background' }, (resp) => {
      if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
      else resolve(resp);
    });
  });
}

// ---------- URL / scope helpers ----------

function isCapturableUrl(urlStr) {
  if (!urlStr) return false;
  try {
    const u = new URL(urlStr);
    return /^https?:$/.test(u.protocol);
  } catch { return false; }
}

function normalizeUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '');
    return host + path;
  } catch { return null; }
}

function computeScopes(urlStr) {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.replace(/^www\./, '');
    const segs = u.pathname.split('/').filter(Boolean);
    const out = [
      { kind: 'domain', label: 'domain', pattern: host, display: `Whole site (${host})` }
    ];
    if (segs.length >= 1) {
      out.push({
        kind: 'path',
        label: 'section',
        pattern: `${host}/${segs[0]}`,
        display: `This section (/${segs[0]})`
      });
    }
    if (segs.length >= 2) {
      out.push({
        kind: 'path',
        label: 'page',
        pattern: `${host}/${segs.join('/')}`,
        display: `Just this page`
      });
    }
    return out;
  } catch { return []; }
}

function findMatchingRule(rules, urlStr) {
  const norm = normalizeUrl(urlStr);
  if (!norm) return null;
  const sorted = Object.values(rules).sort((a, b) => b.pattern.length - a.pattern.length);
  for (const r of sorted) {
    if (norm === r.pattern || norm.startsWith(r.pattern + '/')) return r;
  }
  return null;
}

function ruleForCurrentScope() {
  if (!state.currentScope) return null;
  return state.rules[state.currentScope] || null;
}

// ---------- Renderers ----------

function fillPercent(key, v) {
  const m = RANGE_META[key];
  return ((v - m.min) / (m.max - m.min)) * 100;
}

function renderControls() {
  for (const key of KEYS) {
    const rng = document.getElementById(`rng-${key}`);
    const val = document.getElementById(`val-${key}`);
    rng.value = state.settings[key];
    rng.style.setProperty('--fill', `${fillPercent(key, state.settings[key])}%`);
    val.textContent = fmt[key](state.settings[key]);
  }
}

function renderStatus() {
  els.toggle.checked = state.enabled;
  els.toggle.disabled = !state.capturable;
  els.statusBar.classList.toggle('is-on', state.enabled);
  if (!state.capturable) {
    els.statusText.textContent = 'Cannot capture this page';
  } else {
    els.statusText.textContent = state.enabled ? 'Compressing this tab' : 'Disabled';
  }
  els.tabTitle.textContent = state.tabTitle || '—';
}

function renderScope() {
  els.scopeSelect.innerHTML = '';
  if (!state.capturable || state.scopes.length === 0) {
    els.scopeCard.hidden = true;
    return;
  }
  els.scopeCard.hidden = false;
  for (const s of state.scopes) {
    const opt = document.createElement('option');
    opt.value = s.pattern;
    const exists = !!state.rules[s.pattern];
    opt.textContent = `${exists ? '✓ ' : ''}${s.display}`;
    opt.dataset.label = s.label;
    els.scopeSelect.appendChild(opt);
  }
  els.scopeSelect.value = state.currentScope || state.scopes[0].pattern;
  const rule = ruleForCurrentScope();
  els.deleteBtn.hidden = !rule;
  els.autoEnable.checked = rule ? rule.autoEnable !== false : true;
  const scopeLabel = state.scopes.find((s) => s.pattern === state.currentScope)?.label || 'site';
  els.autoEnable.parentElement.querySelector('span').textContent =
    `Auto-apply when I open this ${scopeLabel}`;
  els.saveSiteBtn.textContent = rule ? 'Update site settings' : 'Save settings for this site';
  els.saveSiteBtn.disabled = !state.capturable;
}

function renderPresets() {
  els.presetGrid.innerHTML = '';
  const activeId = matchPresetId(state.settings);
  for (const p of window.AUDIO_PRESETS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preset-btn' + (p.id === activeId ? ' is-active' : '');
    btn.dataset.id = p.id;
    const name = document.createElement('div');
    name.className = 'preset-name';
    name.textContent = p.name;
    const desc = document.createElement('div');
    desc.className = 'preset-desc';
    desc.textContent = p.desc;
    btn.appendChild(name);
    btn.appendChild(desc);
    btn.addEventListener('click', () => applyPreset(p));
    els.presetGrid.appendChild(btn);
  }
}

function matchPresetId(s) {
  for (const p of window.AUDIO_PRESETS) {
    const ps = p.settings;
    if (
      Math.abs(ps.threshold - s.threshold) < 0.5 &&
      Math.abs(ps.knee - s.knee) < 0.5 &&
      Math.abs(ps.ratio - s.ratio) < 0.2 &&
      Math.abs(ps.attack - s.attack) < 0.0005 &&
      Math.abs(ps.release - s.release) < 0.005 &&
      Math.abs(ps.boost - s.boost) < 0.02
    ) return p.id;
  }
  return null;
}

// ---------- Actions ----------

async function applyPreset(p) {
  state.settings = { ...p.settings };
  renderControls();
  renderPresets();
  if (state.enabled) {
    const r = await send({ type: 'update', tabId: state.tabId, settings: state.settings });
    if (!r?.ok) showError(r?.error || 'Failed to apply preset');
  }
}

let updateTimer = null;
function scheduleUpdate() {
  clearTimeout(updateTimer);
  updateTimer = setTimeout(async () => {
    if (!state.enabled) return;
    await send({ type: 'update', tabId: state.tabId, settings: state.settings });
  }, 30);
}

function bindControls() {
  for (const key of KEYS) {
    const rng = document.getElementById(`rng-${key}`);
    const val = document.getElementById(`val-${key}`);
    rng.addEventListener('input', () => {
      const v = parseFloat(rng.value);
      state.settings[key] = v;
      val.textContent = fmt[key](v);
      rng.style.setProperty('--fill', `${fillPercent(key, v)}%`);
      renderPresets();
      scheduleUpdate();
    });
  }
}

async function onToggle() {
  const wantOn = els.toggle.checked;
  if (wantOn) {
    const r = await send({ type: 'enable', tabId: state.tabId, settings: state.settings });
    if (!r?.ok) {
      els.toggle.checked = false;
      showError(r?.error || 'Could not enable. Try reloading the page.');
      return;
    }
    state.enabled = true;
  } else {
    await send({ type: 'disable', tabId: state.tabId });
    state.enabled = false;
  }
  renderStatus();
}

async function onReset() {
  state.settings = { ...DEFAULT_SETTINGS };
  renderControls();
  renderPresets();
  if (state.enabled) {
    await send({ type: 'update', tabId: state.tabId, settings: state.settings });
  }
}

function onScopeChange() {
  state.currentScope = els.scopeSelect.value;
  renderScope();
}

async function onSaveSite() {
  if (!state.currentScope) return;
  const scopeMeta = state.scopes.find((s) => s.pattern === state.currentScope);
  if (!scopeMeta) return;
  const rule = {
    pattern: state.currentScope,
    scope: scopeMeta.kind,
    settings: { ...state.settings },
    autoEnable: els.autoEnable.checked
  };
  const r = await send({ type: 'saveSiteRule', rule });
  if (!r?.ok) {
    showError(r?.error || 'Save failed');
    return;
  }
  state.rules[rule.pattern] = r.rule;
  renderScope();
  flashButton(els.saveSiteBtn, 'Saved ✓');
}

async function onDeleteRule() {
  if (!state.currentScope) return;
  if (!confirm(`Remove saved settings for "${state.currentScope}"?`)) return;
  const r = await send({ type: 'deleteSiteRule', pattern: state.currentScope });
  if (!r?.ok) {
    showError(r?.error || 'Delete failed');
    return;
  }
  delete state.rules[state.currentScope];
  renderScope();
}

async function onAutoEnableChange() {
  if (!state.currentScope) return;
  if (!state.rules[state.currentScope]) return;
  await send({
    type: 'setRuleAutoEnable',
    pattern: state.currentScope,
    autoEnable: els.autoEnable.checked
  });
  state.rules[state.currentScope].autoEnable = els.autoEnable.checked;
}

function flashButton(btn, text) {
  const orig = btn.textContent;
  btn.textContent = text;
  setTimeout(() => { btn.textContent = orig; }, 1200);
}

function openOptions() {
  if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
  else window.open(chrome.runtime.getURL('options.html'));
}

// ---------- Init ----------

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    showError('No active tab');
    return;
  }
  state.tabId = tab.id;
  state.tabTitle = tab.title || tab.url || '';
  state.tabUrl = tab.url || '';
  state.capturable = isCapturableUrl(state.tabUrl);

  const resp = await send({ type: 'getState', tabId: tab.id });
  if (resp?.ok) {
    state.enabled = resp.enabled;
    state.rules = resp.rules || {};
    state.settings = { ...DEFAULT_SETTINGS, ...resp.settings };
  }

  state.scopes = computeScopes(state.tabUrl);

  let autoEnableTriggered = false;
  if (state.capturable && !resp.hasState) {
    const matched = findMatchingRule(state.rules, state.tabUrl);
    if (matched) {
      state.currentScope = matched.pattern;
      state.settings = { ...DEFAULT_SETTINGS, ...matched.settings };
      if (matched.autoEnable !== false) autoEnableTriggered = true;
    }
  }
  if (!state.currentScope && state.scopes.length > 0) {
    state.currentScope = state.scopes[0].pattern;
  }

  renderStatus();
  renderControls();
  renderPresets();
  renderScope();
  bindControls();

  els.toggle.addEventListener('change', onToggle);
  els.resetBtn.addEventListener('click', onReset);
  els.scopeSelect.addEventListener('change', onScopeChange);
  els.deleteBtn.addEventListener('click', onDeleteRule);
  els.autoEnable.addEventListener('change', onAutoEnableChange);
  els.saveSiteBtn.addEventListener('click', onSaveSite);
  els.openOptsBtn.addEventListener('click', openOptions);

  if (autoEnableTriggered) {
    els.toggle.checked = true;
    await onToggle();
  }
}

init();
