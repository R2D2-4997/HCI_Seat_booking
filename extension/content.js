// État de la session Live
let liveSession = {
  active: false,
  matrix: [],
  seats: {},
  cursor: { r: 0, c: 1 },
  maxRows: 0,
  maxCols: 0
};

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

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
  utterance.lang = "fr-FR";
  utterance.rate = 1.2;
  window.speechSynthesis.speak(utterance);
}

// Surlignage visuel du siège courant directement sur le canvas web
function drawVisualCursor() {
  const canvas = document.querySelector("#seatmap-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  // Redessiner la grille de base si la fonction du site existe
  if (typeof window.drawSeatMap === "function") {
    window.drawSeatMap();
  }

  // Calcul des coordonnées du siège sur la grille de démo
  const startX = 60;
  const startY = 60;
  const seatW = 38;
  const seatH = 38;
  const gapX = 14;
  const gapY = 16;
  const aisleGap = 35;

  const { r, c } = liveSession.cursor;
  let posX = startX;
  for (let col = 0; col < c; col++) {
    if (liveSession.matrix[r] && liveSession.matrix[r][col] === 0) {
      posX += aisleGap;
    } else {
      posX += seatW + gapX;
    }
  }
  const posY = startY + r * (seatH + gapY);

  // Dessin du cadre de sélection (Curseur virtuel)
  ctx.strokeStyle = "#e53e3e";
  ctx.lineWidth = 4;
  ctx.strokeRect(posX - 3, posY - 3, seatW + 6, seatH + 6);
}

// Mise à jour complète de la position
function renderCurrentPosition() {
  const { r, c } = liveSession.cursor;
  const cellValue = liveSession.matrix[r]?.[c];
  const seatInfo = liveSession.seats[`${r},${c}`];

  // 1. Retour Visuel
  drawVisualCursor();

  // 2. Retour Vocal et Sonore
  if (seatInfo) {
    playTone(523, "sine", 0.08);
    speak(`Siège ${seatInfo.id}, ${seatInfo.price}`);
  } else if (cellValue === 0) {
    playTone(220, "triangle", 0.05);
    speak("Couloir");
  } else {
    playTone(330, "sine", 0.05);
    speak(`Rangée ${r + 1}`);
  }
}

// Gestion des touches du clavier
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
    const seatInfo = liveSession.seats[`${r},${c}`];
    if (seatInfo) {
      playTone(880, "square", 0.25);
      speak(`Réservation du siège ${seatInfo.id}`);
      
      const targetBtn = document.querySelector(`#seat-${seatInfo.id}`);
      if (targetBtn) targetBtn.click();
    } else {
      playTone(150, "square", 0.15);
      speak("Sélection impossible");
    }
    return;
  }

  if (moved) {
    e.preventDefault();
    renderCurrentPosition();
  }
});

// Écoute des commandes de l'extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "CAPTURE_MAP") {
    const canvas = document.querySelector("canvas");
    if (canvas) {
      sendResponse({ image: canvas.toDataURL("image/png") });
    } else {
      sendResponse({ error: "NO_CANVAS_FOUND" });
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
    speak("Session activée. Cliquez sur la page et utilisez les flèches.");
    sendResponse({ status: "LIVE_STARTED" });
  }
  return true;
});