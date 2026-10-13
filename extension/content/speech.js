// ============================================================
// Synthèse vocale, sons, changement de langue
// Responsable : Personne 3
// ============================================================

// Audio & Synthèse vocale
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let availableVoices = [];

function loadVoices() {
  availableVoices = window.speechSynthesis.getVoices();
}
if (speechSynthesis.onvoiceschanged !== undefined) {
  speechSynthesis.onvoiceschanged = loadVoices;
}
loadVoices();

function getVoiceForLang(langKey) {
  const voices = window.speechSynthesis.getVoices();
  const target = langKey.toLowerCase(); // "fr", "en", "ko"

  // 1. Recherche d'une voix Google / Natural de haute qualité
  let matchedVoice = voices.find(v => {
    const l = (v.lang || "").toLowerCase().replace('_', '-');
    return l.startsWith(target) && (v.name.includes("Google") || v.name.includes("Natural"));
  });

  // 2. Fallback sur n'importe quelle voix installée pour cette langue
  if (!matchedVoice) {
    matchedVoice = voices.find(v => {
      const l = (v.lang || "").toLowerCase().replace('_', '-');
      return l.startsWith(target);
    });
  }

  return matchedVoice;
}

function playTone(freq, type, duration) {
  try {
    if (audioCtx.state === "suspended") audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + duration);
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {}
}

function speak(text, overrideLang = null) {
  const langKey = overrideLang || currentLang;
  const i18nObj = I18N[langKey];
  window.speechSynthesis.cancel();
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = i18nObj.code;
  utterance.rate = 1.15;

  const voice = getVoiceForLang(langKey);
  if (voice) {
    utterance.voice = voice;
  }

  window.speechSynthesis.speak(utterance);
}

// Bascule de langue accessible (Alt + L)
function cycleLanguage() {
  const langs = ["fr", "en", "ko"];
  const nextIdx = (langs.indexOf(currentLang) + 1) % langs.length;
  currentLang = langs[nextIdx];
  
  const langAnnouncement = {
    fr: "Langue : Français",
    en: "Language: English",
    ko: "언어: 한국어"
  };

  speak(langAnnouncement[currentLang], currentLang);
}

// Détection automatique de la langue de la page HTML au chargement
function autoDetectPageLanguage() {
  const htmlLang = (document.documentElement.lang || "").toLowerCase();
  if (htmlLang.startsWith("ko")) currentLang = "ko";
  else if (htmlLang.startsWith("en")) currentLang = "en";
  else currentLang = "fr";
}
autoDetectPageLanguage();
