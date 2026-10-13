// ============================================================
// Service worker : capture d'écran de l'onglet
// Responsable : Personne 1
// ============================================================

chrome.runtime.onInstalled.addListener(() => {
  console.log("TactileSeat service worker initialisé.");
});

// Écouteur pour la capture d'écran native Chrome (Auto-Screenshot)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "TAKE_SCREENSHOT") {
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
      sendResponse({ imageBase64: dataUrl });
    });
    return true; // Mode asynchrone
  }
});