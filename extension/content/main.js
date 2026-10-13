// ============================================================
// Chef d'orchestre : extraction -> backend -> session
// Responsable : COMMUN — modifier en se concertant
// ============================================================

// 9. DÉCLENCHEMENT DYNAMIQUE AVEC HYBRIDE DOM + IA VISION FALLBACK
async function startAutoCapture() {
  const t = I18N[currentLang];
  speak(t.analyzing);

  const rawSeats = analyzeSeatmapDOM();
  const layout = buildDynamicLayout(rawSeats);

  if (layout && layout.rows > 0 && layout.seatElements) {
    liveSession.seatElements = layout.seatElements;

    try {
      const data = await processSeatmap({
        dynamic_layout: {
          rows: layout.rows,
          cols: layout.cols,
          matrix: layout.matrix,
          seatsMetadata: layout.seatsMetadata
        }
      });
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
        const data = await processSeatmap({ image_base64: response.imageBase64 });
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Le panneau Dot Pad vient de se connecter : on lui renvoie l'état courant.
  if (request.action === "DOTPAD_REQUEST_FRAME") {
    updateDotPadDisplay();
    sendResponse({ status: "OK" });
    return true;
  }

  // Boutons physiques du Dot Pad (section précédente / suivante).
  if (request.action === "DOTPAD_KEY") {
    moveBySection(request.direction, request.sectionRows);
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