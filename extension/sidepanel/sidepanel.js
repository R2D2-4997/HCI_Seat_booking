// ============================================================
// Panneau latéral : garde la connexion au Dot Pad et affiche le plan
// Responsable : Personne 3
// ============================================================

import { DotPadManager } from "../dotpad/dotpad-manager.js";
import { buildFrame, buildTestFrame } from "../dotpad/tactile-map.js";

const statusDiv = document.getElementById("status");
const sectionDiv = document.getElementById("section");

// Dernier état reçu de la page (matrice + curseur).
let lastState = null;
// Nombre de rangées par section, renvoyé à la page pour les boutons Panning.
let sectionRows = 0;

async function sendToActiveTab(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  chrome.tabs.sendMessage(tab.id, message).catch(() => {
    // Pas de script TactileSeat sur cet onglet (page non rechargée, chrome://...).
  });
}

const dotpad = new DotPadManager({
  onSection: (direction) => sendToActiveTab({ action: "DOTPAD_KEY", direction, sectionRows }),
  onDisconnect: () => { statusDiv.innerText = "Dot Pad déconnecté."; }
});

function render() {
  if (!lastState || !dotpad.isConnected()) return;

  try {
    const frame = buildFrame(lastState.matrix, lastState.cursor, dotpad.cellRows, dotpad.cellColumns);
    sectionRows = frame.sectionRows;
    dotpad.display(frame.hex);

    const s = frame.section;
    sectionDiv.innerText =
      `Section ${s.id + 1}/${frame.sectionCount} — rangées ${s.startRow + 1} à ${s.startRow + s.rows}`;
  } catch (err) {
    console.error("[DotPad] Render error:", err);
    statusDiv.innerText = "Erreur d'affichage : " + err.message;
  }
}

// Reçoit la matrice et le curseur envoyés par content/dotpad-bridge.js.
chrome.runtime.onMessage.addListener((request) => {
  if (request.action === "DOTPAD_RENDER") {
    lastState = { matrix: request.matrix, cursor: request.cursor };
    render();
  }
});

async function onConnected(label) {
  statusDiv.innerText = `Dot Pad connecté (${label}) — ${dotpad.cellColumns} x ${dotpad.cellRows} cellules.`;
  // Demande à la page de renvoyer la session en cours, s'il y en a une.
  await sendToActiveTab({ action: "DOTPAD_REQUEST_FRAME" });
  render();
}

async function run(label, action) {
  try {
    await action();
  } catch (err) {
    console.error(`[DotPad] ${label} error:`, err);
    statusDiv.innerText = `Erreur ${label} : ${err.message}`;
  }
}

document.getElementById("btn-usb").addEventListener("click", () => run("USB", async () => {
  statusDiv.innerText = "Connexion USB en cours...";
  await dotpad.connect();
  await onConnected("USB");
}));

document.getElementById("btn-bluetooth").addEventListener("click", () => run("Bluetooth", async () => {
  statusDiv.innerText = "Connexion Bluetooth en cours...";
  await dotpad.connectBluetooth();
  await onConnected("Bluetooth");
}));

document.getElementById("btn-disconnect").addEventListener("click", () => run("déconnexion", async () => {
  await dotpad.disconnect();
  statusDiv.innerText = "Non connecté.";
  sectionDiv.innerText = "";
}));

document.getElementById("btn-test").addEventListener("click", () => run("test", async () => {
  dotpad.display(buildTestFrame(dotpad.cellRows, dotpad.cellColumns));
  statusDiv.innerText = "Image de test envoyée : un cadre et une diagonale depuis le coin haut gauche.";
}));

document.getElementById("btn-up").addEventListener("click", () => run("test", async () => {
  dotpad.displayAllUp();
}));

document.getElementById("btn-down").addEventListener("click", () => run("test", async () => {
  dotpad.displayAllDown();
}));
