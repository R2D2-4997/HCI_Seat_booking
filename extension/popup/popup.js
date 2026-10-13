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

// La connexion au Dot Pad se fait dans un onglet de l'extension, qui reste ouvert
// (le popup se ferme dès qu'on clique ailleurs et couperait la connexion,
// et Chrome n'ouvre pas la fenêtre Bluetooth / USB depuis un panneau latéral).
const DOTPAD_PAGE_URL = chrome.runtime.getURL("dotpad-page/dotpad-page.html");

document.getElementById("btn-dotpad-page").addEventListener("click", async () => {
  // Réutilise l'onglet s'il est déjà ouvert.
  const [existing] = await chrome.runtime.getContexts({
    contextTypes: ["TAB"],
    documentUrls: [DOTPAD_PAGE_URL]
  });

  if (existing) {
    await chrome.tabs.update(existing.tabId, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: DOTPAD_PAGE_URL, pinned: true });
  }
  window.close();
});
