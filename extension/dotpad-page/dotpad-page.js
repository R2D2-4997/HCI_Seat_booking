// ============================================================
// Page Dot Pad (onglet de l'extension) : garde la connexion au Dot Pad
// et affiche le plan. C'est un onglet et non un panneau latéral, car
// Chrome n'ouvre pas la fenêtre de choix Bluetooth / USB depuis un panneau.
// Responsable : Personne 3
// ============================================================

import { DotPadManager, traceBluetooth } from "../dotpad/dotpad-manager.js";
import { buildFrame, buildTestFrame } from "../dotpad/tactile-map.js";

const statusDiv = document.getElementById("status");
const sectionDiv = document.getElementById("section");
const logPre = document.getElementById("log");

// Journal de débogage : affiche chaque opération Bluetooth du SDK.
const startTime = performance.now();
traceBluetooth((line) => {
  const seconds = ((performance.now() - startTime) / 1000).toFixed(2).padStart(7);
  logPre.textContent += `${seconds}s  ${line}\n`;
  logPre.scrollTop = logPre.scrollHeight;
});

// Dernier état reçu de la page (matrice + curseur).
let lastState = null;
// Nombre de rangées par section, renvoyé à la page pour les boutons Panning.
let sectionRows = 0;
// Onglet du site de réservation qui a envoyé le dernier plan.
let seatmapTabId = null;

async function sendToSeatmapTab(message) {
  // Pas encore de plan reçu : on prévient tous les onglets, seul celui
  // qui a une session TactileSeat active répondra.
  const tabIds = seatmapTabId !== null
    ? [seatmapTabId]
    : (await chrome.tabs.query({})).map(tab => tab.id);

  for (const tabId of tabIds) {
    chrome.tabs.sendMessage(tabId, message).catch(() => {
      // Pas de script TactileSeat sur cet onglet (page non rechargée, chrome://...).
    });
  }
}

const dotpad = new DotPadManager({
  onSection: (direction) => sendToSeatmapTab({ action: "DOTPAD_KEY", direction, sectionRows }),
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
chrome.runtime.onMessage.addListener((request, sender) => {
  if (request.action === "DOTPAD_RENDER") {
    if (sender.tab) seatmapTabId = sender.tab.id;
    lastState = { matrix: request.matrix, cursor: request.cursor };
    render();
  }
});

async function onConnected(label) {
  statusDiv.innerText = `Dot Pad connecté (${label}) — ${dotpad.cellColumns} x ${dotpad.cellRows} cellules.`;
  // Demande à la page de renvoyer la session en cours, s'il y en a une.
  await sendToSeatmapTab({ action: "DOTPAD_REQUEST_FRAME" });
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

// Une seule connexion à la fois : deux connexions simultanées se gênent
// (« GATT operation already in progress ») et se font échouer mutuellement.
const connectButtons = ["btn-usb", "btn-bluetooth", "btn-bluetooth-all"]
  .map(id => document.getElementById(id));

async function runConnection(label, action) {
  connectButtons.forEach(btn => { btn.disabled = true; });
  try {
    await run(label, action);
  } finally {
    connectButtons.forEach(btn => { btn.disabled = false; });
  }
}

const WAIT_MESSAGE = "Connexion Bluetooth en cours... Cela peut prendre jusqu'à une minute, ne recliquez pas.";

document.getElementById("btn-usb").addEventListener("click", () => runConnection("USB", async () => {
  statusDiv.innerText = "Connexion USB en cours...";
  await dotpad.connect();
  await onConnected("USB");
}));

document.getElementById("btn-bluetooth").addEventListener("click", () => runConnection("Bluetooth", async () => {
  statusDiv.innerText = WAIT_MESSAGE;
  await dotpad.connectBluetooth();
  await onConnected("Bluetooth");
}));

// Secours : liste tous les appareils Bluetooth pour choisir le Dot Pad à la main.
document.getElementById("btn-bluetooth-all").addEventListener("click", () => runConnection("Bluetooth", async () => {
  statusDiv.innerText = "Choisissez DotPad_320 dans la liste... " + WAIT_MESSAGE;
  await dotpad.connectBluetooth({ showAllDevices: true });
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
