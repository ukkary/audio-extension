# Audio Compressor Pro

Per-tab audio compressor for Chrome (Manifest V3). Boost quiet videos, tame loud explosions, and fix Twitch clip audio that won't play through Web Audio.

## Features

- **Per-tab On/Off** — enable compression only on the tabs you want
- **Full DynamicsCompressor controls** — Threshold, Knee, Ratio, Attack, Release
- **Boost (Volume)** — up to 4× post-compression makeup gain
- **AI Presets** — Speech Clarity, Music Master, Movie Night, Loud Limiter, Late Night, Voice Chat, Twitch / Stream
- **Per-site rules with scope** — save settings at three levels: whole domain (`youtube.com`), section (`youtube.com/@mrbeast`), or single page
- **Auto-apply** — saved sites auto-enable when you open the popup on a matching URL
- **Settings page** — review, toggle, or delete every saved site rule
- **Twitch clip fix** — uses `tabCapture` instead of `MediaElementAudioSourceNode`, so CORS-tainted media still produces audio

## Install (Developer Mode)

1. Open `chrome://extensions`
2. Toggle **Developer mode** (top right)
3. Click **Load unpacked**
4. Select this folder (`audio-extension/`)
5. Pin the extension from the puzzle-piece menu

## Usage

1. Open a tab playing audio (YouTube, Twitch, etc.)
2. Click the extension icon
3. Toggle the switch **on** — Chrome will start capturing this tab's audio
4. Pick a preset or tweak sliders live
5. Click **Save as Default** to make the current settings the starting point for new tabs

The badge shows `ON` for tabs where compression is active.

## How it works

```
Tab audio  →  tabCapture stream  →  Offscreen Document
                                         │
                                         ├─ MediaStreamAudioSource
                                         ├─ DynamicsCompressorNode
                                         ├─ GainNode (boost)
                                         └─ AudioContext.destination → speakers
```

The offscreen document holds one shared `AudioContext` and a `Map<tabId, pipeline>`, so multiple tabs can be compressed independently.

## File layout

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest |
| `background.js` | Service worker — tab state, `tabCapture.getMediaStreamId` |
| `offscreen.html` / `offscreen.js` | Web Audio pipeline per tab |
| `popup.html` / `popup.css` / `popup.js` | UI |
| `options.html` / `options.css` / `options.js` | Settings page (saved sites, global default) |
| `presets.js` | Curated preset list |

## Notes

- Requires Chrome 116+ (offscreen API + `getMediaStreamId` with `targetTabId`)
- The badge text and tab state reset when the tab is closed
- Compression is bypassed when the toggle is off — no audio path overhead
