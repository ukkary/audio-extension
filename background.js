const OFFSCREEN_PATH = 'offscreen.html';

const DEFAULT_SETTINGS = {
  threshold: -24,
  knee: 30,
  ratio: 12,
  attack: 0.003,
  release: 0.25,
  boost: 1.0
};

const tabStates = new Map();
let statesLoaded = false;

async function loadStates() {
  if (statesLoaded) return;
  const data = await chrome.storage.session.get('tabStates');
  if (data.tabStates) {
    for (const [tabId, state] of Object.entries(data.tabStates)) {
      tabStates.set(parseInt(tabId, 10), state);
    }
  }
  statesLoaded = true;
}

async function persistStates() {
  const obj = {};
  for (const [tabId, state] of tabStates.entries()) obj[tabId] = state;
  await chrome.storage.session.set({ tabStates: obj });
}

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });
  if (contexts.length > 0) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ['USER_MEDIA'],
    justification: 'Process tab audio through Web Audio API compressor.'
  });
}

function getMediaStreamId(targetTabId) {
  return new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId }, (streamId) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(streamId);
    });
  });
}

function sendToOffscreen(message) {
  return chrome.runtime.sendMessage({ ...message, target: 'offscreen' });
}

async function enableForTab(tabId, settings) {
  await ensureOffscreen();
  const streamId = await getMediaStreamId(tabId);
  await sendToOffscreen({ type: 'start', tabId, streamId, settings });
  tabStates.set(tabId, { enabled: true, settings });
  await persistStates();
  updateBadge(tabId, true);
}

async function disableForTab(tabId) {
  try {
    await sendToOffscreen({ type: 'stop', tabId });
  } catch (_) {}
  const prev = tabStates.get(tabId);
  tabStates.set(tabId, { enabled: false, settings: prev?.settings || DEFAULT_SETTINGS });
  await persistStates();
  updateBadge(tabId, false);
}

async function updateSettings(tabId, settings) {
  const state = tabStates.get(tabId);
  if (state) state.settings = settings;
  await persistStates();
  if (state?.enabled) {
    try {
      await sendToOffscreen({ type: 'update', tabId, settings });
    } catch (_) {}
  }
}

const ICON_ON = {
  16: 'icons/icon16.png',
  32: 'icons/icon32.png',
  48: 'icons/icon48.png',
  128: 'icons/icon128.png'
};
const ICON_OFF = {
  16: 'icons/icon-gray16.png',
  32: 'icons/icon-gray32.png',
  48: 'icons/icon-gray48.png',
  128: 'icons/icon-gray128.png'
};

function updateBadge(tabId, enabled) {
  chrome.action.setIcon({ tabId, path: enabled ? ICON_ON : ICON_OFF }).catch(() => {});
}

// ---------- Site rules ----------

async function getSiteRules() {
  const data = await chrome.storage.local.get('siteRules');
  return data.siteRules || {};
}

async function saveSiteRule(rule) {
  const rules = await getSiteRules();
  rules[rule.pattern] = {
    pattern: rule.pattern,
    scope: rule.scope,
    settings: rule.settings,
    autoEnable: rule.autoEnable !== false,
    updatedAt: Date.now()
  };
  await chrome.storage.local.set({ siteRules: rules });
  return rules[rule.pattern];
}

async function deleteSiteRule(pattern) {
  const rules = await getSiteRules();
  delete rules[pattern];
  await chrome.storage.local.set({ siteRules: rules });
}

async function updateSiteRuleAutoEnable(pattern, autoEnable) {
  const rules = await getSiteRules();
  if (rules[pattern]) {
    rules[pattern].autoEnable = autoEnable;
    rules[pattern].updatedAt = Date.now();
    await chrome.storage.local.set({ siteRules: rules });
  }
}

// ---------- Message router ----------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'background') return;
  (async () => {
    await loadStates();
    try {
      switch (msg.type) {
        case 'enable':
          await enableForTab(msg.tabId, msg.settings);
          sendResponse({ ok: true });
          break;
        case 'disable':
          await disableForTab(msg.tabId);
          sendResponse({ ok: true });
          break;
        case 'update':
          await updateSettings(msg.tabId, msg.settings);
          sendResponse({ ok: true });
          break;
        case 'getState': {
          const state = tabStates.get(msg.tabId);
          const stored = await chrome.storage.local.get('globalSettings');
          const rules = await getSiteRules();
          sendResponse({
            ok: true,
            enabled: state?.enabled ?? false,
            settings: state?.settings ?? stored.globalSettings ?? DEFAULT_SETTINGS,
            hasState: !!state,
            globalSettings: stored.globalSettings ?? DEFAULT_SETTINGS,
            rules
          });
          break;
        }
        case 'saveGlobalSettings':
          await chrome.storage.local.set({ globalSettings: msg.settings });
          sendResponse({ ok: true });
          break;
        case 'resetGlobalSettings':
          await chrome.storage.local.set({ globalSettings: DEFAULT_SETTINGS });
          sendResponse({ ok: true, settings: DEFAULT_SETTINGS });
          break;
        case 'listSiteRules': {
          const rules = await getSiteRules();
          sendResponse({ ok: true, rules });
          break;
        }
        case 'saveSiteRule': {
          const saved = await saveSiteRule(msg.rule);
          sendResponse({ ok: true, rule: saved });
          break;
        }
        case 'deleteSiteRule':
          await deleteSiteRule(msg.pattern);
          sendResponse({ ok: true });
          break;
        case 'setRuleAutoEnable':
          await updateSiteRuleAutoEnable(msg.pattern, msg.autoEnable);
          sendResponse({ ok: true });
          break;
        default:
          sendResponse({ ok: false, error: 'unknown type' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e.message || String(e) });
    }
  })();
  return true;
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await loadStates();
  if (tabStates.has(tabId)) {
    try {
      await sendToOffscreen({ type: 'stop', tabId });
    } catch (_) {}
    tabStates.delete(tabId);
    await persistStates();
  }
});

chrome.runtime.onStartup.addListener(() => loadStates());
chrome.runtime.onInstalled.addListener(() => loadStates());
