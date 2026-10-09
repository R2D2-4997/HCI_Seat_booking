// État de la session Live
let liveSession = {
  active: false,
  matrix: [],
  seats: {},
  seatElements: {}, // Stocke la référence directe aux nœuds DOM des sièges
  cursor: { r: 0, c: 0 },
  maxRows: 0,
  maxCols: 0
};

// Synthèse vocale & Audio
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let frenchVoice = null;

function loadBestVoice() {
  const voices = window.speechSynthesis.getVoices();
  frenchVoice = voices.find(v => v.lang.startsWith("fr") && v.name.includes("Google")) ||
                voices.find(v => v.lang.startsWith("fr") && v.name.includes("Natural")) ||
                voices.find(v => v.lang.startsWith("fr")) || null;
}
if (speechSynthesis.onvoiceschanged !== undefined) {
  speechSynthesis.onvoiceschanged = loadBestVoice;
}
loadBestVoice();

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

function speak(text) {
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  if (frenchVoice) utterance.voice = frenchVoice;
  utterance.lang = "fr-FR";
  utterance.rate = 1.15;
  window.speechSynthesis.speak(utterance);
}

// 1. RECHERCHE DANS LE SHADOW DOM
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

// 2. EXTRACTION DYNAMIQUE DES SIÈGES DANS LE DOM
function analyzeSeatmapDOM() {
  const candidates = querySelectorAllDeep("button, [aria-label], [data-seat], g, rect, div, path");
  const detectedSeats = [];
  const seatRegex = /(?:seat|siège|platz|asiento)?\s*(\d{1,2})\s*([A-K])/i;

  candidates.forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0 || rect.width > 120 || rect.height > 120) return;

    const aria = el.getAttribute("aria-label") || "";
    const id = el.id || "";
    const dataSeat = el.getAttribute("data-seat") || el.getAttribute("data-seat-id") || "";
    const title = el.getAttribute("title") || "";
    const text = el.textContent ? el.textContent.trim() : "";

    const fullStr = `${aria} ${id} ${dataSeat} ${title} ${text}`;
    const match = fullStr.match(seatRegex);

    if (match) {
      const rowNum = parseInt(match[1], 10);
      const letter = match[2].toUpperCase();
      const seatId = `${rowNum}${letter}`;

      let status = "available";
      const lower = fullStr.toLowerCase();
      if (lower.includes("occupied") || lower.includes("occupé") || lower.includes("unavailable") || el.hasAttribute("disabled")) {
        status = "occupied";
      } else if (lower.includes("selected") || lower.includes("sélectionné")) {
        status = "selected";
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

  return detectedSeats;
}

// 3. CONSTRUCTION DU LAYOUT MATRICIEL
function buildDynamicLayout(seats) {
  if (!seats || seats.length === 0) return null;

  const rows = [...new Set(seats.map(s => s.row))].sort((a, b) => a - b);
  const letters = [...new Set(seats.map(s => s.letter))].sort();

  const colStructure = [];
  for (let i = 0; i < letters.length; i++) {
    colStructure.push(letters[i]);
    if (i < letters.length - 1) {
      const currentCode = letters[i].charCodeAt(0);
      const nextCode = letters[i + 1].charCodeAt(0);
      if (nextCode - currentCode > 1) {
        colStructure.push(""); // Couloir
      }
    }
  }

  const matrix = [];
  const seatsMetadata = {};
  const seatElements = {};

  rows.forEach((rNum, rIdx) => {
    const rowLine = [];
    colStructure.forEach((lettr, cIdx) => {
      if (lettr === "") {
        rowLine.push(0);
        return;
      }

      const seatObj = seats.find(s => s.row === rNum && s.letter === lettr);
      if (seatObj) {
        const statusCode = seatObj.status === "occupied" ? 2 : 1;
        rowLine.push(statusCode);

        const key = `${rIdx},${cIdx}`;
        seatsMetadata[key] = {
          id: seatObj.id,
          type: "Standard",
          price: "Disponible",
          status: seatObj.status
        };
        seatElements[key] = seatObj.element;
      } else {
        rowLine.push(0);
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

// 4. OVERLAY EN OVERLAY SUR LA PAGE
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

  // A. Dessiner un rectangle bleu discret sur TOUS les sièges détectés
  Object.keys(liveSession.seatElements).forEach(key => {
    const el = liveSession.seatElements[key];
    if (el) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const x = rect.left + window.scrollX;
        const y = rect.top + window.scrollY;
        ctx.strokeStyle = "rgba(0, 102, 204, 0.4)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, rect.width, rect.height);
      }
    }
  });

  // B. Dessiner le curseur actif (rouge vif)
  const { r, c } = liveSession.cursor;
  const key = `${r},${c}`;
  const targetEl = liveSession.seatElements[key];

  if (targetEl) {
    const rect = targetEl.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const x = rect.left + window.scrollX;
      const y = rect.top + window.scrollY;

      // Remplissage semi-transparent
      ctx.fillStyle = "rgba(229, 62, 62, 0.25)";
      ctx.fillRect(x, y, rect.width, rect.height);

      // Contour épais
      ctx.strokeStyle = "#e53e3e";
      ctx.lineWidth = 3;
      ctx.strokeRect(x - 2, y - 2, rect.width + 4, rect.height + 4);
    }
  }
}

// Ré-alignement sur défilement et redimensionnement
window.addEventListener("scroll", () => { if (liveSession.active) drawOverlayCursor(); }, true);
window.addEventListener("resize", () => { if (liveSession.active) drawOverlayCursor(); });

// 5. ACTION DE CLIC DIRECT SUR LE DOM
function triggerDirectClick(r, c) {
  const key = `${r},${c}`;
  const targetEl = liveSession.seatElements[key];

  if (targetEl) {
    const rect = targetEl.getBoundingClientRect();
    const eventOptions = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      view: window
    };

    targetEl.dispatchEvent(new PointerEvent("pointerdown", eventOptions));
    targetEl.dispatchEvent(new MouseEvent("mousedown", eventOptions));
    targetEl.dispatchEvent(new PointerEvent("pointerup", eventOptions));
    targetEl.dispatchEvent(new MouseEvent("mouseup", eventOptions));
    if (typeof targetEl.click === "function") {
      targetEl.click();
    } else {
      targetEl.dispatchEvent(new MouseEvent("click", eventOptions));
    }
  }
}

function renderCurrentPosition() {
  const { r, c } = liveSession.cursor;
  const cellValue = liveSession.matrix[r]?.[c];
  const seatInfo = liveSession.seats[`${r},${c}`];

  drawOverlayCursor();

  if (seatInfo) {
    if (cellValue === 2 || seatInfo.status === "occupied") {
      playTone(300, "triangle", 0.05);
      speak(`Siège ${seatInfo.id}, occupé.`);
    } else {
      playTone(523, "sine", 0.08);
      speak(`Siège ${seatInfo.id}`);
    }
  } else if (cellValue === 0) {
    playTone(220, "triangle", 0.05);
    speak("Couloir");
  }
}

// Navigation Clavier
window.addEventListener("keydown", (e) => {
  if (!liveSession.active) return;

  const key = e.code;
  if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Space"].includes(key)) return;

  e.preventDefault();
  e.stopPropagation();

  const { r, c } = liveSession.cursor;
  let moved = false;

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
  } else if (key === "Enter" || key === "Space") {
    const cellValue = liveSession.matrix[r]?.[c];
    const seatInfo = liveSession.seats[`${r},${c}`];

    if (cellValue === 0) {
      playTone(180, "sawtooth", 0.2);
      speak("Couloir");
    } else if (cellValue === 2) {
      playTone(180, "sawtooth", 0.25);
      speak("Siège occupé");
    } else {
      playTone(880, "triangle", 0.3);
      speak(`Réservation du siège ${seatInfo ? seatInfo.id : ''}`);
      liveSession.matrix[r][c] = 2;
      triggerDirectClick(r, c);
      renderCurrentPosition();
    }
    return;
  }

  if (moved) renderCurrentPosition();
}, true);

// Écouteur de messages Extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "CAPTURE_MAP") {
    const rawSeats = analyzeSeatmapDOM();
    const layout = buildDynamicLayout(rawSeats);

    if (!layout || layout.rows === 0) {
      sendResponse({ error: "NO_SEATS_FOUND" });
      return true;
    }

    // Sauvegarde essentielle des références DOM
    liveSession.seatElements = layout.seatElements;

    sendResponse({
      dynamicLayout: {
        rows: layout.rows,
        cols: layout.cols,
        matrix: layout.matrix,
        seatsMetadata: layout.seatsMetadata
      }
    });
    return true;
  }

  if (request.action === "START_LIVE_SESSION") {
    liveSession.matrix = request.data.matrix;
    liveSession.seats = request.data.seats_metadata || request.data.seats;
    liveSession.maxRows = request.data.rows;
    liveSession.maxCols = request.data.cols;
    liveSession.cursor = { r: 0, c: 0 };
    liveSession.active = true;

    window.focus();
    renderCurrentPosition();
    speak("Session tactile activée.");
    sendResponse({ status: "LIVE_STARTED" });
  }

  return true;
});