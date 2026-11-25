// ============================================================
// Dot Pad Page (extension tab):
// 1. Live visual Dot Pad 320 emulator (60x40 pins + 20-cell braille bar + LP/RP/F1-F4)
//    working directly with any booking tab without physical hardware.
// 2. Optional USB / Bluetooth connection to a physical Dot Pad.
// ============================================================

import { DotPadManager, traceBluetooth } from "../dotpad/dotpad-manager.js";
import {
  buildFrame,
  buildTestFrame,
  buildPatternSampleFrame,
  hexToPins,
  DEFAULT_CELL_ROWS,
  DEFAULT_CELL_COLUMNS
} from "../dotpad/tactile-map.js";

const statusDiv = document.getElementById("status");
const sectionDiv = document.getElementById("section");
const logPre = document.getElementById("log");
const canvas = document.getElementById("dotpad-canvas");
const ctx = canvas.getContext("2d");
const pinInfo = document.getElementById("pin-info");
const brailleCellsEl = document.getElementById("braille-cells");
const brailleTextEl = document.getElementById("braille-text");

const BRAILLE_MAP = {
  a:"⠁",b:"⠃",c:"⠉",d:"⠙",e:"⠑",f:"⠋",g:"⠛",h:"⠓",i:"⠊",j:"⠚",
  k:"⠇",l:"⠇",m:"⠍",n:"⠝",o:"⠕",p:"⠏",q:"⠟",r:"⠗",s:"⠎",t:"⠞",
  u:"⠥",v:"⠧",w:"⠺",x:"⠭",y:"⠽",z:"⠵",
  "0":"⠚","1":"⠁","2":"⠃","3":"⠉","4":"⠙","5":"⠑","6":"⠋","7":"⠛","8":"⠓","9":"⠊",
  " ":"⠀","-":"⠤",":":"⠒",".":"⠲","/":"⠌",",":"⠂","+":"⠖","€":"⠑","$":"⠎"
};

function updateBrailleBar(text) {
  const clean = (text || "").toLowerCase();
  let cells = "";
  for (let i = 0; i < 20; i++) {
    cells += BRAILLE_MAP[clean[i] || " "] || "⠀";
  }
  brailleCellsEl.textContent = cells;
  brailleTextEl.textContent = (text || "").slice(0, 20).toUpperCase();
}

const startTime = performance.now();
traceBluetooth((line) => {
  const seconds = ((performance.now() - startTime) / 1000).toFixed(2).padStart(7);
  logPre.textContent += `${seconds}s  ${line}\n`;
  logPre.scrollTop = logPre.scrollHeight;
});

let lastState = null;
let sectionRows = 10;
let seatmapTabId = null;
let showGrid = false;
let lastPins = Array.from({ length: 40 }, () => Array(60).fill(0));

async function sendToSeatmapTab(message) {
  const tabIds = seatmapTabId !== null
    ? [seatmapTabId]
    : (await chrome.tabs.query({})).map(tab => tab.id);

  for (const tabId of tabIds) {
    chrome.tabs.sendMessage(tabId, message).catch(() => {});
  }
}

const audioCtx = new AudioContext();
function holdBeep() {
  if (audioCtx.state === "suspended") audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.frequency.value = 880;
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.15);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.15);
}

const dotpad = new DotPadManager({
  onSection: (direction) => sendToSeatmapTab({ action: "DOTPAD_KEY", direction, sectionRows }),
  onMove: (key) => sendToSeatmapTab({ action: "DOTPAD_MOVE", key }),
  onHoldReady: () => holdBeep(),
  onHold: (action) => sendToSeatmapTab({
    action: { select: "DOTPAD_SELECT", pay: "DOTPAD_PAY", cancel: "DOTPAD_CANCEL" }[action]
  }),
  onDisconnect: () => {
    statusDiv.innerText = "Physical Dot Pad disconnected (emulator active).";
  }
});

function drawPinsOnCanvas(pins, cellRows = DEFAULT_CELL_ROWS, cellColumns = DEFAULT_CELL_COLUMNS) {
  lastPins = pins;
  const rows = cellRows * 4;
  const cols = cellColumns * 2;
  const w = canvas.width;
  const h = canvas.height;
  const cellW = w / cols;
  const cellH = h / rows;

  ctx.fillStyle = "#111113";
  ctx.fillRect(0, 0, w, h);

  if (showGrid) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
    ctx.lineWidth = 1;
    for (let c = 0; c <= cellColumns; c++) {
      const x = Math.round(c * 2 * cellW) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let r = 0; r <= cellRows; r++) {
      const y = Math.round(r * 4 * cellH) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
  }

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cx = (x + 0.5) * cellW;
      const cy = (y + 0.5) * cellH;
      if (pins[y]?.[x] === 1) {
        const rad = Math.min(cellW, cellH) * 0.35;
        ctx.beginPath();
        ctx.arc(cx, cy + 1, rad + 0.6, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
        ctx.fill();

        const grad = ctx.createRadialGradient(cx - rad * 0.3, cy - rad * 0.3, rad * 0.1, cx, cy, rad);
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(0.65, "#e4e4e7");
        grad.addColorStop(1, "#a1a1aa");
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      } else {
        const rad = Math.min(cellW, cellH) * 0.22;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.fillStyle = "#27272a";
        ctx.fill();
      }
    }
  }
}

