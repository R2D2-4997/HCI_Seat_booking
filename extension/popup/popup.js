// ============================================================
// Popup de l'extension : lancer la capture, ouvrir le panneau Dot Pad
// Responsable : COMMUN
// ============================================================

const statusDiv = document.getElementById("status");

document.getElementById("btn-capture").addEventListener("click", async () => {
  statusDiv.innerText = "Analyse du plan...";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  chrome.tabs.sendMessage(tab.id, { action: "CAPTURE_MAP" }, (response) => {
    if (chrome.runtime.lastError) {
      statusDiv.innerText = "Veuillez rafraîchir la page web (F5).";
      return;
    }
    statusDiv.innerText = "Session Live activée !";
  });
});

// La connexion au Dot Pad se fait dans le panneau latéral, qui reste ouvert
// (le popup se ferme dès qu'on clique ailleurs et couperait la connexion).
// L'id de la fenêtre est lu à l'avance : sidePanel.open() doit être appelé
// directement dans le clic, sans attente avant.
let currentWindowId = null;
chrome.windows.getCurrent().then(win => { currentWindowId = win.id; });

document.getElementById("btn-sidepanel").addEventListener("click", async () => {
  if (currentWindowId === null) return;

  await chrome.sidePanel.open({ windowId: currentWindowId });
  window.close();
});
