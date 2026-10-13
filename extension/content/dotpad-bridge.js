// ============================================================
// Pont vers le Dot Pad
// Responsable : Personne 3
//
// La connexion au Dot Pad vit dans le panneau latéral (sidepanel/),
// qui reste ouvert, contrairement au popup. Ce fichier lui envoie
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
