// ============================================================
// Navigation clavier et annonce de la position
// Responsable : Personne 3
// ============================================================

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
  } else if (cellValue === 3) {
    playTone(660, "sine", 0.08);
    speak(`${t.seat} ${seatInfo ? seatInfo.id : ''}, ${t.selectedState}`);
  } else if (cellValue === 2 || (seatInfo && seatInfo.status === "occupied")) {
    playTone(300, "triangle", 0.05);
    speak(`${t.seat} ${seatInfo ? seatInfo.id : ''}, ${t.occupied}`);
  } else if (seatInfo) {
    playTone(523, "sine", 0.08);
    speak(`${t.seat} ${seatInfo.id}`);
  }
}

// Saute d'une section du Dot Pad à la suivante (+1) ou à la précédente (-1),
// en déplaçant le curseur d'autant de rangées qu'une section en contient.
function moveBySection(direction, sectionRows) {
  if (!liveSession.active || !sectionRows) return;

  const lastRow = liveSession.maxRows - 1;
  const nextR = Math.min(lastRow, Math.max(0, liveSession.cursor.r + direction * sectionRows));
  if (nextR === liveSession.cursor.r) return;

  liveSession.cursor.r = nextR;
  renderCurrentPosition();
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
    } else if (cellValue === 3) {
      playTone(660, "sine", 0.08);
      speak(`${t.seat} ${seatInfo ? seatInfo.id : ''}, ${t.selectedState}`);
    } else {
      // 3 = sélectionné (motif propre sur le Dot Pad), et non 2 = occupé.
      liveSession.matrix[r][c] = 3;
      triggerDirectClick(r, c);

      // Mise à jour sans renderCurrentPosition() : sa propre annonce
      // couperait le message de confirmation ci-dessous.
      drawOverlayCursor();
      updateDotPadDisplay();

      playTone(880, "triangle", 0.3);
      speak(`${t.seat} ${seatInfo ? seatInfo.id : ''} ${t.selected}`);
    }
    return;
  }

  if (moved) renderCurrentPosition();
}, true);
