// État de la session Live
let liveSession = {
  active: false,
  matrix: [],
  seats: {},
  seatElements: {},
  canvasElem: null,
  cursor: { r: 0, c: 0 },
  maxRows: 0,
  maxCols: 0
};

// Langue active ("fr", "en", "ko")
let currentLang = "fr";

// Dictionnaire trilingue (FR, EN, KO)
const I18N = {
  fr: {
    langName: "Français",
    code: "fr-FR",
    analyzing: "Analyse automatique du plan...",
    ready: "Session tactile activée.",
    aisle: "Couloir",
    occupied: "Siège indisponible",
    seat: "Siège",
    selected: "sélectionné. Appuyez sur P pour passer au paiement.",
    payment: "Redirection vers la séquence de paiement.",
    noPayment: "Bouton de paiement non trouvé.",
    errBackend: "Erreur : Moteur Python non démarré.",
    errCapture: "Erreur lors de la capture d'écran."
  },
  en: {
    langName: "English",
    code: "en-US",
    analyzing: "Automatic seatmap analysis...",
    ready: "Tactile session activated.",
    aisle: "Aisle",
    occupied: "Seat unavailable",
    seat: "Seat",
    selected: "selected. Press P to proceed to payment.",
    payment: "Redirecting to payment sequence.",
    noPayment: "Payment button not found.",
    errBackend: "Error: Python engine not running.",
    errCapture: "Screenshot capture error."
  },
  ko: {
    langName: "한국어",
    code: "ko-KR",
    analyzing: "좌석 배치도 자동 분석 중...",
    ready: "터치 세션이 활성화되었습니다.",
    aisle: "통로",
    occupied: "선택 불가 좌석",
    seat: "좌석",
    selected: "선택되었습니다. 결제하려면 P를 누르세요.",
    payment: "결제 페이지로 이동합니다.",
    noPayment: "결제 버튼을 찾을 수 없습니다.",
    errBackend: "오류: 파이썬 엔진이 실행되지 않았습니다.",
    errCapture: "화면 캡처 오류입니다."
  }
};

// Référence de l'appareil Dot Pad (WebHID)
let dotPadDevice = null;

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

// 1. MISE À JOUR HAPTIQUE DOT PAD (WebHID)
async function updateDotPadDisplay() {
  if (!dotPadDevice) {
    try {
      if ('hid' in navigator) {
        const devices = await navigator.hid.getDevices();
        if (devices.length > 0) {
          dotPadDevice = devices[0];
          if (!dotPadDevice.opened) await dotPadDevice.open();
        }
      }
    } catch (e) {}
  }

  if (!dotPadDevice || !dotPadDevice.opened || !liveSession.active) return;

  const DOTPAD_COLS = 30;
  const DOTPAD_ROWS = 10;
  const displayBuffer = new Uint8Array(DOTPAD_COLS * DOTPAD_ROWS);

  const { r: cursorR, c: cursorC } = liveSession.cursor;

  for (let r = 0; r < liveSession.maxRows; r++) {
    for (let c = 0; c < liveSession.maxCols; c++) {
      if (r >= DOTPAD_ROWS || c >= DOTPAD_COLS) continue;

      const cellValue = liveSession.matrix[r]?.[c];
      const dotIndex = r * DOTPAD_COLS + c;

      let pinState = (cellValue === 1) ? 0xFF : 0x00;
      if (r === cursorR && c === cursorC) {
        pinState = 0xFF;
      }

      displayBuffer[dotIndex] = pinState;
    }
  }

  try {
    await dotPadDevice.sendReport(0x00, displayBuffer);
  } catch (err) {}
}

// 2. RECHERCHE SHADOW DOM
function querySelectorAllDeep(selector, root = document) {
  let results = Array.from(root.querySelectorAll(selector));
  const allElements = root.querySelectorAll('*');
  for (const el of allElements) {
    if (el.shadowRoot) {
      results = results.concat(querySelectorAllDeep(selector, el.shadowRoot));
    }
  }
  return results;
}

// 3. MASQUAGE TEMPORAIRE POPUPS
function hideOverlaysTemporarily() {
  const hiddenElements = [];
  const candidates = querySelectorAllDeep("div, section, aside, iframe, header");

  candidates.forEach(el => {
    const style = window.getComputedStyle(el);
    const className = (el.className || "").toString().toLowerCase();

    if (
      (style.position === "fixed" || style.position === "sticky") &&
      !el.id.includes("tactile-seat") &&
      (parseInt(style.zIndex, 10) > 100 || className.includes("cookie") || className.includes("modal") || className.includes("popup"))
    ) {
      const originalDisplay = el.style.display;
      el.style.display = "none";
      hiddenElements.push({ element: el, originalDisplay });
    }
  });

  return hiddenElements;
}

