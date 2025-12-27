export function initStoryTTS({
  storySelector = "#story",
  toggleId = "speechToggle",
  pauseId = "speechPause",
  statusId = "speechStatus",
  rateId = "speechRate",
  rateValueId = "speechRateValue",
  voiceSelectId = "ttsVoice",
  voiceLabelId = "voiceSelectionStatus",
  presetId = "ttsPreset",
} = {}) {
  const storyElement = document.querySelector(storySelector);
  const toggleButton = document.getElementById(toggleId);
  const pauseButton = document.getElementById(pauseId);
  const statusElement = document.getElementById(statusId);
  const rateInput = document.getElementById(rateId);
  const rateValue = document.getElementById(rateValueId);
  const voiceSelect = document.getElementById(voiceSelectId);
  const voiceLabel = document.getElementById(voiceLabelId);
  const presetSelect = document.getElementById(presetId);

  const speechSupported =
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    "SpeechSynthesisUtterance" in window;

  if (
    !toggleButton ||
    !pauseButton ||
    !statusElement ||
    !rateInput ||
    !rateValue ||
    !voiceSelect ||
    !voiceLabel ||
    !presetSelect
  ) {
    return;
  }

  const synth = speechSupported ? window.speechSynthesis : null;
  let selectedVoice = null;
  let chunks = [];
  let currentIndex = 0;
  let isReading = false;
  let isPaused = false;
  let rate = parseFloat(rateInput.value) || 1.0;
  let pitch = 1.0;
  let volume = 1.0;
  let pendingTimeout = null;
  const storageKeys = {
    voice: "story-tts-voice",
    preset: "story-tts-preset",
  };
  let currentPreset = localStorage.getItem(storageKeys.preset) || "calmFemale";
  const presets = {
    default: { label: "通常", rate: 1.0, pitch: 1.0, volume: 1.0 },
    calmFemale: { label: "落ち着いた女性ナレーション", rate: 0.9, pitch: 1.14, volume: 1.0 },
    custom: { label: "カスタム", rate: rate, pitch: pitch, volume: volume },
  };

  function applyPreset(name, { updateSelect = true } = {}) {
    const preset = presets[name] || presets.calmFemale;
    currentPreset = name;
    if (name === "custom") {
      rate = preset.rate ?? rate;
      pitch = preset.pitch ?? pitch;
      volume = preset.volume ?? volume;
      rateInput.value = rate;
    } else {
      rate = preset.rate;
      pitch = preset.pitch;
      volume = preset.volume;
      rateInput.value = preset.rate;
    }
    updateRateDisplay();
    if (updateSelect) {
      presetSelect.value = name;
    }
    localStorage.setItem(storageKeys.preset, name);
  }

  function markCustomPreset() {
    currentPreset = "custom";
    presets.custom = { ...presets.custom, rate, pitch, volume };
    presetSelect.value = "custom";
    localStorage.setItem(storageKeys.preset, "custom");
  }

  function setStatus(text) {
    statusElement.textContent = text;
  }

  function setToggleState(on) {
    toggleButton.textContent = on ? "読み上げ ON" : "読み上げ OFF";
    toggleButton.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function setPauseState(enabled, paused) {
    pauseButton.disabled = !enabled;
    pauseButton.textContent = paused ? "再開" : "一時停止";
    pauseButton.setAttribute("aria-pressed", paused ? "true" : "false");
  }

  function updateRateDisplay() {
    rateValue.textContent = Number(rateInput.value).toFixed(1);
  }

  function setVoiceLabel(text) {
    voiceLabel.textContent = text || "音声を取得中...";
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

  function isJapaneseVoice(voice) {
    return voice.lang && voice.lang.toLowerCase().startsWith("ja");
  }

  function includesKeyword(voice, keywords) {
    const lowerName = voice.name.toLowerCase();
    return keywords.some((kw) => lowerName.includes(kw.toLowerCase()));
  }

  function chooseVoice(voices) {
    const savedVoiceId = localStorage.getItem(storageKeys.voice);
    const femaleKeywords = ["female", "女性", "女", "kyoko", "haruka", "ayumi", "nanami", "mizuki", "sayaka", "hikari"];
    const maleKeywords = ["male", "男性", "男", "otoya", "ichiro", "hiroshi", "takeo"];

    if (savedVoiceId) {
      const saved = voices.find((voice) => voice.voiceURI === savedVoiceId);
      if (saved) return saved;
    }

    const jaVoices = voices.filter(isJapaneseVoice);
    const targetList = jaVoices.length ? jaVoices : voices;
    const femaleCandidates = targetList.filter(
      (voice) => includesKeyword(voice, femaleKeywords) && !includesKeyword(voice, maleKeywords)
    );
    if (femaleCandidates.length) {
      return femaleCandidates[0];
    }
    const nonMale = targetList.filter((voice) => !includesKeyword(voice, maleKeywords));
    if (nonMale.length) {
      return nonMale[0];
    }
    return targetList[0] || null;
  }

  function buildVoiceOptions() {
    if (!speechSupported) return;
    const voices = synth.getVoices();
    voiceSelect.innerHTML = "";
    const prioritized = voices.filter(isJapaneseVoice);
    const remainder = voices.filter((v) => !isJapaneseVoice(v));
    const orderedVoices = [...prioritized, ...remainder];
    if (!orderedVoices.length) {
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "音声を準備中...";
      voiceSelect.appendChild(placeholder);
      setVoiceLabel("音声を取得中...");
      return;
    }

    orderedVoices.forEach((voice) => {
      const option = document.createElement("option");
      option.value = voice.voiceURI;
      option.textContent = `${voice.name} (${voice.lang || "unknown"})`;
      voiceSelect.appendChild(option);
    });

    selectedVoice = chooseVoice(orderedVoices);
    if (selectedVoice) {
      voiceSelect.value = selectedVoice.voiceURI;
      setVoiceLabel(`${selectedVoice.name} / ${selectedVoice.lang || "lang不明"}`);
      localStorage.setItem(storageKeys.voice, selectedVoice.voiceURI);
    }
  }

  function handleVoiceChange() {
    if (!speechSupported) return;
    const voices = synth.getVoices();
    const nextVoice = voices.find((voice) => voice.voiceURI === voiceSelect.value);
    if (nextVoice) {
      selectedVoice = nextVoice;
      localStorage.setItem(storageKeys.voice, nextVoice.voiceURI);
      setVoiceLabel(`${nextVoice.name} / ${nextVoice.lang || "lang不明"}`);
    }
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
  }

  function speakNext() {
    if (!speechSupported || !isReading) return;
    if (currentIndex >= chunks.length) {
      stopSpeech("完了");
      return;
    }

    const chunk = chunks[currentIndex];
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
    if (!selectedVoice) {
      buildVoiceOptions();
    }
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
    } else {
      synth.resume();
      isPaused = false;
      setPauseState(true, false);
      if (!synth.speaking && !pendingTimeout) {
        speakNext();
      } else {
        setStatus(`読み上げ中 ${currentIndex + 1}/${chunks.length}`);
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
    pauseButton.disabled = true;
    voiceSelect.disabled = true;
    presetSelect.disabled = true;
    setVoiceLabel("このブラウザでは読み上げが利用できません");
    setStatus("このブラウザでは読み上げが利用できません");
    updateRateDisplay();
    return;
  }

  buildVoiceOptions();
  synth.addEventListener("voiceschanged", buildVoiceOptions);

  toggleButton.addEventListener("click", toggleSpeech);
  pauseButton.addEventListener("click", togglePause);
  rateInput.addEventListener("input", () => {
    rate = parseFloat(rateInput.value) || 1.0;
    updateRateDisplay();
    markCustomPreset();
  });
  voiceSelect.addEventListener("change", handleVoiceChange);
  presetSelect.addEventListener("change", (event) => {
    applyPreset(event.target.value, { updateSelect: false });
  });
  document.addEventListener("visibilitychange", handleVisibilityChange);

  setStatus("準備OK");
  setPauseState(false, false);
  updateRateDisplay();
}