function renderHexToBoth(hex, cellRows = dotpad.cellRows, cellColumns = dotpad.cellColumns) {
  drawPinsOnCanvas(hexToPins(hex, cellRows, cellColumns), cellRows, cellColumns);
  if (dotpad.isConnected()) {
    dotpad.display(hex);
  }
}

function formatPriceTag(rawPrice) {
  if (!rawPrice) return "";
  const p = String(rawPrice).trim();
  const lower = p.toLowerCase();
  if (["disponible", "indisponible", "available", "occupied", "free", "n/a", "-"].includes(lower)) {
    return "";
  }
  return p.replace(/\s+/g, "").slice(0, 8);
}

function describeCursorForBraille(matrix, cursor, section, seatInfo) {
  if (!cursor || !matrix) return `SEC ${section.id + 1}`;
  const val = matrix[cursor.r]?.[cursor.c];
  if (val === 0) return `AISLE R${cursor.r + 1}`;
  if (val === 4) return `EXIT R${cursor.r + 1}`;
  if (val === 5) return `STRUCTURE`;

  const id = seatInfo?.id || `R${cursor.r + 1}C${cursor.c + 1}`;
  const stateLabel = val === 1 ? "FREE" : val === 2 ? "OCC" : val === 3 ? "SEL" : "INFO";
  const priceTag = val === 2 ? "" : formatPriceTag(seatInfo?.price);
  const full = priceTag ? `${id} ${stateLabel} ${priceTag}` : `${id} ${stateLabel}`;
  return full.slice(0, 20);
}

function render() {
  if (!lastState) return;

  try {
    const cellRows = dotpad.cellRows;
    const cellColumns = dotpad.cellColumns;
    const frame = buildFrame(lastState.matrix, lastState.cursor, cellRows, cellColumns);
    sectionRows = frame.sectionRows;
    renderHexToBoth(frame.hex, cellRows, cellColumns);

    const s = frame.section;
    sectionDiv.innerText =
      `Section ${s.id + 1}/${frame.sectionCount} — rows ${s.startRow + 1} to ${s.startRow + s.rows}`;
    statusDiv.innerText = dotpad.isConnected()
      ? "Synced live (Emulator + Hardware Dot Pad)."
      : "Synced live with booking page.";

    updateBrailleBar(describeCursorForBraille(lastState.matrix, lastState.cursor, s, lastState.seatInfo));
  } catch (err) {
    console.error("[DotPad] Render error:", err);
    statusDiv.innerText = "Render error: " + err.message;
  }
}

chrome.runtime.onMessage.addListener((request, sender) => {
  if (request.action === "DOTPAD_RENDER") {
    if (sender.tab) seatmapTabId = sender.tab.id;
    lastState = { matrix: request.matrix, cursor: request.cursor, seatInfo: request.seatInfo || null };
    render();
  }
});

function bindHoldButton(btnId, barId, holdMs, onShort, onHold) {
  const btn = document.getElementById(btnId);
  const bar = document.getElementById(barId);
  let start = 0;
  let raf = null;
  let ready = false;
  let active = false;

  const tick = () => {
    if (!active) return;
    const elapsed = performance.now() - start;
    const pct = Math.min(100, (elapsed / holdMs) * 100);
    bar.style.width = `${pct}%`;
    if (elapsed >= holdMs && !ready) {
      ready = true;
      holdBeep();
    }
    if (pct < 100) raf = requestAnimationFrame(tick);
  };

  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    active = true;
    ready = false;
    start = performance.now();
    btn.classList.add("is-pressed");
    raf = requestAnimationFrame(tick);
  });

  const end = () => {
    if (!active) return;
    active = false;
    cancelAnimationFrame(raf);
    bar.style.width = "0%";
    btn.classList.remove("is-pressed");
    if (ready) onHold();
    else onShort();
  };

  btn.addEventListener("pointerup", end);
  btn.addEventListener("pointerleave", () => {
    if (active) {
      active = false;
      cancelAnimationFrame(raf);
      bar.style.width = "0%";
      btn.classList.remove("is-pressed");
    }
  });
}

bindHoldButton(
  "hw-lp", "hold-lp", 1000,
  () => sendToSeatmapTab({ action: "DOTPAD_KEY", direction: -1, sectionRows }),
  () => sendToSeatmapTab({ action: "DOTPAD_SELECT" })
);
bindHoldButton(
  "hw-rp", "hold-rp", 2000,
  () => sendToSeatmapTab({ action: "DOTPAD_KEY", direction: 1, sectionRows }),
  () => sendToSeatmapTab({ action: "DOTPAD_PAY" })
);
bindHoldButton(
  "hw-f1", "hold-f1", 2000,
  () => sendToSeatmapTab({ action: "DOTPAD_MOVE", key: 1 }),
  () => sendToSeatmapTab({ action: "DOTPAD_CANCEL" })
);

