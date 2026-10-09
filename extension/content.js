// État de la session Live
let liveSession = {
  active: false,
  matrix: [],
  seats: {},
  seatElements: {},
  cursor: { r: 0, c: 0 },
  maxRows: 0,
  maxCols: 0
};

// Audio & Synthèse vocale
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
        lower.includes("occupied") || lower.includes("occupé") ||
        lower.includes("unavailable") || lower.includes("indisponible") ||
        lower.includes("blocked") || lower.includes("bloqué") ||
        classStr.includes("disabled") || classStr.includes("occupied") ||
        classStr.includes("unavailable")
      ) {
        status = "occupied";
      } else if (lower.includes("selected") || lower.includes("sélectionné") || classStr.includes("selected")) {
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

// 3. RECONSTRUCTION MATRICIELLE AVEC RANGÉES CONSÉCUTIVES (Inclus rangées entièrement grisées)
function buildDynamicLayout(seats) {
  if (!seats || seats.length === 0) return null;

  const detectedRows = seats.map(s => s.row);
  const minRow = Math.min(...detectedRows);
  const maxRow = Math.max(...detectedRows);

  // Génération de TOUTES les rangées consécutives de minRow à maxRow
  const rows = [];
  for (let r = minRow; r <= maxRow; r++) {
    rows.push(r);
  }

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
      const key = `${rIdx},${cIdx}`;

      if (lettr === "") {
        rowLine.push(0); // Couloir
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
        // Rangée ou siège complètement grisé dans le DOM
        rowLine.push(2); // Marqué comme occupé / indisponible
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

// 4. OVERLAY ET RENDU SUR LES SIÈGES GRISÉS
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

  // A. Dessiner TOUS les sièges (Libres en bleu, Indisponibles/Grisés en gris)
  Object.keys(liveSession.seats).forEach(key => {
    const el = liveSession.seatElements[key];
    const info = liveSession.seats[key];

    if (el) {
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

  // B. Curseur actif en rouge
  const { r, c } = liveSession.cursor;
  const key = `${r},${c}`;
  const targetEl = liveSession.seatElements[key];

  if (targetEl) {
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

// 5. ACTION DE CLIC ET BOUTON DE PAIEMENT
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

function findPaymentButton() {
  const candidates = querySelectorAllDeep("button, a, input[type='button'], input[type='submit']");
  for (const btn of candidates) {
    const text = (btn.textContent || btn.value || "").toLowerCase();
    if (
      text.includes("continue") || text.includes("suivant") ||
      text.includes("pay") || text.includes("paiment") || text.includes("paiement") ||
      text.includes("confirm") || text.includes("next leg")
    ) {
      return btn;
    }
  }
  return null;
}

function proceedToPayment() {
  const payBtn = findPaymentButton();
  if (payBtn) {
    playTone(1000, "sine", 0.4);
    speak("Redirection vers la séquence de paiement.");
    payBtn.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => { payBtn.click(); }, 1000);
  } else {
    speak("Bouton de paiement non trouvé sur cette vue.");
  }
}

function renderCurrentPosition() {
  const { r, c } = liveSession.cursor;
  const cellValue = liveSession.matrix[r]?.[c];
  const seatInfo = liveSession.seats[`${r},${c}`];

  drawOverlayCursor();

  if (cellValue === 0) {
    playTone(220, "triangle", 0.05);
    speak("Couloir");
  } else if (cellValue === 2 || (seatInfo && seatInfo.status === "occupied")) {
    playTone(300, "triangle", 0.05);
    speak(`Siège ${seatInfo ? seatInfo.id : ''}, indisponible`);
  } else if (seatInfo) {
    playTone(523, "sine", 0.08);
    speak(`Siège ${seatInfo.id}`);
  }
}

// 6. DÉCLENCHEMENT AUTOMATIQUE VIA RACCOURCI
async function startAutoCapture() {
  speak("Analyse du plan en cours...");
  const rawSeats = analyzeSeatmapDOM();
  const layout = buildDynamicLayout(rawSeats);

  if (!layout || layout.rows === 0) {
    speak("Aucun plan de siège détecté.");
    return;
  }

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

    liveSession.matrix = data.matrix;
    liveSession.seats = data.seats_metadata || data.seats;
    liveSession.maxRows = data.rows;
    liveSession.maxCols = data.cols;
    liveSession.cursor = { r: 0, c: 0 };
    liveSession.active = true;

    window.focus();
    renderCurrentPosition();
    speak("Session tactile activée.");
  } catch (err) {
    speak("Erreur de connexion au serveur Python.");
  }
}

// 7. ÉCOUTEUR CLAVIER ET BOUTON DOT PAD
window.addEventListener("keydown", (e) => {
  // Raccourci de lancement rapide : Alt + S
  if (e.altKey && (e.code === "KeyS" || e.key === "s" || e.key === "S")) {
    e.preventDefault();
    startAutoCapture();
    return;
  }

  if (!liveSession.active) return;

  const key = e.code;

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

  // Mode saut rapide aux sièges libres avec Shift + Flèches
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
    // Navigation pas-à-pas standard
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
      speak("Couloir");
    } else if (cellValue === 2) {
      playTone(180, "sawtooth", 0.25);
      speak("Siège indisponible");
    } else {
      playTone(880, "triangle", 0.3);
      speak(`Siège ${seatInfo ? seatInfo.id : ''} sélectionné. Appuyez sur P pour passer au paiement.`);

      liveSession.matrix[r][c] = 2;
      triggerDirectClick(r, c);
      renderCurrentPosition();
    }
    return;
  }

  if (moved) renderCurrentPosition();
}, true);

// Communication Extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "CAPTURE_MAP") {
    startAutoCapture();
    sendResponse({ status: "STARTED" });
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