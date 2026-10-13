import { DotPadManager } from "./dotpad.js";

// Manages the DotPad connection.
const dotpad = new DotPadManager();

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

document.getElementById("btn-bluetooth").addEventListener("click", async () => {
  statusDiv.innerText = "Connexion Bluetooth en cours...";

  try {
    // Connects to a DotPad-compatible Bluetooth device.
    const device = await dotpad.connectBluetooth();

    console.log("[DotPad] Bluetooth device:", device);

    statusDiv.innerText = "DotPad connecté en Bluetooth !";
  } catch (error) {
    console.error("[DotPad] Bluetooth error:", error);

    statusDiv.innerText = "Erreur Bluetooth : " + error.message;
  }
});