export function initStoryTTS({
  storySelector = "#story",
  toggleId = "speechToggle",
  pauseId = "speechPause",
  statusId = "speechStatus",
  rateId = "speechRate",
  rateValueId = "speechRateValue",
} = {}) {
  const storyElement = document.querySelector(storySelector);
  const toggleButton = document.getElementById(toggleId);
  const pauseButton = document.getElementById(pauseId);
  const statusElement = document.getElementById(statusId);
  const rateInput = document.getElementById(rateId);
  const rateValue = document.getElementById(rateValueId);

  const speechSupported =
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    "SpeechSynthesisUtterance" in window;

  if (!toggleButton || !pauseButton || !statusElement || !rateInput || !rateValue) {
    return;
  }

  const synth = speechSupported ? window.speechSynthesis : null;
  let selectedVoice = null;
  let chunks = [];
  let currentIndex = 0;
  let isReading = false;
  let isPaused = false;
  let rate = parseFloat(rateInput.value) || 1.0;

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

  function pickVoice() {
    if (!speechSupported) return;
    const voices = synth.getVoices();
    selectedVoice =
      voices.find((voice) => voice.lang && voice.lang.toLowerCase().startsWith("ja")) ||
      voices.find((voice) => voice.lang && voice.lang.toLowerCase().includes("ja"));
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

  function createChunks(text) {
    const cleanText = text
      .replace(/\s+\n/g, "\n")
      .replace(/\n\s+/g, "\n")
      .replace(/\s{2,}/g, " ")
      .trim();
    const sentences = cleanText
      .split(/(?<=[。！？\?])/)
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

  function stopSpeech(reason = "停止") {
    if (speechSupported) {
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

    const utterance = new SpeechSynthesisUtterance(chunks[currentIndex]);
    utterance.lang = "ja-JP";
    utterance.rate = rate;
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    utterance.onend = () => {
      if (!isReading) return;
      currentIndex += 1;
      setStatus(`読み上げ中 ${Math.min(currentIndex + 1, chunks.length)}/${chunks.length}`);
      speakNext();
    };

    utterance.onerror = () => {
      stopSpeech("エラーが発生しました");
    };

    setStatus(`読み上げ中 ${currentIndex + 1}/${chunks.length}`);
    synth.speak(utterance);
  }

  function startSpeech() {
    if (!speechSupported) return;
    const text = storyElement?.innerText?.trim();
    if (!text) {
      setStatus("本文が見つかりません");
      return;
    }
    chunks = createChunks(text);
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
      synth.pause();
      isPaused = true;
      setPauseState(true, true);
      setStatus("一時停止中");
    } else {
      synth.resume();
      isPaused = false;
      setPauseState(true, false);
      setStatus(`読み上げ中 ${currentIndex + 1}/${chunks.length}`);
    }
  }

  function handleVisibilityChange() {
    if (document.hidden && isReading) {
      stopSpeech("タブが非表示になったため停止しました");
    }
  }

  if (!speechSupported) {
    toggleButton.disabled = true;
    pauseButton.disabled = true;
    setStatus("このブラウザでは読み上げが利用できません");
    updateRateDisplay();
    return;
  }

  pickVoice();
  synth.addEventListener("voiceschanged", pickVoice);

  toggleButton.addEventListener("click", toggleSpeech);
  pauseButton.addEventListener("click", togglePause);
  rateInput.addEventListener("input", () => {
    rate = parseFloat(rateInput.value) || 1.0;
    updateRateDisplay();
  });
  document.addEventListener("visibilitychange", handleVisibilityChange);

  setStatus("準備OK");
  setPauseState(false, false);
  updateRateDisplay();
}
