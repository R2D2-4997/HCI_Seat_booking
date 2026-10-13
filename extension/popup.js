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