export function initStoryTTS({
  storySelector = "#story",
  toggleId = "speechToggle",
  pauseId = "speechPause",
  statusId = "speechStatus",
  rateId = "speechRate",
  rateValueId = "speechRateValue",
  volumeId = "speechVolume",
  volumeValueId = "speechVolumeValue",
  voiceSelectId = "ttsVoice",
  voiceLabelId = "voiceSelectionStatus",
  presetId = "ttsPreset",
  onStart,
  onStop,
  onPause,
  onResume,
} = {}) {
  const storyElement = document.querySelector(storySelector);
  const toggleButton = document.getElementById(toggleId);
  const pauseButton = document.getElementById(pauseId);
  const statusElement = document.getElementById(statusId);
  const rateInput = document.getElementById(rateId);
  const rateValue = document.getElementById(rateValueId);
  const volumeInput = document.getElementById(volumeId);
  const volumeValue = document.getElementById(volumeValueId);
  const voiceSelect = document.getElementById(voiceSelectId);
  const voiceLabel = document.getElementById(voiceLabelId);
  const presetSelect = document.getElementById(presetId);

  // 必須要素（他は任意）
  if (!toggleButton || !statusElement || !storyElement) {
    return;
  }

  const speechSupported =
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    "SpeechSynthesisUtterance" in window;

  const synth = speechSupported ? window.speechSynthesis : null;

  const storageKeys = {
    voice: "story-tts-voice",
    preset: "story-tts-preset",
    volume: "story-tts-volume",
  };

  const safeStorage = {
    get: (key) => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set: (key, value) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* noop */
      }
    },
  };

  const defaultRate = parseFloat(rateInput?.value) || 1.0;
  const defaultVolume = Math.min(
    Math.max(parseFloat(volumeInput?.value) || 0.85, parseFloat(volumeInput?.min) || 0.6),
    parseFloat(volumeInput?.max) || 1.0
  );

  let selectedVoice = null;
  let chunks = [];
  let currentIndex = 0;
  let isReading = false;
  let isPaused = false;
  let rate = defaultRate;
  let pitch = 1.0;
  let volume = defaultVolume;
  let pendingTimeout = null;
  const storedVolume = parseFloat(safeStorage.get(storageKeys.volume));
  if (!Number.isNaN(storedVolume)) {
    volume = Math.min(
      Math.max(storedVolume, parseFloat(volumeInput?.min) || 0.6),
      parseFloat(volumeInput?.max) || 1.0
    );
    if (volumeInput) {
      volumeInput.value = volume;
    }
  }
  let currentPreset = safeStorage.get(storageKeys.preset) || "calmFemale";
  const presets = {
    default: { label: "通常", rate: 1.0, pitch: 1.0, volume: 0.85 },
    calmFemale: { label: "落ち着いた女性ナレーション", rate: 0.9, pitch: 1.14, volume: 0.85 },
    custom: { label: "カスタム", rate: rate, pitch: pitch, volume: volume },
  };

  function applyPreset(name, { updateSelect = true } = {}) {
    const preset = presets[name] || presets.calmFemale;
    currentPreset = name;
    if (name === "custom") {
      rate = preset.rate ?? rate;
      pitch = preset.pitch ?? pitch;
      volume = preset.volume ?? volume;
      if (rateInput) rateInput.value = rate;
      if (volumeInput) volumeInput.value = volume;
    } else {
      rate = preset.rate;
      pitch = preset.pitch;
      volume = preset.volume;
      if (rateInput) rateInput.value = preset.rate;
      if (volumeInput) volumeInput.value = preset.volume;
    }
    updateRateDisplay();
    updateVolumeDisplay();
    if (updateSelect && presetSelect) {
      presetSelect.value = name;
    }
    safeStorage.set(storageKeys.preset, name);
    safeStorage.set(storageKeys.volume, volume.toString());
  }

  function markCustomPreset() {
    currentPreset = "custom";
    presets.custom = { ...presets.custom, rate, pitch, volume };
    if (presetSelect) {
      presetSelect.value = "custom";
    }
    safeStorage.set(storageKeys.preset, "custom");
    safeStorage.set(storageKeys.volume, volume.toString());
  }

  function setStatus(text) {
    statusElement.textContent = text;
  }

  function setToggleState(on) {
    toggleButton.textContent = on ? "読み上げ ON" : "読み上げ OFF";
    toggleButton.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function setPauseState(enabled, paused) {
    if (!pauseButton) return;
    pauseButton.disabled = !enabled;
    pauseButton.textContent = paused ? "再開" : "一時停止";
    pauseButton.setAttribute("aria-pressed", paused ? "true" : "false");
  }

  function updateRateDisplay() {
    if (rateValue && rateInput) {
      rateValue.textContent = Number(rateInput.value).toFixed(1);
    }
  }

  function updateVolumeDisplay() {
    if (volumeValue && volumeInput) {
      volumeValue.textContent = Number(volumeInput.value).toFixed(2);
    }
  }

  function setVoiceLabel(text) {
    if (voiceLabel) {
      voiceLabel.textContent = text || "音声を取得中...";
    }
  }

  function clearPendingTimeout() {
    if (pendingTimeout) {
      clearTimeout(pendingTimeout);
      pendingTimeout = null;
    }
  }

  function splitByNaturalBreaks(text, limit = 80) {
    const separators = ["、", "，", ",", " ", "　"];
    const results = [];
    let remaining = text.trim();
    while (remaining.length > limit) {
      let splitIndex = -1;
      for (const sep of separators) {
        const idx = remaining.lastIndexOf(sep, limit);
        if (idx > splitIndex) {
          splitIndex = idx;
        }
      }
      if (splitIndex <= 0) {
        splitIndex = limit;
      }
      results.push(remaining.slice(0, splitIndex + 1).trim());
      remaining = remaining.slice(splitIndex + 1).trim();
    }
    if (remaining) {
      results.push(remaining);
    }
    return results;
  }

  function normalizeSpeechText(text) {
    if (!text) return "";
    let normalized = text;
    normalized = normalized.replace(/……+/g, "… 。");
    normalized = normalized.replace(/―+|──+/g, "。 ");
    normalized = normalized.replace(/《∞（インフィニティ）》/g, "インフィニティ");
    normalized = normalized.replace(/\bSNS\b/gi, "エスエヌエス");
    normalized = normalized.replace(/フロア\s*A/gi, "フロア エー");
    normalized = normalized.replace(/[「『]/g, "");
    normalized = normalized.replace(/[」』]/g, "");
    normalized = normalized.replace(/\s{2,}/g, " ");
    return normalized.trim();
  }

  function createChunks(text) {
    const cleanText = text
      .replace(/\s+\n/g, "\n")
      .replace(/\n\s+/g, "\n")
      .replace(/\s{2,}/g, " ")
      .trim();
    const sentences = cleanText
      .split(/(?<=[。！？\?])|(?<=！)|(?<=？)/)
      .map((part) => part.trim())
      .filter(Boolean);

    const finalChunks = [];
    sentences.forEach((sentence) => {
      if (sentence.length <= 80) {
        finalChunks.push(sentence);
      } else {
        finalChunks.push(...splitByNaturalBreaks(sentence));
      }
    });
    return finalChunks;
  }

  function createVoiceManager({
    synth: synthInstance,
    voiceSelectEl,
    voiceLabelEl,
    storageKey = storageKeys.voice,
  }) {
    let voicesCache = [];
    let selected = null;
    let bootstrapStarted = false;
    let bootstrapTimer = null;
    let loggedSelection = false;

    const preferredNames = ["sherry", "kyoko", "haruka", "ayumi", "nanami", "mizuki", "sayaka", "hikari", "siri"];
    const maleKeywords = ["male", "男性", "男", "otoya", "ichiro", "hiroshi", "takeo"];
    const femaleKeywords = ["female", "女性", "女"];

    function isJapaneseVoice(voice) {
      const lang = (voice.lang || "").toLowerCase();
      if (!lang) return false;
      if (lang.startsWith("ja") || lang.startsWith("jp")) return true;
      return lang.includes("ja-jp") || (lang[0] === "j" && lang.includes("p"));
    }

    function includesKeyword(name, keywords) {
      const lowerName = (name || "").toLowerCase();
      return keywords.some((kw) => lowerName.includes(kw.toLowerCase()));
    }

    function scoreVoice(voice) {
      let score = 0;
      const name = voice.name || "";
      if (isJapaneseVoice(voice)) score += 100;
      if (includesKeyword(name, preferredNames)) score += 40;
      if (includesKeyword(name, femaleKeywords)) score += 12;
      if (!includesKeyword(name, maleKeywords)) score += 4;
      if (includesKeyword(name, maleKeywords)) score -= 25;
      return score;
    }

    function chooseBestVoice(voices) {
      if (!voices || !voices.length) return null;
      const savedVoiceId = safeStorage.get(storageKey);
      if (savedVoiceId) {
        const saved = voices.find((voice) => voice.voiceURI === savedVoiceId);
        if (saved) return saved;
      }

      const japaneseVoices = voices.filter((v) => isJapaneseVoice(v));
      const target = japaneseVoices.length ? japaneseVoices : voices;

      const sorted = [...target].sort((a, b) => scoreVoice(b) - scoreVoice(a));
      const best = sorted[0];
      if (best) return best;

      const nonMale = voices.filter((voice) => !includesKeyword(voice.name, maleKeywords));
      if (nonMale.length) return nonMale[0];
      return voices[0] || null;
    }

    function updateVoiceLabel(text) {
      if (!voiceLabelEl) return;
      voiceLabelEl.textContent = text;
    }

    function updateVoiceSelectOptions(voices) {
      if (!voiceSelectEl) return;
      voiceSelectEl.innerHTML = "";
      if (!voices.length) {
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "音声を準備中...";
        voiceSelectEl.appendChild(placeholder);
        updateVoiceLabel("音声を取得中...");
        return;
      }

      voices.forEach((voice) => {
        const option = document.createElement("option");
        option.value = voice.voiceURI;
        option.textContent = `${voice.name} (${voice.lang || "unknown"})`;
        voiceSelectEl.appendChild(option);
      });
    }

    function refreshVoicesSync() {
      if (!synthInstance) return [];
      voicesCache = synthInstance.getVoices() || [];
      updateVoiceSelectOptions(voicesCache);
      selected = chooseBestVoice(voicesCache);
      if (selected) {
        if (voiceSelectEl) {
          voiceSelectEl.value = selected.voiceURI;
        }
        updateVoiceLabel(`${selected.name} / ${selected.lang || "lang不明"}`);
        safeStorage.set(storageKey, selected.voiceURI);
      } else if (voicesCache.length) {
        updateVoiceLabel("音声が見つからない（デフォルト音声で再生します）");
      }

      if (!loggedSelection) {
        console.info(
          "[TTS] voices=%d, selected=%s (%s) / %s",
          voicesCache.length,
          selected?.name || "default",
          selected?.lang || "unknown",
          selected?.voiceURI || "no-voiceURI"
        );
        loggedSelection = true;
      }

      return voicesCache;
    }

    function scheduleVoiceBootstrap() {
      if (bootstrapStarted || !synthInstance) return;
      bootstrapStarted = true;
      const delays = [0, 200, 800, 1500];

      const attempt = (index) => {
        const voices = refreshVoicesSync();
        if (voices.length || index >= delays.length - 1) {
          if (bootstrapTimer) {
            clearTimeout(bootstrapTimer);
            bootstrapTimer = null;
          }
          return;
        }
        bootstrapTimer = setTimeout(() => attempt(index + 1), delays[index + 1] - delays[index]);
      };

      attempt(0);
    }

    function handleUIChange(event) {
      if (!synthInstance) return;
      const voices = synthInstance.getVoices();
      const nextVoice = voices.find((voice) => voice.voiceURI === event.target.value);
      if (nextVoice) {
        selected = nextVoice;
        safeStorage.set(storageKey, nextVoice.voiceURI);
        updateVoiceLabel(`${nextVoice.name} / ${nextVoice.lang || "lang不明"}`);
      }
    }

    function bindUIEvents() {
      if (!voiceSelectEl) return;
      voiceSelectEl.addEventListener("change", handleUIChange);
    }

    function listenVoicesChanged() {
      if (!synthInstance) return;
      const handler = () => refreshVoicesSync();
      synthInstance.addEventListener("voiceschanged", handler, { once: false });
    }

    return {
      refreshVoicesSync,
      scheduleVoiceBootstrap,
      chooseBestVoice,
      getSelectedVoice: () => selected,
      bindUIEvents,
      listenVoicesChanged,
      setVoiceLabel: updateVoiceLabel,
    };
  }

  const voiceManager = createVoiceManager({
    synth,
    voiceSelectEl: voiceSelect,
    voiceLabelEl: voiceLabel,
  });

  function pauseDurationFromText(chunk, fallback = 250) {
    if (chunk && typeof chunk.pauseAfter === "number") return chunk.pauseAfter;
    const text = chunk?.text || "";
    const trimmed = text.trim();
    const lastChar = trimmed.slice(-1);
    if (lastChar === "。") return 320;
    if (lastChar === "！" || lastChar === "!") return 380;
    if (lastChar === "？" || lastChar === "?") return 380;
    return fallback;
  }

  function speechItemsFromStory() {
    if (!storyElement) return [];
    const queue = [];

    const traverse = (node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node;
        if (el.dataset && el.dataset.tts === "ignore") return;

        if (el.classList.contains("scene-break")) {
          queue.push({ pauseOnly: true, pauseAfter: 1000 });
          return;
        }

        if (el.matches("h2")) {
          const text = normalizeSpeechText(el.innerText);
          if (text) queue.push({ text, pauseAfter: 450 });
          return;
        }

        if (el.classList.contains("dialogue")) {
          const nameEl = el.querySelector(".character-name");
          const speaker = nameEl ? nameEl.textContent.trim() : "";
          const contentParts = [];
          el.childNodes.forEach((child) => {
            if (child === nameEl) return;
            if (child.nodeType === Node.TEXT_NODE) {
              contentParts.push(child.textContent);
            } else if (child.nodeType === Node.ELEMENT_NODE && !child.matches(".character-name")) {
              contentParts.push(child.textContent);
            }
          });
          const dialogueText = normalizeSpeechText(contentParts.join(" "));
          const finalText = speaker ? `${speaker}。 ${dialogueText}` : dialogueText;
          if (finalText) queue.push({ text: finalText, pauseAfter: 350 });
          return;
        }

        if (el.matches("p")) {
          const text = normalizeSpeechText(el.innerText);
          if (text) queue.push({ text, pauseAfter: 600 });
          return;
        }
      }

      if (node.childNodes && node.childNodes.length) {
        node.childNodes.forEach((child) => traverse(child));
      }
    };

    traverse(storyElement);
    return queue;
  }

  function expandQueue(items) {
    const expanded = [];
    items.forEach((item) => {
      if (item.pauseOnly) {
        expanded.push({ pauseOnly: true, pauseAfter: item.pauseAfter });
        return;
      }
      const parts = createChunks(item.text);
      if (!parts.length) return;
      parts.forEach((part, idx) => {
        const isLast = idx === parts.length - 1;
        expanded.push({
          text: part,
          pauseAfter: isLast ? item.pauseAfter : 220,
        });
      });
    });
    return expanded;
  }

  function stopSpeech(reason = "停止") {
    if (speechSupported) {
      clearPendingTimeout();
      synth.cancel();
    }
    isReading = false;
    isPaused = false;
    currentIndex = 0;
    chunks = [];
    setToggleState(false);
    setPauseState(false, false);
    setStatus(reason);
    if (typeof onStop === "function") {
      onStop(reason);
    }
  }

  function speakNext() {
    if (!speechSupported || !isReading) return;
    if (currentIndex >= chunks.length) {
      stopSpeech("完了");
      return;
    }

    const chunk = chunks[currentIndex];
    selectedVoice = voiceManager.getSelectedVoice();
    if (chunk.pauseOnly) {
      setStatus(`読み上げ中 ${Math.min(currentIndex + 1, chunks.length)}/${chunks.length}`);
      pendingTimeout = setTimeout(() => {
        pendingTimeout = null;
        if (!isReading) return;
        currentIndex += 1;
        speakNext();
      }, chunk.pauseAfter || 400);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(chunk.text);
    utterance.lang = "ja-JP";
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = volume;
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    utterance.onend = () => {
      if (!isReading) return;
      currentIndex += 1;
      setStatus(`読み上げ中 ${Math.min(currentIndex + 1, chunks.length)}/${chunks.length}`);
      const wait = pauseDurationFromText(chunk, 300);
      pendingTimeout = setTimeout(() => {
        pendingTimeout = null;
        speakNext();
      }, wait);
    };

    utterance.onerror = () => {
      stopSpeech("エラーが発生しました");
    };

    setStatus(`読み上げ中 ${currentIndex + 1}/${chunks.length}`);
    synth.speak(utterance);
  }

  function startSpeech() {
    if (!speechSupported) return;
    clearPendingTimeout();
    voiceManager.refreshVoicesSync();
    voiceManager.scheduleVoiceBootstrap();
    selectedVoice = voiceManager.getSelectedVoice();
    const items = speechItemsFromStory();
    chunks = expandQueue(items);
    if (!chunks.length) {
      setStatus("本文が見つかりません");
      return;
    }
    isReading = true;
    isPaused = false;
    currentIndex = 0;
    setToggleState(true);
    setPauseState(true, false);
    if (typeof onStart === "function") {
      onStart();
    }
    speakNext();
  }

  function toggleSpeech() {
    if (!isReading) {
      startSpeech();
    } else {
      stopSpeech("停止");
    }
  }

  function togglePause() {
    if (!speechSupported || !isReading) return;
    if (!isPaused) {
      clearPendingTimeout();
      synth.pause();
      isPaused = true;
      setPauseState(true, true);
      setStatus("一時停止中");
      if (typeof onPause === "function") {
        onPause();
      }
    } else {
      synth.resume();
      isPaused = false;
      setPauseState(true, false);
      if (!synth.speaking && !pendingTimeout) {
        speakNext();
      } else {
        setStatus(`読み上げ中 ${currentIndex + 1}/${chunks.length}`);
      }
      if (typeof onResume === "function") {
        onResume();
      }
    }
  }

  function handleVisibilityChange() {
    if (document.hidden && isReading) {
      stopSpeech("タブが非表示になったため停止しました");
    }
  }

  if (!presets[currentPreset]) {
    currentPreset = "calmFemale";
  }
  applyPreset(currentPreset);
  setVoiceLabel("音声を取得中...");

  if (!speechSupported) {
    toggleButton.disabled = true;
    if (pauseButton) pauseButton.disabled = true;
    if (voiceSelect) voiceSelect.disabled = true;
    if (presetSelect) presetSelect.disabled = true;
    voiceManager.setVoiceLabel("このブラウザでは読み上げが利用できません");
    setStatus("このブラウザでは読み上げが利用できません");
    updateRateDisplay();
    updateVolumeDisplay();
    return;
  }

  voiceManager.refreshVoicesSync();
  voiceManager.scheduleVoiceBootstrap();
  voiceManager.bindUIEvents();
  voiceManager.listenVoicesChanged();

  toggleButton.addEventListener("click", toggleSpeech);
  if (pauseButton) pauseButton.addEventListener("click", togglePause);
  if (rateInput) {
    rateInput.addEventListener("input", () => {
      rate = parseFloat(rateInput.value) || 1.0;
      updateRateDisplay();
      markCustomPreset();
    });
  }
  if (volumeInput) {
    volumeInput.addEventListener("input", () => {
      volume = Math.min(
        Math.max(parseFloat(volumeInput.value) || 0.85, parseFloat(volumeInput.min) || 0.6),
        parseFloat(volumeInput.max) || 1.0
      );
      updateVolumeDisplay();
      safeStorage.set(storageKeys.volume, volume.toString());
      markCustomPreset();
    });
  }
  if (presetSelect) {
    presetSelect.addEventListener("change", (event) => {
      applyPreset(event.target.value, { updateSelect: false });
    });
  }
  document.addEventListener("visibilitychange", handleVisibilityChange);

  setStatus("準備OK");
  setPauseState(false, false);
  updateRateDisplay();
  updateVolumeDisplay();

  function setRateExternal(newRate) {
    const minVal = parseFloat(rateInput?.min) || 0.5;
    const maxVal = parseFloat(rateInput?.max) || 2;
    const clamped = Math.min(Math.max(newRate, minVal), maxVal);
    rate = clamped;
    if (rateInput) {
      rateInput.value = clamped;
    }
    updateRateDisplay();
    markCustomPreset();
  }

  return {
    start: startSpeech,
    stop: () => stopSpeech("停止"),
    toggle: toggleSpeech,
    pause: togglePause,
    isReading: () => isReading,
    setRate: setRateExternal,
    getRate: () => rate,
  };
}