function restoreOverlays(hiddenElements) {
  hiddenElements.forEach(item => {
    item.element.style.display = item.originalDisplay;
  });
}

// 4. AUTO-SCROLL
function autoScrollToCursor(r, c) {
  const key = `${r},${c}`;
  const targetEl = liveSession.seatElements[key];

  if (targetEl && targetEl !== document.body && typeof targetEl.getBoundingClientRect === "function") {
    const rect = targetEl.getBoundingClientRect();
    const isVisible = (
      rect.top >= 60 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) - 60
    );

    if (!isVisible) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }
  }
}

// 5. EXTRACTION DYNAMIQUE DOM
function analyzeSeatmapDOM() {
  const candidates = querySelectorAllDeep("button, [aria-label], [data-seat], [data-test-id], g, rect, div, span, path, text");
  const detectedSeats = [];
  const seatRegex = /(?:seat|siège|rangée|row|좌석)?\s*(\d{1,2})\s*([A-K])/i;

  candidates.forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0 || rect.width > 200 || rect.height > 200) return;

    const aria = el.getAttribute("aria-label") || "";
    const id = el.id || "";
    const dataSeat = el.getAttribute("data-seat") || el.getAttribute("data-test-id") || "";
    const title = el.getAttribute("title") || "";
    const text = el.textContent ? el.textContent.trim() : "";
    const classStr = (el.className || "").toString().toLowerCase();

    const fullStr = `${aria} ${id} ${dataSeat} ${title} ${text}`;
    const match = fullStr.match(seatRegex);

    if (match) {
      const rowNum = parseInt(match[1], 10);
      const letter = match[2].toUpperCase();
      const seatId = `${rowNum}${letter}`;

      let status = "available";
      const lower = fullStr.toLowerCase();

      if (
        el.hasAttribute("disabled") ||
        el.getAttribute("aria-disabled") === "true" ||
        lower.includes("occupied") || lower.includes("occupé") || lower.includes("선택불가") ||
        lower.includes("unavailable") || lower.includes("indisponible") ||
        classStr.includes("disabled") || classStr.includes("occupied")
      ) {
        status = "occupied";
      }

      if (!detectedSeats.some(s => s.id === seatId)) {
        detectedSeats.push({
          id: seatId,
          row: rowNum,
          letter: letter,
          status: status,
          element: el,
          rect: rect
        });
      }
    }
  });

  const canvas = querySelectorAllDeep("canvas")[0];
  if (canvas) {
    liveSession.canvasElem = canvas;
  }

  return detectedSeats;
}

function findSeatmapElement() {
  const svgs = querySelectorAllDeep("svg, canvas, div[class*='seat'], div[class*='cabin']");
  let best = null;
  let maxA = 0;
  svgs.forEach(el => {
    const r = el.getBoundingClientRect();
    const a = r.width * r.height;
    if (a > maxA && r.height > 100) { maxA = a; best = el; }
  });
  return best || document.body;
}

// 6. RECONSTRUCTION MATRICIELLE
function buildDynamicLayout(seats) {
  if (!seats || seats.length === 0) return null;

  const detectedRows = seats.map(s => s.row);
  const minRow = Math.min(...detectedRows);
  const maxRow = Math.max(...detectedRows);

  const rows = [];
  for (let r = minRow; r <= maxRow; r++) rows.push(r);

  const letters = [...new Set(seats.map(s => s.letter))].sort();

  const colStructure = [];
  for (let i = 0; i < letters.length; i++) {
    colStructure.push(letters[i]);
    if (i < letters.length - 1) {
      const currentCode = letters[i].charCodeAt(0);
      const nextCode = letters[i + 1].charCodeAt(0);
      if (nextCode - currentCode > 1) {
        colStructure.push("");
      }
    }
  }

  const matrix = [];
  const seatsMetadata = {};
  const seatElements = {};

  rows.forEach((rNum, rIdx) => {
    const rowLine = [];
    colStructure.forEach((lettr, cIdx) => {
      const key = `${rIdx},${cIdx}`;

      if (lettr === "") {
        rowLine.push(0);
        return;
      }

      const seatObj = seats.find(s => s.row === rNum && s.letter === lettr);
      if (seatObj) {
        const statusCode = seatObj.status === "occupied" ? 2 : 1;
        rowLine.push(statusCode);

        seatsMetadata[key] = {
          id: seatObj.id,
          type: "Standard",
          price: seatObj.status === "occupied" ? "Indisponible" : "Disponible",
          status: seatObj.status
        };
        seatElements[key] = seatObj.element;
      } else {
        rowLine.push(2);
        seatsMetadata[key] = {
          id: `${rNum}${lettr}`,
          type: "Indisponible",
          price: "Indisponible",
          status: "occupied"
        };
      }
    });
    matrix.push(rowLine);
  });

  return {
    rows: rows.length,
    cols: colStructure.length,
    matrix: matrix,
    seatsMetadata: seatsMetadata,
    seatElements: seatElements
  };
}

