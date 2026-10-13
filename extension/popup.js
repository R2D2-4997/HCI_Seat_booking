const statusDiv = document.getElementById("status");

document.getElementById("btn-capture").addEventListener("click", async () => {
  statusDiv.innerText = "Analyse dynamique du plan...";
  
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  chrome.tabs.sendMessage(tab.id, { action: "CAPTURE_MAP" }, async (response) => {
    if (chrome.runtime.lastError) {
      statusDiv.innerText = "Veuillez rafraîchir la page web (F5).";
      return;
    }

    if (!response || !response.dynamicLayout) {
      statusDiv.innerText = "Erreur : Échec d'analyse du plan.";
      return;
    }

    try {
      const res = await fetch("http://127.0.0.1:8000/process-seatmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dynamic_layout: response.dynamicLayout
        })
      });

      const data = await res.json();
      
      chrome.tabs.sendMessage(tab.id, { action: "START_LIVE_SESSION", data: data }, () => {
        statusDiv.innerText = "Session Live activée !";
      });

    } catch (err) {
      statusDiv.innerText = "Erreur backend : " + err.message;
    }
  });
});

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