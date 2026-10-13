// ============================================================
// Pont vers le Dot Pad
// Responsable : Personne 3
//
// La connexion au Dot Pad vit dans la page Dot Pad (dotpad-page/),
// ouverte dans un onglet, contrairement au popup qui se ferme. Ce fichier lui envoie
// simplement la matrice et la position du curseur à afficher.
// ============================================================

function updateDotPadDisplay() {
  if (!liveSession.active) return;

  chrome.runtime.sendMessage({
    action: "DOTPAD_RENDER",
    matrix: liveSession.matrix,
    cursor: liveSession.cursor
  }).catch(() => {
    // Panneau latéral fermé : rien à afficher.
  });
}