document.getElementById("hw-f2").addEventListener("click", () => sendToSeatmapTab({ action: "DOTPAD_MOVE", key: 2 }));
document.getElementById("hw-f3").addEventListener("click", () => sendToSeatmapTab({ action: "DOTPAD_MOVE", key: 3 }));
document.getElementById("hw-f4").addEventListener("click", () => sendToSeatmapTab({ action: "DOTPAD_MOVE", key: 4 }));

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const cols = dotpad.cellColumns * 2;
  const rows = dotpad.cellRows * 4;
  const x = Math.floor(((e.clientX - rect.left) / rect.width) * cols);
  const y = Math.floor(((e.clientY - rect.top) / rect.height) * rows);
  if (x >= 0 && x < cols && y >= 0 && y < rows) {
    const up = lastPins[y]?.[x] ? "UP" : "DOWN";
    pinInfo.textContent = `Pin (${x},${y}) • Cell (${Math.floor(x/2)+1},${Math.floor(y/4)+1}) • ${up}`;
  }
});

document.getElementById("toggle-grid").addEventListener("change", (e) => {
  showGrid = e.target.checked;
  drawPinsOnCanvas(lastPins, dotpad.cellRows, dotpad.cellColumns);
});

document.getElementById("btn-sync").addEventListener("click", () => {
  sendToSeatmapTab({ action: "DOTPAD_REQUEST_FRAME" });
});

document.getElementById("btn-test").addEventListener("click", () => {
  const hex = buildTestFrame(dotpad.cellRows, dotpad.cellColumns);
  renderHexToBoth(hex);
  statusDiv.innerText = "Test frame displayed (border + diagonal).";
  updateBrailleBar("TEST FRAME");
});

document.getElementById("btn-sample").addEventListener("click", () => {
  const hex = buildPatternSampleFrame(dotpad.cellRows, dotpad.cellColumns);
  renderHexToBoth(hex);
  statusDiv.innerText = "3-3 sample displayed (D2 selected, cursor on D3).";
  updateBrailleBar("SAMPLE 3-3 D3");
});

document.getElementById("btn-up").addEventListener("click", () => {
  const pins = Array.from({ length: dotpad.cellRows * 4 }, () => Array(dotpad.cellColumns * 2).fill(1));
  drawPinsOnCanvas(pins, dotpad.cellRows, dotpad.cellColumns);
  if (dotpad.isConnected()) dotpad.displayAllUp();
  statusDiv.innerText = "All pins raised.";
  updateBrailleBar("ALL PINS UP");
});

document.getElementById("btn-down").addEventListener("click", () => {
  const pins = Array.from({ length: dotpad.cellRows * 4 }, () => Array(dotpad.cellColumns * 2).fill(0));
  drawPinsOnCanvas(pins, dotpad.cellRows, dotpad.cellColumns);
  if (dotpad.isConnected()) dotpad.displayAllDown();
  statusDiv.innerText = "All pins lowered.";
  updateBrailleBar("ALL PINS DOWN");
});

async function onConnected(label) {
  statusDiv.innerText = `Dot Pad connected (${label}) — ${dotpad.cellColumns}×${dotpad.cellRows} cells.`;
  await sendToSeatmapTab({ action: "DOTPAD_REQUEST_FRAME" });
  render();
}

async function run(label, action) {
  try {
    await action();
  } catch (err) {
    console.error(`[DotPad] ${label} error:`, err);
    statusDiv.innerText = `${label} error: ${err.message}`;
  }
}

const connectButtons = ["btn-usb", "btn-bluetooth", "btn-bluetooth-all"].map(id => document.getElementById(id));
async function runConnection(label, action) {
  connectButtons.forEach(btn => { btn.disabled = true; });
  try { await run(label, action); }
  finally { connectButtons.forEach(btn => { btn.disabled = false; }); }
}

document.getElementById("btn-usb").addEventListener("click", () => runConnection("USB", async () => {
  statusDiv.innerText = "Connecting via USB...";
  await dotpad.connect();
  await onConnected("USB");
}));

document.getElementById("btn-bluetooth").addEventListener("click", () => runConnection("Bluetooth", async () => {
  statusDiv.innerText = "Connecting via Bluetooth...";
  await dotpad.connectBluetooth();
  await onConnected("Bluetooth");
}));

document.getElementById("btn-bluetooth-all").addEventListener("click", () => runConnection("Bluetooth", async () => {
  statusDiv.innerText = "Select DotPad_320 from the list...";
  await dotpad.connectBluetooth({ showAllDevices: true });
  await onConnected("Bluetooth");
}));

document.getElementById("btn-disconnect").addEventListener("click", () => run("disconnect", async () => {
  await dotpad.disconnect();
  statusDiv.innerText = "Physical Dot Pad disconnected (emulator active).";
}));

drawPinsOnCanvas(lastPins);
updateBrailleBar("TACTILESEAT READY");
sendToSeatmapTab({ action: "DOTPAD_REQUEST_FRAME" });
