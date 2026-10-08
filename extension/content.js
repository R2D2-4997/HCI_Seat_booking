// État de la session Live
let liveSession = {
  active: false,
  matrix: [],
  seats: {},
  cursor: { r: 0, c: 1 },
  maxRows: 0,
  maxCols: 0,
  targetElem: null
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

// 1. CRÉATION DE LA COUCHE OVERLAY TRANSPARENTE UNIVERSELLE
let overlayCanvas = null;

function getOrCreateOverlay(targetElem) {
  if (!overlayCanvas) {
    overlayCanvas = document.createElement("canvas");
    overlayCanvas.id = "tactile-seat-overlay";
    overlayCanvas.style.position = "absolute";
    overlayCanvas.style.pointerEvents = "none"; // Ne bloque pas les clics sur la page
    overlayCanvas.style.zIndex = "999999";
    document.body.appendChild(overlayCanvas);
  }

  const rect = targetElem.getBoundingClientRect();
  overlayCanvas.style.top = `${rect.top + window.scrollY}px`;
  overlayCanvas.style.left = `${rect.left + window.scrollX}px`;
  overlayCanvas.style.width = `${rect.width}px`;
  overlayCanvas.style.height = `${rect.height}px`;
  overlayCanvas.width = rect.width;
  overlayCanvas.height = rect.height;

  return overlayCanvas;
}

// 2. DESSIN DU CURSEUR UNIVERSEL
function drawOverlayCursor() {
  if (!liveSession.targetElem) return;

  const overlay = getOrCreateOverlay(liveSession.targetElem);
  const ctx = overlay.getContext("2d");
  ctx.clearRect(0, 0, overlay.width, overlay.height);

  // Calcul dynamique des ratios selon la taille du composant détecté
  const cellWidth = overlay.width / liveSession.maxCols;
  const cellHeight = overlay.height / liveSession.maxRows;

  const { r, c } = liveSession.cursor;
  const x = c * cellWidth;
  const y = r * cellHeight;

  // Contour du curseur tactile actif
  ctx.strokeStyle = "#e53e3e";
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 2, y + 2, cellWidth - 4, cellHeight - 4);
}

// 3. SIMULATION DE CLIC UNIVERSEL (PAR COORDONNÉES PIXELS OU SELECTEUR)
function triggerUniversalClick(r, c, seatInfo) {
  // Option A : Sélecteur DOM classique s'il existe
  if (seatInfo && seatInfo.id) {
    const selectorBtn = document.querySelector(`#seat-${seatInfo.id}`);
    if (selectorBtn) {
      selectorBtn.click();
      return;
    }
  }

  // Option B : Clic universel basé sur les coordonnées à l'écran
  if (liveSession.targetElem) {
    const rect = liveSession.targetElem.getBoundingClientRect();
    const cellWidth = rect.width / liveSession.maxCols;
    const cellHeight = rect.height / liveSession.maxRows;

    const clickX = rect.left + (c + 0.5) * cellWidth;
    const clickY = rect.top + (r + 0.5) * cellHeight;

    const targetElement = document.elementFromPoint(clickX, clickY);
    if (targetElement) {
      targetElement.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        clientX: clickX,
        clientY: clickY
      }));
    }
  }
}

// Mise à jour de la position courante
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
      speak(`Siège ${seatInfo.id}, ${seatInfo.price}`);
    }
  } else if (cellValue === 0) {
    playTone(220, "triangle", 0.05);
    speak("Couloir");
  } else {
    playTone(330, "sine", 0.05);
    speak(`Rangée ${r + 1}, colonne ${c + 1}`);
  }
}

// Navigation Clavier
window.addEventListener("keydown", (e) => {
  if (!liveSession.active) return;

  const { r, c } = liveSession.cursor;
  let moved = false;

  if (e.code === "ArrowRight" && c < liveSession.maxCols - 1) {
    liveSession.cursor.c++;
    moved = true;
  } else if (e.code === "ArrowLeft" && c > 0) {
    liveSession.cursor.c--;
    moved = true;
  } else if (e.code === "ArrowDown" && r < liveSession.maxRows - 1) {
    liveSession.cursor.r++;
    moved = true;
  } else if (e.code === "ArrowUp" && r > 0) {
    liveSession.cursor.r--;
    moved = true;
  } else if (e.code === "Enter") {
    e.preventDefault();
    const cellValue = liveSession.matrix[r]?.[c];
    const seatInfo = liveSession.seats[`${r},${c}`];

    if (cellValue === 0) {
      playTone(180, "sawtooth", 0.2);
      speak("Réservation impossible : vous êtes dans le couloir.");
    } else if (cellValue === 2) {
      playTone(180, "sawtooth", 0.25);
      speak("Réservation refusée : siège occupé.");
    } else {
      playTone(880, "triangle", 0.3);
      const label = seatInfo ? seatInfo.id : `${r + 1}-${c + 1}`;
      speak(`Réservation du siège ${label} !`);

      // Marque le siège comme occupé et déclenche le clic universel
      liveSession.matrix[r][c] = 2;
      triggerUniversalClick(r, c, seatInfo);
      renderCurrentPosition();
    }
    return;
  }

  if (moved) {
    e.preventDefault();
    renderCurrentPosition();
  }
});