// 7. OVERLAY CANVAS & CURSEUR VISUEL
let overlayCanvas = null;

function getOrCreateOverlay() {
  if (!overlayCanvas) {
    overlayCanvas = document.createElement("canvas");
    overlayCanvas.id = "tactile-seat-overlay";
    overlayCanvas.style.position = "absolute";
    overlayCanvas.style.top = "0";
    overlayCanvas.style.left = "0";
    overlayCanvas.style.pointerEvents = "none";
    overlayCanvas.style.zIndex = "999999";
    document.body.appendChild(overlayCanvas);
  }

  const w = Math.max(document.documentElement.scrollWidth, window.innerWidth);
  const h = Math.max(document.documentElement.scrollHeight, window.innerHeight);
  overlayCanvas.width = w;
  overlayCanvas.height = h;
  overlayCanvas.style.width = `${w}px`;
  overlayCanvas.style.height = `${h}px`;

  return overlayCanvas;
}

function drawOverlayCursor() {
  const overlay = getOrCreateOverlay();
  const ctx = overlay.getContext("2d");
  ctx.clearRect(0, 0, overlay.width, overlay.height);

  if (!liveSession.active) return;

  Object.keys(liveSession.seats).forEach(key => {
    const el = liveSession.seatElements[key];
    const info = liveSession.seats[key];

    if (el && el !== document.body && el !== liveSession.canvasElem) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const x = rect.left + window.scrollX;
        const y = rect.top + window.scrollY;

        if (info && info.status === "occupied") {
          ctx.fillStyle = "rgba(128, 128, 128, 0.35)";
          ctx.fillRect(x, y, rect.width, rect.height);
          ctx.strokeStyle = "rgba(80, 80, 80, 0.8)";
        } else {
          ctx.strokeStyle = "rgba(0, 102, 204, 0.6)";
        }
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, rect.width, rect.height);
      }
    }
  });

  const { r, c } = liveSession.cursor;
  const key = `${r},${c}`;
  const targetEl = liveSession.seatElements[key];

  if (targetEl && targetEl !== document.body && targetEl !== liveSession.canvasElem) {
    const rect = targetEl.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const x = rect.left + window.scrollX;
      const y = rect.top + window.scrollY;

      ctx.fillStyle = "rgba(229, 62, 62, 0.35)";
      ctx.fillRect(x, y, rect.width, rect.height);

      ctx.strokeStyle = "#e53e3e";
      ctx.lineWidth = 3.5;
      ctx.strokeRect(x - 2, y - 2, rect.width + 4, rect.height + 4);
    }
  }
}

window.addEventListener("scroll", () => { if (liveSession.active) drawOverlayCursor(); }, true);
window.addEventListener("resize", () => { if (liveSession.active) drawOverlayCursor(); });

// 8. CLIC DIRECT ET CIBLAGE PAIEMENT
function triggerDirectClick(r, c) {
  const key = `${r},${c}`;
  const targetEl = liveSession.seatElements[key];
  const seatInfo = liveSession.seats[key];

  if (seatInfo && seatInfo.id) {
    const selectorBtn = document.querySelector(`[data-seat="${seatInfo.id}"]`) ||
                        document.querySelector(`#seat-${seatInfo.id}`) ||
                        document.querySelector(`button[onclick*='${seatInfo.id}']`);
    if (selectorBtn) {
      selectorBtn.click();
      return;
    }
  }

  const elemToClick = targetEl || liveSession.canvasElem;
  if (elemToClick) {
    const rect = elemToClick.getBoundingClientRect();
    let clickX = rect.left + rect.width / 2;
    let clickY = rect.top + rect.height / 2;

    const eventOptions = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: clickX,
      clientY: clickY,
      view: window
    };

    const targetNode = document.elementFromPoint(clickX, clickY) || elemToClick;
    targetNode.dispatchEvent(new PointerEvent("pointerdown", eventOptions));
    targetNode.dispatchEvent(new MouseEvent("mousedown", eventOptions));
    targetNode.dispatchEvent(new PointerEvent("pointerup", eventOptions));
    targetNode.dispatchEvent(new MouseEvent("mouseup", eventOptions));
    if (typeof targetNode.click === "function") {
      targetNode.click();
    } else {
      targetNode.dispatchEvent(new MouseEvent("click", eventOptions));
    }
  }
}

