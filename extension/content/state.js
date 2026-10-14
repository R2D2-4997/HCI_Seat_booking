// ============================================================
// État partagé de la session (curseur, matrice, langue)
// Responsable : COMMUN — modifier en se concertant
// ============================================================

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

// Langue active ("fr", "en", "ko")
let currentLang = "fr";
