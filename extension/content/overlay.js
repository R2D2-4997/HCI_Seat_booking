// ============================================================
// Retour visuel : curseur rouge et défilement automatique
// Responsable : Personne 3
// ============================================================

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
