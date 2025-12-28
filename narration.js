import { initStoryTTS } from "./tts.js";
import { initBeatController } from "./beat.js";

export const VOICE_PRESETS = {
  auto: { label: "自動（おすすめ）", preferNames: [], lang: "ja", pitch: 1.0, rateMul: 1.0 },
  calmFemale: { label: "落ち着いた女性", preferNames: ["Kyoko", "Mizuki", "Sayaka", "Nanami"], lang: "ja", pitch: 1.04, rateMul: 0.96 },
  brightFemale: { label: "明るい女性", preferNames: ["Hikari", "Haruka", "Ayumi"], lang: "ja", pitch: 1.05, rateMul: 1.05 },
  maleLow: { label: "低めの男性", preferNames: ["Ichiro", "Otoya"], lang: "ja", pitch: 0.92, rateMul: 0.98 },
  narrator: { label: "ナレーター（中立）", preferNames: [], lang: "ja", pitch: 1.0, rateMul: 1.0 },
};

const storageKeys = {
  voicePreset: "story-voice-preset",
  beatPreset: "story-beat-preset",
  masterVolume: "story-master-volume",
};

const defaultVolumes = {
  master: 0.85,
};

let activeControllers = null;

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

function populateVoicePresetOptions(selectEl, initialValue = "auto") {
  if (!selectEl) return "auto";
  selectEl.innerHTML = "";
  Object.entries(VOICE_PRESETS).forEach(([id, preset]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = preset.label;
    selectEl.appendChild(opt);
  });
  if (selectEl.options.length === 0) {
    const fallback = document.createElement("option");
    fallback.value = "auto";
    fallback.textContent = "自動（おすすめ）";
    selectEl.appendChild(fallback);
  }
  const value = VOICE_PRESETS[initialValue] ? initialValue : "auto";
  selectEl.value = value;
  return value;
}

export function initNarration({ reason = "manual", force = false } = {}) {
  const statusEl = document.getElementById("speechStatus");

  const fail = (message, error = null) => {
    if (statusEl) {
      statusEl.textContent = `初期化失敗: ${message}（コンソールも確認）`;
    }
    if (error) {
      console.error("[narration] init failed", error);
    }
  };

  try {
    let controls = document.querySelector(".tts-controls");
    if (!controls) {
      fail("必須要素(.tts-controls)が見つかりません");
      return null;
    }

    if (activeControllers && force) {
      try {
        activeControllers.tts?.stop?.();
      } catch (e) {
        console.error("[narration] stop tts on force", e);
      }
      try {
        activeControllers.beat?.stop?.();
      } catch (e) {
        console.error("[narration] stop beat on force", e);
      }
      activeControllers = null;
    }

    if (controls.dataset.initialized === "1" && !force) {
      if (statusEl) statusEl.textContent = "準備OK";
      return activeControllers;
    }

    if (controls.dataset.initialized === "1" && force) {
      const replacement = controls.cloneNode(true);
      controls.replaceWith(replacement);
      controls = replacement;
    }

    const storyElement = document.querySelector("#story");
    if (!storyElement) {
      fail("必須要素が見つかりません (#story)");
      return null;
    }

    const requiredIds = {
      toggle: "speechToggle",
      pause: "speechPause",
      voicePreset: "voicePreset",
      beatPreset: "beatPreset",
      masterVolume: "masterVolume",
      status: "speechStatus",
    };

    const required = Object.fromEntries(Object.entries(requiredIds).map(([key, id]) => [key, document.getElementById(id)]));

    const missing = Object.entries(required)
      .filter(([, el]) => !el)
      .map(([key]) => requiredIds[key]);

    if (missing.length) {
      fail(`必須要素が見つかりません (${missing.join(", ")})`);
      return null;
    }

    const optional = {
      masterVolumeValue: document.getElementById("masterVolumeValue"),
      tempoStatus: document.getElementById("tempoStatus"),
      mixStatus: document.getElementById("mixStatus"),
      voiceSelectionStatus: document.getElementById("voiceSelectionStatus"),
    };

    required.status.textContent = "準備中...";
    if (optional.voiceSelectionStatus) {
      optional.voiceSelectionStatus.textContent = "音声を取得中...";
    }

    const storedVoicePreset = readString(storageKeys.voicePreset, "auto");
    const storedBeatPreset = readString(storageKeys.beatPreset, "calm");
    const storedMaster = clamp(readNumber(storageKeys.masterVolume, defaultVolumes.master), 0, 1);

    required.masterVolume.value = storedMaster;
    if (optional.masterVolumeValue) {
      optional.masterVolumeValue.textContent = storedMaster.toFixed(2);
    }

    const voicePresetValue = populateVoicePresetOptions(required.voicePreset, storedVoicePreset);

    const beatController = initBeatController({
      presetSelectId: "beatPreset",
      duckLevel: 0.72,
    });

    if (storedBeatPreset) {
      beatController.setPreset(storedBeatPreset);
      required.beatPreset.value = storedBeatPreset;
    }

    const tts = initStoryTTS({
      toggleId: "speechToggle",
      pauseId: "speechPause",
      statusId: "speechStatus",
      voicePresetId: "voicePreset",
      voiceLabelId: optional.voiceSelectionStatus ? "voiceSelectionStatus" : undefined,
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
      voicePresets: VOICE_PRESETS,
    });

    if (!tts) {
      controls.dataset.initialized = "1";
      controls.dataset.initReason = reason;
      return null;
    }

    function updateTempoStatus(bpm, rate) {
      if (!optional.tempoStatus) return;
      optional.tempoStatus.textContent = `BPM ${bpm.toFixed(0)} / rate ${rate.toFixed(2)}`;
    }

    function syncRateWithBeat() {
      const bpm = beatController.getBpm ? beatController.getBpm() : 120;
      const presetId = required.voicePreset.value || "auto";
      const preset = VOICE_PRESETS[presetId];
      let rate = clamp(bpm / 120, 0.8, 1.35);
      if (preset?.rateMul) {
        rate = clamp(rate * preset.rateMul, 0.6, 1.6);
      }
      tts.setRate(rate);
      updateTempoStatus(bpm, rate);
    }

    tts.setVoicePreset(voicePresetValue);
    syncRateWithBeat();

    function applyMasterVolume(vol) {
      const clamped = clamp(vol, 0, 1);
      const beatVol = beatController.setMasterVolume ? beatController.setMasterVolume(clamped) : clamped;
      const ttsVol = tts.setVolume ? tts.setVolume(clamped) : clamped;
      if (optional.masterVolumeValue) {
        optional.masterVolumeValue.textContent = clamped.toFixed(2);
      }
      saveValue(storageKeys.masterVolume, clamped.toString());
      return { beatVol, ttsVol };
    }

    applyMasterVolume(storedMaster);

    required.beatPreset.addEventListener("change", (e) => {
      beatController.setPreset(e.target.value);
      saveValue(storageKeys.beatPreset, e.target.value);
      syncRateWithBeat();
    });

    required.masterVolume.addEventListener("input", (e) => {
      const vol = Number(e.target.value) || 0;
      applyMasterVolume(vol);
    });

    required.voicePreset.addEventListener("change", (e) => {
      const id = e.target.value;
      saveValue(storageKeys.voicePreset, id);
      tts.setVoicePreset(id);
      syncRateWithBeat();
    });

    controls.dataset.initialized = "1";
    controls.dataset.initReason = reason;
    required.status.textContent = "準備OK";

    activeControllers = { beat: beatController, tts };
    return activeControllers;
  } catch (error) {
    fail(error?.message || String(error), error);
    return null;
  }
}
