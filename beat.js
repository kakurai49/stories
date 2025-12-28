// Lightweight beat sequencer for story1.html
// Extracted from etc/spec.html: AudioContext + scheduler + simple 808-ish synths
// UI wiring is provided by the caller via element IDs.

const PRESETS = {
  calm: {
    label: "明るい・落ち着く",
    bpm: 96,
    tracks: {
      K: "x-------x-------",
      S: "----x-------x---",
      H: "--x---x---x---x-",
    },
    master: 0.32,
  },
  hype: {
    label: "テンション上げる",
    bpm: 142,
    tracks: {
      K: "x-x---x-x-x---x-",
      S: "----x-------x---",
      H: "xxxxxxxxxxxxxxxx",
    },
    master: 0.32,
  },
  neutral: {
    label: "当たり障りない（人ビート）",
    bpm: 112,
    tracks: {
      K: "x---x---x---x---",
      S: "----x-------x---",
      H: "x-x-x-x-x-x-x-x-",
    },
    master: 0.32,
  },
};

function parsePattern(str = "") {
  return str.split("").map((ch) => ch.toLowerCase() === "x");
}

export function initBeatController({
  presetSelectId = "beatPreset",
  volumeSliderId = "beatVolume",
  duckLevel = 0.75,
} = {}) {
  const presetSelect = document.getElementById(presetSelectId);
  const volumeSlider = document.getElementById(volumeSliderId);

  const N_STEPS = 16;
  const instruments = ["K", "S", "H"];
  let currentPreset = "calm";

  let ctx = null;
  let masterGain = null;
  let limiter = null;
  let isPlaying = false;
  let currentStep = 0;
  let nextTime = 0;
  let timerId = null;
  let baseVolume = volumeSlider ? Number(volumeSlider.value) || 0.35 : 0.35;

  const model = {
    bpm: PRESETS[currentPreset].bpm,
    master: PRESETS[currentPreset].master,
    tracks: {
      K: parsePattern(PRESETS[currentPreset].tracks.K),
      S: parsePattern(PRESETS[currentPreset].tracks.S),
      H: parsePattern(PRESETS[currentPreset].tracks.H),
    },
  };

  function ensureAudio() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();

    masterGain = ctx.createGain();
    masterGain.gain.value = model.master * baseVolume;

    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 18;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.12;

    masterGain.connect(limiter);
    limiter.connect(ctx.destination);
    return ctx;
  }

  function updateVolume(vol) {
    baseVolume = Math.min(Math.max(vol, 0), 1);
    if (masterGain) {
      masterGain.gain.cancelScheduledValues(0);
      masterGain.gain.setTargetAtTime(model.master * baseVolume, ctx.currentTime, 0.01);
    }
  }

  function applyPreset(name) {
    if (!PRESETS[name]) return;
    currentPreset = name;
    const p = PRESETS[name];
    model.bpm = p.bpm;
    model.master = p.master;
    for (const inst of instruments) {
      model.tracks[inst] = parsePattern(p.tracks[inst]).slice(0, N_STEPS);
    }
    updateVolume(baseVolume);
  }

  function setPresetFromSelect(value) {
    applyPreset(value);
  }

  // -----------------------------
  // Synths
  // -----------------------------
  function playKick(time) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();

    o.type = "sine";
    o.frequency.setValueAtTime(140, time);
    o.frequency.exponentialRampToValueAtTime(55, time + 0.1);

    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.9, time + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);

    o.connect(g);
    g.connect(masterGain);

    o.start(time);
    o.stop(time + 0.2);
  }

  function makeNoiseBuffer(durationSec) {
    const length = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  function playSnare(time) {
    const noise = ctx.createBufferSource();
    noise.buffer = makeNoiseBuffer(0.12);

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "highpass";
    noiseFilter.frequency.value = 900;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.7, time + 0.003);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(masterGain);

    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(180, time);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.25, time + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.08);

    o.connect(g);
    g.connect(masterGain);

    noise.start(time);
    noise.stop(time + 0.13);
    o.start(time);
    o.stop(time + 0.1);
  }

  function playHat(time) {
    const noise = ctx.createBufferSource();
    noise.buffer = makeNoiseBuffer(0.05);

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 6000;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.45, time + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);

    noise.connect(hp);
    hp.connect(g);
    g.connect(masterGain);

    noise.start(time);
    noise.stop(time + 0.06);
  }

  function trigger(inst, time) {
    if (inst === "K") return playKick(time);
    if (inst === "S") return playSnare(time);
    if (inst === "H") return playHat(time);
    return undefined;
  }

  // -----------------------------
  // Scheduler
  // -----------------------------
  function stepDurationSec() {
    return 60 / model.bpm / 4; // 16th note
  }

  function scheduleAhead() {
    if (!isPlaying) return;
    const lookAhead = 0.12;
    const interval = stepDurationSec();

    while (nextTime < ctx.currentTime + lookAhead) {
      for (const inst of instruments) {
        if (model.tracks[inst][currentStep]) {
          trigger(inst, nextTime);
        }
      }
      nextTime += interval;
      currentStep = (currentStep + 1) % N_STEPS;
    }

    timerId = setTimeout(scheduleAhead, 25);
  }

  async function start() {
    if (isPlaying) return;
    ensureAudio();
    try {
      await ctx.resume();
    } catch (e) {
      // ignore resume errors
    }
    updateVolume(baseVolume);
    isPlaying = true;
    currentStep = 0;
    nextTime = ctx.currentTime + 0.03;
    scheduleAhead();
  }

  function stop() {
    isPlaying = false;
    if (timerId) clearTimeout(timerId);
    timerId = null;
  }

  function duck() {
    if (!masterGain || !ctx) return;
    masterGain.gain.setTargetAtTime(model.master * baseVolume * duckLevel, ctx.currentTime, 0.02);
  }

  function unduck() {
    if (!masterGain || !ctx) return;
    masterGain.gain.setTargetAtTime(model.master * baseVolume, ctx.currentTime, 0.05);
  }

  // -----------------------------
  // UI binding
  // -----------------------------
  if (presetSelect) {
    presetSelect.innerHTML = "";
    Object.entries(PRESETS).forEach(([key, preset]) => {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = preset.label;
      presetSelect.appendChild(opt);
    });
    presetSelect.value = currentPreset;
    presetSelect.addEventListener("change", (e) => {
      setPresetFromSelect(e.target.value);
    });
  }

  if (volumeSlider) {
    volumeSlider.addEventListener(
      "input",
      (e) => {
        updateVolume(Number(e.target.value));
      },
      { passive: true }
    );
  }

  return {
    start,
    stop,
    duck,
    unduck,
    setPreset: applyPreset,
    setVolume: updateVolume,
    getPreset: () => currentPreset,
    getVolume: () => baseVolume,
  };
}
