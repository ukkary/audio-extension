// AI-curated compressor presets.
// Each preset targets a real-world listening scenario.
window.AUDIO_PRESETS = [
  {
    id: 'flat',
    name: 'Flat',
    desc: 'No compression, unity gain',
    settings: { threshold: 0, knee: 0, ratio: 1, attack: 0.003, release: 0.25, boost: 1.0 }
  },
  {
    id: 'speech',
    name: 'Speech Clarity',
    desc: 'Podcasts, lectures, dialogue',
    settings: { threshold: -30, knee: 6, ratio: 8, attack: 0.003, release: 0.1, boost: 1.5 }
  },
  {
    id: 'music',
    name: 'Music Master',
    desc: 'Glue without squash',
    settings: { threshold: -18, knee: 12, ratio: 3, attack: 0.01, release: 0.25, boost: 1.2 }
  },
  {
    id: 'movie',
    name: 'Movie Night',
    desc: 'Tame booms, lift dialogue',
    settings: { threshold: -24, knee: 10, ratio: 6, attack: 0.005, release: 0.15, boost: 1.4 }
  },
  {
    id: 'limiter',
    name: 'Loud Limiter',
    desc: 'Hard ceiling, no peaks',
    settings: { threshold: -6, knee: 0, ratio: 20, attack: 0.001, release: 0.05, boost: 1.0 }
  },
  {
    id: 'night',
    name: 'Late Night',
    desc: 'Even volume at low levels',
    settings: { threshold: -40, knee: 4, ratio: 10, attack: 0.005, release: 0.1, boost: 1.8 }
  },
  {
    id: 'voicechat',
    name: 'Voice Chat',
    desc: 'Discord, Meet, Zoom focus',
    settings: { threshold: -28, knee: 6, ratio: 5, attack: 0.003, release: 0.12, boost: 1.3 }
  },
  {
    id: 'twitch',
    name: 'Twitch / Stream',
    desc: 'Even out gameplay + voice',
    settings: { threshold: -26, knee: 8, ratio: 4, attack: 0.004, release: 0.18, boost: 1.6 }
  }
];
