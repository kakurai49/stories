export function initStoryTTS({
  storySelector = "#story",
  toggleId = "speechToggle",
  pauseId = "speechPause",
  statusId = "speechStatus",
  voiceSelectId = "ttsVoice",
  voiceLabelId = "voiceSelectionStatus",
  voicePresetId = "voicePreset",
  onStart,
  onStop,
  onPause,
  onResume,
  voicePresets = null,
} = {}) {
  const storyElement = document.querySelector(storySelector);
  const toggleButton = document.getElementById(toggleId);
  const pauseButton = document.getElementById(pauseId);
  const statusElement = document.getElementById(statusId);
  const voiceSelect = document.getElementById(voiceSelectId);
  const voiceLabel = document.getElementById(voiceLabelId);
  const voicePresetSelect = document.getElementById(voicePresetId);

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
    voicePreset: "story-voice-preset",
    volume: "story-master-volume",
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

  const defaultRate = 1.0;
  const defaultVolume = 0.85;

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
    volume = Math.min(Math.max(storedVolume, 0), 1);
  }
  const defaultVoicePresets =
    voicePresets ||
    {
      calmFemale: { label: "落ち着いた女性", preferNames: ["Kyoko", "Mizuki", "Sayaka", "Nanami"], lang: "ja", pitch: 1.08, rateMul: 0.95 },
      brightFemale: { label: "明るめ女性", preferNames: ["Hikari", "Haruka", "Ayumi"], lang: "ja", pitch: 1.05, rateMul: 1.02 },
      calmMale: { label: "落ち着いた男性", preferNames: ["Ichiro", "Otoya"], lang: "ja", pitch: 0.95, rateMul: 0.98 },
      auto: { label: "おまかせ", preferNames: [], lang: "ja", pitch: 1.0, rateMul: 1.0 },
    };
  let currentVoicePreset = safeStorage.get(storageKeys.voicePreset) || "calmFemale";

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

  function createVoiceManager({ synth: synthInstance, voiceSelectEl, voiceLabelEl, storageKey = storageKeys.voice }) {
    let voicesCache = [];
    let selected = null;
    let bootstrapStarted = false;
    let bootstrapTimer = null;
    let loggedSelection = false;

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

    function scoreVoice(voice, preset) {
      let score = 0;
      const name = voice.name || "";
      if (isJapaneseVoice(voice)) score += 100;
      if (preset?.preferNames?.some((n) => includesKeyword(name, [n]))) score += 60;
      if (includesKeyword(name, femaleKeywords)) score += 12;
      if (!includesKeyword(name, maleKeywords)) score += 4;
      if (includesKeyword(name, maleKeywords)) score -= 25;
      return score;
    }

    function chooseBestVoice(voices, preset) {
      if (!voices || !voices.length) return null;
      const savedVoiceId = safeStorage.get(storageKey);
      if (savedVoiceId) {
        const saved = voices.find((voice) => voice.voiceURI === savedVoiceId);
        if (saved) return saved;
      }

      const preferredLang = (preset?.lang || "ja").toLowerCase();
      const voiceMatches = voices.filter((v) => (v.lang || "").toLowerCase().startsWith(preferredLang));
      const target = voiceMatches.length ? voiceMatches : voices;

      const sorted = [...target].sort((a, b) => scoreVoice(b, preset) - scoreVoice(a, preset));
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

    function refreshVoicesSync(preset) {
      if (!synthInstance) return [];
      voicesCache = synthInstance.getVoices() || [];
      updateVoiceSelectOptions(voicesCache);
      selected = chooseBestVoice(voicesCache, preset);
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

    function scheduleVoiceBootstrap(preset) {
      if (bootstrapStarted || !synthInstance) return;
      bootstrapStarted = true;
      const delays = [0, 200, 800, 1500];

      const attempt = (index) => {
        const voices = refreshVoicesSync(preset);
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

    function listenVoicesChanged(preset) {
      if (!synthInstance) return;
      const handler = () => refreshVoicesSync(preset);
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
  setVoiceLabel("音声を取得中...");

  function applyVoicePreset(name) {
    const preset = defaultVoicePresets[name] || defaultVoicePresets.calmFemale;
    currentVoicePreset = name;
    safeStorage.set(storageKeys.voicePreset, name);
    voiceManager.refreshVoicesSync(preset);
    voiceManager.scheduleVoiceBootstrap(preset);
    const chosen = voiceManager.getSelectedVoice();
    if (chosen) {
      safeStorage.set(storageKeys.voice, chosen.voiceURI);
      voiceManager.setVoiceLabel(`${chosen.name} / ${chosen.lang || "lang不明"}`);
    }
    pitch = preset.pitch ?? 1.0;
  }

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
      const pauseScale = 1 / Math.max(rate, 0.25);
      const waitDur = Math.min(Math.max((chunk.pauseAfter || 300) * pauseScale, 120), 1600);
      pendingTimeout = setTimeout(() => {
        pendingTimeout = null;
        if (!isReading) return;
        currentIndex += 1;
        speakNext();
      }, waitDur);
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
      const basePause = pauseDurationFromText(chunk, 300);
      const pauseScale = 1 / Math.max(rate, 0.25);
      const wait = Math.min(Math.max(basePause * pauseScale, 120), 1800);
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
    applyVoicePreset(currentVoicePreset);
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
    if (voicePresetSelect) voicePresetSelect.disabled = true;
    voiceManager.setVoiceLabel("このブラウザでは読み上げが利用できません");
    setStatus("このブラウザでは読み上げが利用できません");
    return;
  }

  if (voicePresetSelect) {
    voicePresetSelect.innerHTML = "";
    Object.entries(defaultVoicePresets).forEach(([id, preset]) => {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = preset.label;
      voicePresetSelect.appendChild(opt);
    });
    if (!defaultVoicePresets[currentVoicePreset]) {
      currentVoicePreset = "calmFemale";
    }
    voicePresetSelect.value = currentVoicePreset;
    voicePresetSelect.addEventListener("change", (event) => {
      applyVoicePreset(event.target.value);
    });
  }

  applyVoicePreset(currentVoicePreset);
  voiceManager.bindUIEvents();
  voiceManager.listenVoicesChanged(defaultVoicePresets[currentVoicePreset]);

  toggleButton.addEventListener("click", toggleSpeech);
  if (pauseButton) pauseButton.addEventListener("click", togglePause);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  setStatus("準備OK");
  setPauseState(false, false);

  function setRateExternal(newRate) {
    const clamped = Math.min(Math.max(newRate, 0.5), 2);
    rate = clamped;
  }

  return {
    start: startSpeech,
    stop: () => stopSpeech("停止"),
    toggle: toggleSpeech,
    pause: togglePause,
    isReading: () => isReading,
    setRate: setRateExternal,
    getRate: () => rate,
    setVolume: (newVol) => {
      const clamped = Math.min(Math.max(Number(newVol) || 0, 0), 1);
      volume = clamped;
      safeStorage.set(storageKeys.volume, clamped.toString());
      return clamped;
    },
    setVoicePreset: applyVoicePreset,
    getVoicePreset: () => currentVoicePreset,
  };
}
