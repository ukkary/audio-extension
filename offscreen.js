const ctx = new (window.AudioContext || window.webkitAudioContext)();
const pipelines = new Map();

function applySettings(node, gain, s) {
  const t = ctx.currentTime;
  node.threshold.setValueAtTime(s.threshold, t);
  node.knee.setValueAtTime(s.knee, t);
  node.ratio.setValueAtTime(s.ratio, t);
  node.attack.setValueAtTime(s.attack, t);
  node.release.setValueAtTime(s.release, t);
  gain.gain.setValueAtTime(s.boost, t);
}

async function start(tabId, streamId, settings) {
  if (pipelines.has(tabId)) await stop(tabId);

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId
      }
    },
    video: false
  });

  const source = ctx.createMediaStreamSource(stream);
  const compressor = ctx.createDynamicsCompressor();
  const gain = ctx.createGain();
  applySettings(compressor, gain, settings);

  source.connect(compressor);
  compressor.connect(gain);
  gain.connect(ctx.destination);

  if (ctx.state === 'suspended') {
    try { await ctx.resume(); } catch (_) {}
  }

  pipelines.set(tabId, { stream, source, compressor, gain });
}

async function stop(tabId) {
  const p = pipelines.get(tabId);
  if (!p) return;
  try { p.source.disconnect(); } catch (_) {}
  try { p.compressor.disconnect(); } catch (_) {}
  try { p.gain.disconnect(); } catch (_) {}
  try { p.stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
  pipelines.delete(tabId);
}

function update(tabId, settings) {
  const p = pipelines.get(tabId);
  if (!p) return;
  applySettings(p.compressor, p.gain, settings);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen') return;
  (async () => {
    try {
      if (msg.type === 'start') await start(msg.tabId, msg.streamId, msg.settings);
      else if (msg.type === 'stop') await stop(msg.tabId);
      else if (msg.type === 'update') update(msg.tabId, msg.settings);
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, error: e.message || String(e) });
    }
  })();
  return true;
});
