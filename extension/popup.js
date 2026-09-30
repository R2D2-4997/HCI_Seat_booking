const statusDiv = document.getElementById("status");

// 1. Déclenchement de la capture
document.getElementById("btn-capture").addEventListener("click", async () => {
  statusDiv.innerText = "Capture en cours...";
  
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  chrome.tabs.sendMessage(tab.id, { action: "CAPTURE_MAP" }, async (response) => {
    if (!response || !response.image) {
      statusDiv.innerText = "Erreur : Aucun élément de plan détecté.";
      return;
    }

    statusDiv.innerText = "Envoi au backend local...";
    try {
      const res = await fetch("http://127.0.0.1:8000/api/process-seatmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64: response.image })
      });
      const data = await res.json();
      statusDiv.innerText = `Matrice reçue (${data.rows}x${data.cols}). Prête pour Dot Pad.`;
      console.log("Données normalisées :", data);
    } catch (err) {
      statusDiv.innerText = "Erreur serveur local : " + err.message;
    }
  });
});

// 2. Gestionnaire WebHID direct
document.getElementById("btn-webhid").addEventListener("click", async () => {
  if (!("hid" in navigator)) {
    statusDiv.innerText = "WebHID non supporté sur ce navigateur.";
    return;
  }

  try {
    // Ouvre la boîte de dialogue native pour sélectionner la Dot Pad USB
    const devices = await navigator.hid.requestDevice({
      filters: [] // Dot Inc. Vendor ID filtrable ici ultérieurement
    });

    if (devices.length > 0) {
      const device = devices[0];
      await device.open();
      statusDiv.innerText = `Connecté à : ${device.productName}`;
      console.log("Dot Pad connectée :", device);
    } else {
      statusDiv.innerText = "Aucun appareil sélectionné.";
    }
  } catch (err) {
    statusDiv.innerText = "Erreur WebHID : " + err.message;
  }
});