// Lightweight beat sequencer for story1.html
// Mix graph: sources -> musicBus -> autoGain -> duckGain -> analyser -> limiter -> masterGain -> destination
// AutoMix lifts/attenuates toward target dB (idle/speech) + user trim; duck() toggles speechActive.
// Tunables: idleTargetDb / speechTargetDb below, userTrim via setVolume(), duckLevel option. Limiter prevents clipping.

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

  // Mix tuning: target dBFS for AutoMix (speech toggles lower target), userTrimDb from slider, limiter as safety.
  // Adjust idleTargetDb/speechTargetDb for baseline loudness, userTrimDb via setVolume (beat slider), duckLevel via init option.
  const idleTargetDb = -18;
  const speechTargetDb = -24;
  let userVolumeSlider = volumeSlider ? Number(volumeSlider.value) || 0.35 : 0.35;
  let userTrimDb = 0;
  let autoGainDb = 0;
  let measuredDb = -120;
  let speechActive = false;

  let ctx = null;
  let musicBus = null;
  let autoGain = null;
  let duckGain = null;
  let limiter = null;
  let masterGain = null;
  let analyser = null;
  let analyserBuffer = null;
  let monitorTimer = null;
  let isPlaying = false;
  let currentStep = 0;
  let nextTime = 0;
  let timerId = null;

  const MIX_UPDATE_MS = 100;
  const MIN_MEASURE_DB = -60;
  const TARGET_SLEW_SEC = 0.08;
  const mixStatusEl = document.getElementById("mixStatus");

  const model = {
    bpm: PRESETS[currentPreset].bpm,
    master: PRESETS[currentPreset].master,
    tracks: {
      K: parsePattern(PRESETS[currentPreset].tracks.K),
      S: parsePattern(PRESETS[currentPreset].tracks.S),
      H: parsePattern(PRESETS[currentPreset].tracks.H),
    },
  };

  // Utilities ---------------------------------------------------------
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function dbToGain(db) {
    return Math.pow(10, db / 20);
  }

  // Audio wiring ------------------------------------------------------
  function ensureAudio() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();

    musicBus = ctx.createGain();
    musicBus.gain.value = model.master;

    autoGain = ctx.createGain();
    autoGain.gain.value = dbToGain(autoGainDb);

    duckGain = ctx.createGain();
    duckGain.gain.value = 1;

    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 18;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.12;

    masterGain = ctx.createGain();
    masterGain.gain.value = 1;

    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyserBuffer = new Float32Array(analyser.fftSize);

    musicBus.connect(autoGain);
    autoGain.connect(duckGain);
    duckGain.connect(analyser);
    analyser.connect(limiter);
    limiter.connect(masterGain);
    masterGain.connect(ctx.destination);
    return ctx;
  }

  function targetDb() {
    return (speechActive ? speechTargetDb : idleTargetDb) + userTrimDb;
  }

  function updateVolume(vol) {
    userVolumeSlider = clamp(vol, 0, 1);
    // Beat slider now acts as trim: 0..1 -> -12..+12 dB offset to target level.
    userTrimDb = lerp(-12, 12, userVolumeSlider);
    updateMixStatus();
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
    if (musicBus && ctx) {
      musicBus.gain.setTargetAtTime(model.master, ctx.currentTime, 0.05);
    }
  }

  function setPresetFromSelect(value) {
    applyPreset(value);
  }

  // Synths ------------------------------------------------------------
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
    g.connect(musicBus);

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
    noiseGain.connect(musicBus);

    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(180, time);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.25, time + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.08);

    o.connect(g);
    g.connect(musicBus);

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
    g.connect(musicBus);

    noise.start(time);
    noise.stop(time + 0.06);
  }

  function trigger(inst, time) {
    if (inst === "K") return playKick(time);
    if (inst === "S") return playSnare(time);
    if (inst === "H") return playHat(time);
    return undefined;
  }

  // Scheduler ---------------------------------------------------------
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
    isPlaying = true;
    currentStep = 0;
    nextTime = ctx.currentTime + 0.03;
    scheduleAhead();
    startMonitor();
  }

  function stop() {
    isPlaying = false;
    if (timerId) clearTimeout(timerId);
    timerId = null;
    stopMonitor();
  }

  function duck() {
    if (!duckGain || !ctx) return;
    speechActive = true;
    duckGain.gain.setTargetAtTime(duckLevel, ctx.currentTime, 0.05);
  }

  function unduck() {
    if (!duckGain || !ctx) return;
    speechActive = false;
    duckGain.gain.setTargetAtTime(1, ctx.currentTime, 0.12);
  }

  // AutoMix ----------------------------------------------------------
  function updateMixStatus() {
    if (!mixStatusEl) return;
    mixStatusEl.textContent = `Beat mix: ${measuredDb.toFixed(1)} dBFS -> target ${targetDb().toFixed(1)} dB (trim ${userTrimDb.toFixed(1)} dB, auto ${autoGainDb.toFixed(1)} dB)`;
  }

  function monitorMix() {
    if (!analyser || !isPlaying) return;
    analyser.getFloatTimeDomainData(analyserBuffer);
    let sum = 0;
    for (let i = 0; i < analyserBuffer.length; i += 1) {
      const v = analyserBuffer[i];
      sum += v * v;
    }
    const rms = Math.sqrt(sum / analyserBuffer.length) || 0;
    const EPS = 1e-8;
    measuredDb = 20 * Math.log10(Math.max(rms, EPS));
    if (measuredDb < MIN_MEASURE_DB) {
      updateMixStatus();
      return;
    }

    const error = targetDb() - measuredDb;
    const delta = clamp(error * 0.3, -1.5, 1.5);
    autoGainDb = clamp(autoGainDb + delta, -12, 24);
    autoGain.gain.setTargetAtTime(dbToGain(autoGainDb), ctx.currentTime, TARGET_SLEW_SEC);
    updateMixStatus();
  }

  function startMonitor() {
    if (monitorTimer) return;
    monitorTimer = setInterval(monitorMix, MIX_UPDATE_MS);
  }

  function stopMonitor() {
    if (monitorTimer) {
      clearInterval(monitorTimer);
      monitorTimer = null;
    }
  }

  // UI binding -------------------------------------------------------
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

  // initialize trim from slider value so AutoMix target is consistent
  updateVolume(userVolumeSlider);

  return {
    start,
    stop,
    duck,
    unduck,
    setPreset: applyPreset,
    setVolume: updateVolume, // maps slider 0..1 to trim dB (-12..+12)
    setMasterVolume: (vol) => {
      ensureAudio();
      const clamped = clamp(Number(vol) || 0, 0, 1);
      masterGain.gain.setTargetAtTime(clamped, ctx.currentTime, 0.02);
      return clamped;
    },
    getPreset: () => currentPreset,
    getBpm: () => model.bpm,
    getVolume: () => userVolumeSlider,
  };
}
