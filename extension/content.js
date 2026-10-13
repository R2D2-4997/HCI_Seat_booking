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

// Référence de l'appareil Dot Pad (WebHID)
let dotPadDevice = null;

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

      // 1 = Siège libre (0xFF / picot levé), 0 ou 2 = Couloir / Siège indisponible (0x00 / picot baissé)
      let pinState = (cellValue === 1) ? 0xFF : 0x00;

      // Surbrillance du curseur actif
      if (r === cursorR && c === cursorC) {
        pinState = 0xFF;
      }

      displayBuffer[dotIndex] = pinState;
    }
  }

  try {
    await dotPadDevice.sendReport(0x00, displayBuffer);
  } catch (err) {
    console.error("Erreur d'envoi vers le Dot Pad :", err);
  }
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

// 3. AUTO-SCROLL (Défilement automatique quand le siège sort de l'écran)
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
  } else if (liveSession.canvasElem) {
    const rect = liveSession.canvasElem.getBoundingClientRect();
    const cellHeight = rect.height / liveSession.maxRows;
    const seatY = rect.top + window.scrollY + (r + 0.5) * cellHeight;

    if (seatY < window.scrollY + 100 || seatY > window.scrollY + window.innerHeight - 100) {
      window.scrollTo({
        top: Math.max(0, seatY - window.innerHeight / 2),
        behavior: "smooth"
      });
    }
  }
}

// 4. EXTRACTION DYNAMIQUE DES SIÈGES DU DOM & CANVAS
function analyzeSeatmapDOM() {
  const candidates = querySelectorAllDeep("button, [aria-label], [data-seat], g, rect, div, path, text");
  const detectedSeats = [];
  const seatRegex = /(?:seat|siège|rangée|row)?\s*(\d{1,2})\s*([A-K])/i;

  candidates.forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0 || rect.width > 200 || rect.height > 200) return;

    const aria = el.getAttribute("aria-label") || "";
    const id = el.id || "";
    const dataSeat = el.getAttribute("data-seat") || el.getAttribute("aria-label") || "";
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

// 5. RECONSTRUCTION MATRICIELLE
function buildDynamicLayout(seats) {
  if ((!seats || seats.length === 0) && liveSession.canvasElem) {
    const canvas = liveSession.canvasElem;
    const rows = 5;
    const cols = 7;
    const colLetters = ["A", "B", "C", "", "D", "E", "F"];
    const matrix = [];
    const seatsMetadata = {};
    const seatElements = {};

    for (let r = 0; r < rows; r++) {
      const rowLine = [];
      for (let c = 0; c < cols; c++) {
        const key = `${r},${c}`;
        if (c === 3 || colLetters[c] === "") {
          rowLine.push(0);
          continue;
        }

        const seatId = `${r + 1}${colLetters[c]}`;
        const targetBtn = document.querySelector(`[data-seat="${seatId}"]`) ||
                            document.querySelector(`#seat-${seatId}`) || canvas;

        const isOccupied = targetBtn.hasAttribute("disabled") || targetBtn.getAttribute("data-status") === "occupied";
        const statusCode = isOccupied ? 2 : 1;

        rowLine.push(statusCode);
        seatsMetadata[key] = {
          id: seatId,
          type: "Standard",
          price: isOccupied ? "Indisponible" : "Disponible",
          status: isOccupied ? "occupied" : "available"
        };
        seatElements[key] = targetBtn;
      }
      matrix.push(rowLine);
    }

    return {
      rows: rows,
      cols: cols,
      matrix: matrix,
      seatsMetadata: seatsMetadata,
      seatElements: seatElements
    };
  }

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

// 6. OVERLAY CANVAS & CURSEUR VISUEL
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

// 7. CLIC DIRECT
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
    speak("Bouton de paiement non trouvé.");
  }
}

function renderCurrentPosition() {
  const { r, c } = liveSession.cursor;
  const cellValue = liveSession.matrix[r]?.[c];
  const seatInfo = liveSession.seats[`${r},${c}`];

  autoScrollToCursor(r, c);
  drawOverlayCursor();
  updateDotPadDisplay();

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

// 8. DÉCLENCHEMENT DYNAMIQUE
async function startAutoCapture() {
  speak("Analyse du plan en cours...");
  const rawSeats = analyzeSeatmapDOM();
  const layout = buildDynamicLayout(rawSeats);

  if (!layout) {
    speak("Aucun plan détecté.");
    return;
  }

  liveSession.seatElements = layout.seatElements;

  const payload = {
    dynamicLayout: {
      rows: layout.rows,
      cols: layout.cols,
      matrix: layout.matrix,
      seatsMetadata: layout.seatsMetadata
    }
  };

  try {
    const res = await fetch("http://127.0.0.1:8000/process-seatmap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dynamic_layout: payload.dynamicLayout })
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
    return payload;
  } catch (err) {
    speak("Erreur de connexion au serveur Python.");
    return payload;
  }
}

// 9. ÉCOUTEURS CLAVIER ET MESSAGES
window.addEventListener("keydown", (e) => {
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
      speak("Couloir");
    } else if (cellValue === 2) {
      playTone(180, "sawtooth", 0.25);
      speak("Siège indisponible");
    } else {
      playTone(880, "triangle", 0.3);
      speak(`Siège ${seatInfo ? seatInfo.id : ''} sélectionné.`);

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
    startAutoCapture().then(payload => {
      sendResponse(payload);
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