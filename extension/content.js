// Écoute les ordres venant de l'extension popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "CAPTURE_MAP") {
    // 1. Recherche d'un élément <canvas> ou <img> représentatif
    const canvas = document.querySelector("canvas");
    if (canvas) {
      sendResponse({ image: canvas.toDataURL("image/png") });
      return true;
    }

    const img = document.querySelector("img[src*='seat'], img[src*='map'], .seatmap img");
    if (img) {
      sendResponse({ image: img.src });
      return true;
    }

    // Capture de repli si aucun élément direct n'est isolé
    sendResponse({ error: "NO_CANVAS_FOUND" });
  }

  // 2. Simulation de clic de validation
  if (request.action === "SELECT_SEAT") {
    const targetElement = document.querySelector(request.selector);
    if (targetElement) {
      targetElement.click();
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: "Element introuvable" });
    }
  }
  return true;
});