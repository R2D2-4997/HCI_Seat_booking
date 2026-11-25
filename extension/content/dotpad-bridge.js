// ============================================================
// Pont vers le Dot Pad
// Responsable : Personne 3
//
// La connexion au Dot Pad vit dans la page Dot Pad (dotpad-page/),
// ouverte dans un onglet, contrairement au popup qui se ferme. Ce fichier lui envoie
// la matrice, la position du curseur et les métadonnées du siège ciblé.
// ============================================================

function updateDotPadDisplay() {
  if (!liveSession.active) return;

  const { r, c } = liveSession.cursor || {};
  const seatInfo = liveSession.seats?.[`${r},${c}`] || null;

  chrome.runtime.sendMessage({
    action: "DOTPAD_RENDER",
    matrix: liveSession.matrix,
    cursor: liveSession.cursor,
    seatInfo
  }).catch(() => {
    // Onglet Dot Pad fermé : rien à afficher.
  });
}
