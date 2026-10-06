const statusDiv = document.getElementById("status");

document.getElementById("btn-capture").addEventListener("click", async () => {
  statusDiv.innerText = "Analyse du plan en cours...";
  
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  // 1. Capture du canevas
  chrome.tabs.sendMessage(tab.id, { action: "CAPTURE_MAP" }, async (response) => {
    if (!response || !response.image) {
      statusDiv.innerText = "Erreur : Aucun plan trouvé.";
      return;
    }

    try {
      // 2. Traitement par le serveur IA Python
      const res = await fetch("http://127.0.0.1:8000/api/process-seatmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64: response.image })
      });
      const data = await res.json();
      
      // 3. Démarrage de la session live sur la page web
      chrome.tabs.sendMessage(tab.id, { action: "START_LIVE_SESSION", data: data }, (liveRes) => {
        statusDiv.innerText = "Session Live activée sur la page !";
      });

    } catch (err) {
      statusDiv.innerText = "Erreur backend : " + err.message;
    }
  });
});

// Connexion WebHID avec la Dot Pad
document.getElementById("btn-webhid").addEventListener("click", async () => {
  if (!("hid" in navigator)) {
    statusDiv.innerText = "WebHID non supporté.";
    return;
  }

  try {
    const devices = await navigator.hid.requestDevice({ filters: [] });
    if (devices.length > 0) {
      const device = devices[0];
      await device.open();
      statusDiv.innerText = `Dot Pad connectée : ${device.productName}`;
    }
  } catch (err) {
    statusDiv.innerText = "Erreur WebHID : " + err.message;
  }
});