function findPaymentButton() {
  const candidates = querySelectorAllDeep("button, a, input[type='button'], input[type='submit'], [role='button']");

  for (const btn of candidates) {
    const text = (btn.textContent || btn.value || "").toLowerCase().trim();
    const dataTestId = (btn.getAttribute("data-test-id") || "").toLowerCase();

    if (
      dataTestId.includes("continue") || 
      dataTestId.includes("confirm") ||
      text.includes("continue") ||
      text.includes("passer au paiement") ||
      text.includes("confirm seats") ||
      text.includes("다음") || text.includes("결제") // Mots-clés coréens ("Suivant" / "Paiement")
    ) {
      return btn;
    }
  }

  return null;
}

function proceedToPayment() {
  const payBtn = findPaymentButton();
  const t = I18N[currentLang];

  if (payBtn) {
    playTone(1000, "sine", 0.4);
    speak(t.payment);
    payBtn.scrollIntoView({ behavior: "smooth", block: "center" });

    setTimeout(() => {
      const rect = payBtn.getBoundingClientRect();
      const clickX = rect.left + rect.width / 2;
      const clickY = rect.top + rect.height / 2;

      const eventOptions = {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: clickX,
        clientY: clickY,
        view: window
      };

      payBtn.dispatchEvent(new PointerEvent("pointerdown", eventOptions));
      payBtn.dispatchEvent(new MouseEvent("mousedown", eventOptions));
      payBtn.dispatchEvent(new PointerEvent("pointerup", eventOptions));
      payBtn.dispatchEvent(new MouseEvent("mouseup", eventOptions));

      if (typeof payBtn.click === "function") {
        payBtn.click();
      } else {
        payBtn.dispatchEvent(new MouseEvent("click", eventOptions));
      }
    }, 600);
  } else {
    speak(t.noPayment);
  }
}

function renderCurrentPosition() {
  const { r, c } = liveSession.cursor;
  const cellValue = liveSession.matrix[r]?.[c];
  const seatInfo = liveSession.seats[`${r},${c}`];
  const t = I18N[currentLang];

  autoScrollToCursor(r, c);
  drawOverlayCursor();
  updateDotPadDisplay();

  if (cellValue === 0) {
    playTone(220, "triangle", 0.05);
    speak(t.aisle);
  } else if (cellValue === 2 || (seatInfo && seatInfo.status === "occupied")) {
    playTone(300, "triangle", 0.05);
    speak(`${t.seat} ${seatInfo ? seatInfo.id : ''}, ${t.occupied}`);
  } else if (seatInfo) {
    playTone(523, "sine", 0.08);
    speak(`${t.seat} ${seatInfo.id}`);
  }
}

// 9. DÉCLENCHEMENT DYNAMIQUE AVEC HYBRIDE DOM + IA VISION FALLBACK
async function startAutoCapture() {
  const t = I18N[currentLang];
  speak(t.analyzing);

  const rawSeats = analyzeSeatmapDOM();
  const layout = buildDynamicLayout(rawSeats);

  if (layout && layout.rows > 0 && layout.seatElements) {
    liveSession.seatElements = layout.seatElements;

    try {
      const res = await fetch("http://127.0.0.1:8000/process-seatmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dynamic_layout: {
            rows: layout.rows,
            cols: layout.cols,
            matrix: layout.matrix,
            seatsMetadata: layout.seatsMetadata
          }
        })
      });
      const data = await res.json();
      activateSession(data.matrix, data.seats_metadata || data.seats, data.rows, data.cols);
    } catch (err) {
      activateSession(layout.matrix, layout.seatsMetadata, layout.rows, layout.cols);
    }
    return { status: "SUCCESS" };
  }

  const targetElem = findSeatmapElement();
  if (targetElem) {
    targetElem.scrollIntoView({ behavior: "instant", block: "center" });
  }

  const hiddenOverlays = hideOverlaysTemporarily();

  chrome.runtime.sendMessage({ action: "TAKE_SCREENSHOT" }, async (response) => {
    restoreOverlays(hiddenOverlays);

    if (response && response.imageBase64) {
      try {
        const res = await fetch("http://127.0.0.1:8000/process-seatmap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_base64: response.imageBase64 })
        });
        const data = await res.json();
        activateSession(data.matrix, data.seats_metadata || data.seats, data.rows, data.cols);
      } catch (e) {
        speak(t.errBackend);
      }
    } else {
      speak(t.errCapture);
    }
  });

  return { status: "STARTED" };
}

