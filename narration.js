import { initStoryTTS } from "./tts.js";
import { initBeatController } from "./beat.js";

const storageKeys = {
  voicePreset: "story-voice-preset",
  beatPreset: "story-beat-preset",
  masterVolume: "story-master-volume",
};

const defaultVolumes = {
  master: 0.85,
};

const voicePresets = {
  calmFemale: { label: "落ち着いた女性", preferNames: ["Kyoko", "Mizuki", "Sayaka", "Nanami"], lang: "ja", pitch: 1.08, rateMul: 0.95 },
  brightFemale: { label: "明るめ女性", preferNames: ["Hikari", "Haruka", "Ayumi"], lang: "ja", pitch: 1.05, rateMul: 1.02 },
  calmMale: { label: "落ち着いた男性", preferNames: ["Ichiro", "Otoya"], lang: "ja", pitch: 0.95, rateMul: 0.98 },
  auto: { label: "おまかせ", preferNames: [], lang: "ja", pitch: 1.0, rateMul: 1.0 },
};

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

function readNumber(key, fallback) {
  try {
    const v = parseFloat(localStorage.getItem(key));
    if (Number.isFinite(v)) return v;
  } catch {
    /* ignore */
  }
  return fallback;
}

function readString(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    if (v) return v;
  } catch {
    /* ignore */
  }
  return fallback;
}

function saveValue(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function initNarration() {
  const toggle = document.getElementById("speechToggle");
  const pause = document.getElementById("speechPause");
  const voicePresetSelect = document.getElementById("voicePreset");
  const beatPresetSelect = document.getElementById("beatPreset");
  const masterVolume = document.getElementById("masterVolume");
  const masterVolumeValue = document.getElementById("masterVolumeValue");
  const tempoStatus = document.getElementById("tempoStatus");

  if (!toggle || !voicePresetSelect || !beatPresetSelect || !masterVolume) return;

  const storedVoicePreset = readString(storageKeys.voicePreset, "calmFemale");
  const storedBeatPreset = readString(storageKeys.beatPreset, "calm");
  const storedMaster = clamp(readNumber(storageKeys.masterVolume, defaultVolumes.master), 0, 1);

  masterVolume.value = storedMaster;
  if (masterVolumeValue) {
    masterVolumeValue.textContent = storedMaster.toFixed(2);
  }

  const beatController = initBeatController({
    presetSelectId: "beatPreset",
    duckLevel: 0.72,
  });

  if (storedBeatPreset) {
    beatController.setPreset(storedBeatPreset);
    beatPresetSelect.value = storedBeatPreset;
  }

  const tts = initStoryTTS({
    voicePresetId: "voicePreset",
    onStart: () => {
      beatController.start();
      beatController.duck();
    },
    onStop: () => {
      beatController.stop();
      beatController.unduck();
    },
    onPause: () => beatController.unduck(),
    onResume: () => beatController.duck(),
    voicePresets,
  });

  function updateTempoStatus(bpm, rate) {
    if (!tempoStatus) return;
    tempoStatus.textContent = `BPM ${bpm.toFixed(0)} / rate ${rate.toFixed(2)}`;
  }

  function syncRateWithBeat() {
    const bpm = beatController.getBpm ? beatController.getBpm() : 120;
    const presetId = voicePresetSelect.value || "calmFemale";
    const preset = voicePresets[presetId];
    let rate = clamp(bpm / 120, 0.8, 1.35);
    if (preset?.rateMul) {
      rate = clamp(rate * preset.rateMul, 0.6, 1.6);
    }
    tts.setRate(rate);
    updateTempoStatus(bpm, rate);
  }

  syncRateWithBeat();
  tts.setVoicePreset(voicePresetSelect.value);

  function applyMasterVolume(vol) {
    const clamped = clamp(vol, 0, 1);
    const beatVol = beatController.setMasterVolume ? beatController.setMasterVolume(clamped) : clamped;
    const ttsVol = tts.setVolume ? tts.setVolume(clamped) : clamped;
    if (masterVolumeValue) {
      masterVolumeValue.textContent = clamped.toFixed(2);
    }
    saveValue(storageKeys.masterVolume, clamped.toString());
    return { beatVol, ttsVol };
  }

  applyMasterVolume(storedMaster);

  beatPresetSelect.addEventListener("change", (e) => {
    beatController.setPreset(e.target.value);
    saveValue(storageKeys.beatPreset, e.target.value);
    syncRateWithBeat();
  });

  masterVolume.addEventListener("input", (e) => {
    const vol = Number(e.target.value) || 0;
    applyMasterVolume(vol);
  });

  voicePresetSelect.addEventListener("change", (e) => {
    const id = e.target.value;
    saveValue(storageKeys.voicePreset, id);
    tts.setVoicePreset(id);
    syncRateWithBeat();
  });
}
