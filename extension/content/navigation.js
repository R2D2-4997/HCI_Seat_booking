// ============================================================
// Navigation clavier et annonce de la position
// Responsable : Personne 3
// ============================================================

// `prefix` est lu juste avant la description du siège, dans la même phrase :
// deux appels à speak() se couperaient l'un l'autre.
function renderCurrentPosition(prefix = "") {
  const { r, c } = liveSession.cursor;
  const cellValue = liveSession.matrix[r]?.[c];
  const seatInfo = liveSession.seats[`${r},${c}`];
  const t = I18N[currentLang];

  autoScrollToCursor(r, c);
  drawOverlayCursor();
  updateDotPadDisplay();

  if (cellValue === 0) {
    playTone(220, "triangle", 0.05);
    speak(prefix + t.aisle);
  } else if (cellValue === 3) {
    playTone(660, "sine", 0.08);
    speak(`${prefix}${t.seat} ${seatInfo ? seatInfo.id : ''}, ${t.selectedState}`);
  } else if (cellValue === 2 || (seatInfo && seatInfo.status === "occupied")) {
    playTone(300, "triangle", 0.05);
    speak(`${prefix}${t.seat} ${seatInfo ? seatInfo.id : ''}, ${t.occupied}`);
  } else if (seatInfo) {
    playTone(523, "sine", 0.08);
    speak(`${prefix}${t.seat} ${seatInfo.id}`);
  } else if (prefix) {
    speak(prefix);
  }
}

// Cherche une case dans les rangées [startRow, endRow] d'une partie, de A vers F.
// fromBottom : parcourt les rangées du bas vers le haut (bouton LP).
function findInSection(startRow, endRow, fromBottom, accept) {
  for (let i = 0; i <= endRow - startRow; i++) {
    const r = fromBottom ? endRow - i : startRow + i;
    for (let c = 0; c < liveSession.maxCols; c++) {
      if (accept(liveSession.matrix[r]?.[c])) return { r, c };
    }
  }
  return null;
}

// Boutons LP / RP du Dot Pad : partie précédente (-1) ou suivante (+1).
// Le curseur va sur le premier siège libre de la nouvelle partie, en partant
// du haut pour RP et du bas pour LP.
function moveBySection(direction, sectionRows) {
  if (!liveSession.active || !sectionRows) return;

  const t = I18N[currentLang];
  const sectionCount = Math.ceil(liveSession.maxRows / sectionRows);
  const nextSection = Math.floor(liveSession.cursor.r / sectionRows) + direction;

  // Déjà au début ou à la fin de l'avion : on le dit au lieu de ne rien faire.
  if (nextSection < 0 || nextSection >= sectionCount) {
    playTone(180, "sawtooth", 0.2);
    speak(direction < 0 ? t.planeStart : t.planeEnd);
    return;
  }

  const startRow = nextSection * sectionRows;
  const endRow = Math.min(startRow + sectionRows, liveSession.maxRows) - 1;
  const fromBottom = direction < 0;
  let prefix = t.partInfo(nextSection + 1, sectionCount);

  let target = findInSection(startRow, endRow, fromBottom, value => value === 1);
  if (!target) {
    // Aucun siège libre : on se place sur le premier siège de la partie.
    prefix += t.allTaken;
    target = findInSection(startRow, endRow, fromBottom, value => value > 0) ||
             { r: fromBottom ? endRow : startRow, c: 0 };
  }

  liveSession.cursor = target;
  renderCurrentPosition(prefix);
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
    const steps = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] };
    if (steps[key]) {
      if (moveCursor(...steps[key])) return;
    }
  }

  if (key === "Enter" || key === "Space") {
    selectCurrentSeat();
    return;
  }

  if (moved) renderCurrentPosition();
}, true);

// Déplace le curseur d'une case (dr = rangées, dc = colonnes).
// Renvoie false si le curseur est déjà au bord du plan.
function moveCursor(dr, dc) {
  const r = liveSession.cursor.r + dr;
  const c = liveSession.cursor.c + dc;
  if (r < 0 || r >= liveSession.maxRows || c < 0 || c >= liveSession.maxCols) return false;

  liveSession.cursor = { r, c };
  renderCurrentPosition();
  return true;
}

// Position du siège sélectionné (valeur 3), ou null s'il n'y en a pas.
function findSelectedSeat() {
  for (let r = 0; r < liveSession.maxRows; r++) {
    const c = liveSession.matrix[r]?.indexOf(3) ?? -1;
    if (c >= 0) return { r, c };
  }
  return null;
}

// Sélectionne le siège sous le curseur (Entrée, Espace, ou LP maintenu sur le Dot Pad).
// Un seul siège à la fois, comme sur le site : l'ancien redevient libre.
function selectCurrentSeat() {
  const { r, c } = liveSession.cursor;
  const cellValue = liveSession.matrix[r]?.[c];
  const seatInfo = liveSession.seats[`${r},${c}`];
  const t = I18N[currentLang];

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
    const previous = findSelectedSeat();
    if (previous) liveSession.matrix[previous.r][previous.c] = 1;

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
}

// Annule la sélection, où que soit le curseur (F1 maintenu sur le Dot Pad).
// Le siège est recliqué sur le site : la plupart des sites le libèrent ainsi.
function cancelSelection() {
  const t = I18N[currentLang];
  const selected = findSelectedSeat();

  if (!selected) {
    playTone(180, "sawtooth", 0.2);
    speak(t.noSelection);
    return;
  }

  const seatInfo = liveSession.seats[`${selected.r},${selected.c}`];
  liveSession.matrix[selected.r][selected.c] = 1;
  triggerDirectClick(selected.r, selected.c);

  drawOverlayCursor();
  updateDotPadDisplay();

  playTone(440, "triangle", 0.2);
  speak(t.selectionCancelled(seatInfo ? seatInfo.id : ""));
}

// Boutons du Dot Pad (envoyés par la page Dot Pad) :
// F1 gauche, F2 haut, F3 bas, F4 droite ;
// LP maintenu 1 s : sélectionner ; RP maintenu 2 s : passer au paiement ;
// F1 maintenu 2 s : annuler la sélection.
const DOTPAD_MOVES = { 1: [0, -1], 2: [-1, 0], 3: [1, 0], 4: [0, 1] };

function handleDotPadMove(key) {
  if (!liveSession.active || !DOTPAD_MOVES[key]) return;

  // Bord du plan : un son grave plutôt que le silence.
  if (!moveCursor(...DOTPAD_MOVES[key])) playTone(150, "sawtooth", 0.15);
}

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === "DOTPAD_MOVE") handleDotPadMove(request.key);
  if (!liveSession.active) return;
  if (request.action === "DOTPAD_SELECT") selectCurrentSeat();
  if (request.action === "DOTPAD_PAY") proceedToPayment();
  if (request.action === "DOTPAD_CANCEL") cancelSelection();
});