function activateSession(matrix, seats, rows, cols) {
  const t = I18N[currentLang];
  liveSession.matrix = matrix;
  liveSession.seats = seats;
  liveSession.maxRows = rows;
  liveSession.maxCols = cols;
  liveSession.cursor = { r: 0, c: 0 };
  liveSession.active = true;

  window.focus();
  renderCurrentPosition();
  speak(t.ready);
}

// 10. ÉCOUTEURS CLAVIER
window.addEventListener("keydown", (e) => {
  // Raccourci Changement de Langue : Alt + L
  if (e.altKey && (e.code === "KeyL" || e.key === "l" || e.key === "L")) {
    e.preventDefault();
    cycleLanguage();
    return;
  }

  // Raccourci Capture : Alt + S
  if (e.altKey && (e.code === "KeyS" || e.key === "s" || e.key === "S")) {
    e.preventDefault();
    startAutoCapture();
    return;
  }

  if (!liveSession.active) return;

  const key = e.code;
  const t = I18N[currentLang];

  if (key === "KeyP") {
    e.preventDefault();
    proceedToPayment();
    return;
  }

  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Space"].includes(key)) return;

  e.preventDefault();
  e.stopPropagation();

  let { r, c } = liveSession.cursor;
  let moved = false;

  if (e.shiftKey) {
    if (key === "ArrowRight") {
      for (let nextC = c + 1; nextC < liveSession.maxCols; nextC++) {
        if (liveSession.matrix[r]?.[nextC] === 1) { liveSession.cursor.c = nextC; moved = true; break; }
      }
    } else if (key === "ArrowLeft") {
      for (let nextC = c - 1; nextC >= 0; nextC--) {
        if (liveSession.matrix[r]?.[nextC] === 1) { liveSession.cursor.c = nextC; moved = true; break; }
      }
    } else if (key === "ArrowDown") {
      for (let nextR = r + 1; nextR < liveSession.maxRows; nextR++) {
        if (liveSession.matrix[nextR]?.[c] === 1) { liveSession.cursor.r = nextR; moved = true; break; }
      }
    } else if (key === "ArrowUp") {
      for (let nextR = r - 1; nextR >= 0; nextR--) {
        if (liveSession.matrix[nextR]?.[c] === 1) { liveSession.cursor.r = nextR; moved = true; break; }
      }
    }
  } else {
    if (key === "ArrowRight" && c < liveSession.maxCols - 1) {
      liveSession.cursor.c++;
      moved = true;
    } else if (key === "ArrowLeft" && c > 0) {
      liveSession.cursor.c--;
      moved = true;
    } else if (key === "ArrowDown" && r < liveSession.maxRows - 1) {
      liveSession.cursor.r++;
      moved = true;
    } else if (key === "ArrowUp" && r > 0) {
      liveSession.cursor.r--;
      moved = true;
    }
  }

  if (key === "Enter" || key === "Space") {
    const cellValue = liveSession.matrix[r]?.[c];
    const seatInfo = liveSession.seats[`${r},${c}`];

    if (cellValue === 0) {
      playTone(180, "sawtooth", 0.2);
      speak(t.aisle);
    } else if (cellValue === 2) {
      playTone(180, "sawtooth", 0.25);
      speak(t.occupied);
    } else {
      playTone(880, "triangle", 0.3);
      speak(`${t.seat} ${seatInfo ? seatInfo.id : ''} ${t.selected}`);

      liveSession.matrix[r][c] = 2;
      triggerDirectClick(r, c);
      renderCurrentPosition();
    }
    return;
  }

  if (moved) renderCurrentPosition();
}, true);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "WEBHID_CONNECTED") {
    updateDotPadDisplay();
    sendResponse({ status: "OK" });
    return true;
  }

  if (request.action === "CAPTURE_MAP") {
    startAutoCapture().then(res => sendResponse(res));
    return true;
  }

  if (request.action === "START_LIVE_SESSION") {
    activateSession(
      request.data.matrix,
      request.data.seats_metadata || request.data.seats,
      request.data.rows,
      request.data.cols
    );
    sendResponse({ status: "LIVE_STARTED" });
    return true;
  }

  return true;
});