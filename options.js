const DEFAULT_SETTINGS = { threshold: -24, knee: 30, ratio: 12, attack: 0.003, release: 0.25, boost: 1.0 };

const fmt = {
  boost:     (v) => `${v.toFixed(2)}x`,
  threshold: (v) => `${Math.round(v)} dB`,
  knee:      (v) => `${Math.round(v)} dB`,
  ratio:     (v) => `${v.toFixed(1)}:1`,
  attack:    (v) => v < 0.01 ? `${(v * 1000).toFixed(1)} ms` : `${Math.round(v * 1000)} ms`,
  release:   (v) => `${Math.round(v * 1000)} ms`
};

const LABEL = {
  boost: 'Boost',
  threshold: 'Threshold',
  knee: 'Knee',
  ratio: 'Ratio',
  attack: 'Attack',
  release: 'Release'
};

const els = {
  rulesList:        document.getElementById('rulesList'),
  rulesEmpty:       document.getElementById('rulesEmpty'),
  rulesCount:       document.getElementById('rulesCount'),
  defaultSummary:   document.getElementById('defaultSummary'),
  resetDefaultsBtn: document.getElementById('resetDefaultsBtn'),
  ver:              document.getElementById('ver')
};

function send(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ ...message, target: 'background' }, (resp) => {
      if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
      else resolve(resp);
    });
  });
}

function matchPresetName(s) {
  if (!window.AUDIO_PRESETS) return 'Custom';
  for (const p of window.AUDIO_PRESETS) {
    const ps = p.settings;
    if (
      Math.abs(ps.threshold - s.threshold) < 0.5 &&
      Math.abs(ps.knee - s.knee) < 0.5 &&
      Math.abs(ps.ratio - s.ratio) < 0.2 &&
      Math.abs(ps.attack - s.attack) < 0.0005 &&
      Math.abs(ps.release - s.release) < 0.005 &&
      Math.abs(ps.boost - s.boost) < 0.02
    ) return p.name;
  }
  return 'Custom';
}

function relativeTime(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

function settingsGrid(settings) {
  const grid = document.createElement('div');
  grid.className = 'settings-grid';
  for (const key of ['boost', 'threshold', 'ratio', 'knee', 'attack', 'release']) {
    const v = settings[key];
    if (v === undefined) continue;
    const pill = document.createElement('div');
    pill.className = 'setting-pill';
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = LABEL[key];
    const value = document.createElement('div');
    value.className = 'value';
    value.textContent = fmt[key](v);
    pill.appendChild(label);
    pill.appendChild(value);
    grid.appendChild(pill);
  }
  return grid;
}

function ruleRow(rule) {
  const row = document.createElement('div');
  row.className = 'rule-row';

  const main = document.createElement('div');
  main.className = 'rule-main';

  const pat = document.createElement('div');
  pat.className = 'rule-pattern';
  pat.textContent = rule.pattern;
  main.appendChild(pat);

  const meta = document.createElement('div');
  meta.className = 'rule-meta';
  const scopePill = document.createElement('span');
  scopePill.className = `scope-pill ${rule.scope}`;
  scopePill.textContent = rule.scope === 'domain' ? 'Domain' : 'Path';
  meta.appendChild(scopePill);
  const presetTag = document.createElement('span');
  presetTag.className = 'preset-tag';
  presetTag.textContent = matchPresetName(rule.settings);
  meta.appendChild(presetTag);
  const updated = document.createElement('span');
  updated.textContent = `updated ${relativeTime(rule.updatedAt)}`;
  meta.appendChild(updated);
  main.appendChild(meta);

  main.appendChild(settingsGrid(rule.settings));

  row.appendChild(main);

  const actions = document.createElement('div');
  actions.className = 'rule-actions';

  const toggleLabel = document.createElement('label');
  toggleLabel.className = 'toggle-mini';
  toggleLabel.title = 'Auto-apply settings when I open this site';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = rule.autoEnable !== false;
  cb.addEventListener('change', async () => {
    await send({ type: 'setRuleAutoEnable', pattern: rule.pattern, autoEnable: cb.checked });
  });
  const track = document.createElement('span');
  track.className = 'toggle-mini-track';
  const thumb = document.createElement('span');
  thumb.className = 'toggle-mini-thumb';
  track.appendChild(thumb);
  const lt = document.createElement('span');
  lt.textContent = 'Auto';
  toggleLabel.appendChild(cb);
  toggleLabel.appendChild(track);
  toggleLabel.appendChild(lt);
  actions.appendChild(toggleLabel);

  const del = document.createElement('button');
  del.className = 'btn-danger';
  del.textContent = 'Delete';
  del.addEventListener('click', async () => {
    if (!confirm(`Remove saved settings for "${rule.pattern}"?`)) return;
    await send({ type: 'deleteSiteRule', pattern: rule.pattern });
    await renderRules();
  });
  actions.appendChild(del);

  row.appendChild(actions);
  return row;
}

async function renderRules() {
  const r = await send({ type: 'listSiteRules' });
  const rules = r?.rules || {};
  const arr = Object.values(rules).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  els.rulesList.innerHTML = '';
  els.rulesCount.textContent = arr.length ? `${arr.length} saved` : '';
  if (arr.length === 0) {
    els.rulesEmpty.hidden = false;
    return;
  }
  els.rulesEmpty.hidden = true;
  for (const rule of arr) els.rulesList.appendChild(ruleRow(rule));
}

async function renderDefaults() {
  const r = await send({ type: 'getState', tabId: -1 });
  const settings = r?.globalSettings || DEFAULT_SETTINGS;
  els.defaultSummary.innerHTML = '';
  const main = document.createElement('div');
  main.className = 'rule-main';
  const meta = document.createElement('div');
  meta.className = 'rule-meta';
  const tag = document.createElement('span');
  tag.className = 'preset-tag';
  tag.textContent = matchPresetName(settings);
  meta.appendChild(tag);
  main.appendChild(meta);
  main.appendChild(settingsGrid(settings));
  els.defaultSummary.appendChild(main);
}

async function init() {
  els.ver.textContent = chrome.runtime.getManifest().version;
  els.resetDefaultsBtn.addEventListener('click', async () => {
    if (!confirm('Reset global defaults to factory settings?')) return;
    await send({ type: 'resetGlobalSettings' });
    await renderDefaults();
  });
  await Promise.all([renderRules(), renderDefaults()]);
}

init();