// Détection du composant de plan de sièges avec filtrage par dimension
function findSeatmapElement() {
  const selectors = [
    "bw-seatmap-svg-deck svg",
    ".bwa-seatmap-page__seatmap svg",
    "bw-seatmap-layout svg",
    "[class*='seatmap'] svg",
    "[class*='seat-map'] svg",
    "[class*='cabin'] svg",
    "canvas",
    "svg"
  ];

  for (const selector of selectors) {
    const candidates = document.querySelectorAll(selector);
    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      // On s'assure d'ignorer les petites icônes de navigation (ex: loupe de 24x24px)
      if (rect.width > 150 && rect.height > 150) {
        return el;
      }
    }
  }
  return null;
}

// Extraction et sérialisation complète du SVG avec inclusion des symboles/defs globaux
function getStandaloneSvgData(svgElem) {
  const clone = svgElem.cloneNode(true);

  if (!clone.getAttribute("xmlns")) {
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }

  // Récupération des symboles référencés par <use href="#..."> situés hors de cet SVG
  const useElems = clone.querySelectorAll("use");
  const missingDefs = new Set();

  useElems.forEach(use => {
    const href = use.getAttribute("href") || use.getAttribute("xlink:href");
    if (href && href.startsWith("#")) {
      const id = href.substring(1);
      if (!clone.querySelector(`#${CSS.escape(id)}`)) {
        const globalDef = document.getElementById(id);
        if (globalDef) {
          missingDefs.add(globalDef.cloneNode(true));
        }
      }
    }
  });

  if (missingDefs.size > 0) {
    let defs = clone.querySelector("defs");
    if (!defs) {
      defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      clone.insertBefore(defs, clone.firstChild);
    }
    missingDefs.forEach(defNode => defs.appendChild(defNode));
  }

  return new XMLSerializer().serializeToString(clone);
}

// Écoute des commandes de l'extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "CAPTURE_MAP") {
    const target = findSeatmapElement();

    if (!target) {
      sendResponse({ error: "NO_ELEMENT_FOUND" });
      return true;
    }

    liveSession.targetElem = target;

    // cas A : Canvas
    if (target.tagName === "CANVAS") {
      sendResponse({ image: target.toDataURL("image/png") });
      return true;
    }

    // cas B : Image standard
    if (target.tagName === "IMG") {
      sendResponse({ image: target.src });
      return true;
    }

    // cas C : SVG (Air France, etc.)
    const svgElem = target.tagName === "SVG" ? target : target.querySelector("svg");

    if (svgElem) {
      try {
        const svgData = getStandaloneSvgData(svgElem);
        const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(svgBlob);

        const img = new Image();
        img.onload = () => {
          const tempCanvas = document.createElement("canvas");
          const rect = svgElem.getBoundingClientRect();

          const svgWidth = parseFloat(svgElem.getAttribute("width")) || rect.width || 600;
          const svgHeight = parseFloat(svgElem.getAttribute("height")) || rect.height || 800;

          tempCanvas.width = svgWidth;
          tempCanvas.height = svgHeight;

          const ctx = tempCanvas.getContext("2d");
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
          ctx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);

          URL.revokeObjectURL(url);
          sendResponse({ image: tempCanvas.toDataURL("image/png") });
        };

        img.onerror = () => {
          URL.revokeObjectURL(url);
          sendResponse({ error: "SVG_RENDER_FAILED" });
        };

        img.src = url;
      } catch (err) {
        sendResponse({ error: "SVG_CONVERSION_FAILED" });
      }
    } else {
      sendResponse({ error: "NO_CAPTURABLE_FORMAT" });
    }
  }

  if (request.action === "START_LIVE_SESSION") {
    liveSession.matrix = request.data.matrix;
    liveSession.seats = request.data.seats;
    liveSession.maxRows = request.data.rows;
    liveSession.maxCols = request.data.cols;
    liveSession.cursor = { r: 0, c: 1 };
    liveSession.active = true;

    renderCurrentPosition();
    speak("Session tactile activée sur la page Air France.");
    sendResponse({ status: "LIVE_STARTED" });
  }

  return true; // Canal asynchrone maintenu
});