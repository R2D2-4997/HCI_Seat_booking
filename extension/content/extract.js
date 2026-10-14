// ============================================================
// Extraction des sièges depuis la page web
// Responsable : Personne 1
// ============================================================

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
