// ============================================================
// Connexion au Dot Pad (USB ou Bluetooth) via le SDK officiel
// Responsable : Personne 3
// ============================================================

import {
  DotPadScanner,
  DotPadSDK,
  DataCodes,
  KeyCodes
} from "../sdk/DotPadSDK-3.0.3.js";

// Rejects with `message` if `promise` takes longer than `ms`.
function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// ------------------------------------------------------------
// Compatibility with the "DotPad 320" iPad simulator (Bluetooth).
// Applied once at load time, without modifying the SDK file.
//
// 1. The SDK writes with writeValue(), which waits for an acknowledgement
//    that the simulator never sends: write without acknowledgement instead.
// 2. During the handshake the SDK asks for the "board info" (display size).
//    The simulator answers with an unrelated packet, so the SDK waits forever.
//    If no real answer arrives in time, a Dot Pad 320 answer is supplied.
//    A real Dot Pad answers by itself, so this fallback never triggers for it.
// ------------------------------------------------------------

const BOARD_INFO_FALLBACK_MS = 1500;

// "Board info" answer of a Dot Pad 320, in the format parsed by the SDK:
// aa 55 | length 00 11 | 00 | command 01 11 | 00 | 12 data bytes | checksum
const DOTPAD_320_BOARD_INFO = new Uint8Array([
  0xaa, 0x55, 0x00, 0x11, 0x00, 0x01, 0x11, 0x00,
  0xc0,             // graphic area + braille text line
  0x00, 0x00, 0x00,
  0x01,             // 1 braille text line
  0x14,             // 20 braille cells on that line
  0x00,
  0x01,             // text line refresh timing
  0x0a,             // 10 graphic lines
  0x1e,             // 30 graphic cells per line
  0x00,
  0x0a,             // graphic line refresh timing
  0x00              // checksum (not checked by the SDK)
]);

// Packet command = bytes 5 and 6 (after "aa 55", length and one 00 byte).
function packetCommand(bytes) {
  if (bytes.length < 7 || bytes[0] !== 0xaa || bytes[1] !== 0x55) return null;
  return (bytes[5] << 8) | bytes[6];
}
const CMD_REQUEST_BOARD_INFO = 0x0110;
const CMD_RESPONSE_BOARD_INFO = 0x0111;

let debugLog = () => {};
let boardInfoReceived = false;
const notificationListeners = new WeakMap();

function toBytes(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function supplyBoardInfo(characteristic) {
  const listeners = notificationListeners.get(characteristic) || [];
  if (boardInfoReceived || listeners.length === 0) return;

  debugLog("⚠ pas de réponse « board info » : réponse de Dot Pad 320 fournie (simulateur)");
  const fakeEvent = { target: { value: new DataView(DOTPAD_320_BOARD_INFO.slice().buffer) } };
  for (const listener of listeners) listener.call(characteristic, fakeEvent);
}

function installBluetoothCompat() {
  const proto = globalThis.BluetoothRemoteGATTCharacteristic?.prototype;
  if (!proto || proto.tactileSeatCompat) return;

  // Remembers the SDK's notification listeners, and notices real board info answers.
  const originalAdd = proto.addEventListener;
  proto.addEventListener = function (type, listener, ...rest) {
    if (type === "characteristicvaluechanged" && typeof listener === "function") {
      const list = notificationListeners.get(this) || [];
      list.push(listener);
      notificationListeners.set(this, list);

      const watched = function (event) {
        if (packetCommand(toBytes(event.target.value)) === CMD_RESPONSE_BOARD_INFO) {
          boardInfoReceived = true;
        }
        return listener.call(this, event);
      };
      return originalAdd.call(this, type, watched, ...rest);
    }
    return originalAdd.call(this, type, listener, ...rest);
  };

  const originalWriteValue = proto.writeValue;
  proto.writeValue = function (value) {
    // The simulator may use a single characteristic for reading and writing.
    if (packetCommand(toBytes(value)) === CMD_REQUEST_BOARD_INFO) {
      boardInfoReceived = false;
      setTimeout(() => {
        for (const characteristic of [this, ...knownNotifyCharacteristics]) {
          if (notificationListeners.has(characteristic)) {
            supplyBoardInfo(characteristic);
            break;
          }
        }
      }, BOARD_INFO_FALLBACK_MS);
    }

    if (this.properties.writeWithoutResponse && this.writeValueWithoutResponse) {
      return this.writeValueWithoutResponse(value);
    }
    return originalWriteValue.call(this, value);
  };

  // Keeps track of characteristics on which notifications were started.
  const originalStart = proto.startNotifications;
  proto.startNotifications = function (...args) {
    knownNotifyCharacteristics.add(this);
    return originalStart.apply(this, args);
  };

  proto.tactileSeatCompat = true;
}

const knownNotifyCharacteristics = new Set();
installBluetoothCompat();

// Debug: logs every Bluetooth operation made by the SDK (start, success,
// failure) so that a stuck step can be identified. Applied once.
export function traceBluetooth(log) {
  debugLog = log;

  const targets = [
    [globalThis.BluetoothRemoteGATTServer, ["connect", "getPrimaryService"]],
    [globalThis.BluetoothRemoteGATTService, ["getCharacteristic", "getCharacteristics"]],
    [globalThis.BluetoothRemoteGATTCharacteristic, ["startNotifications", "writeValueWithResponse", "writeValueWithoutResponse"]]
  ];

  for (const [cls, methods] of targets) {
    const proto = cls?.prototype;
    if (!proto || proto.tactileSeatTraced) continue;

    for (const name of methods) {
      const original = proto[name];
      if (typeof original !== "function") continue;

      proto[name] = function (...args) {
        const size = args[0]?.byteLength !== undefined ? ` (${args[0].byteLength} octets)` : "";
        const label = `${name}${size}`;
        log(`→ ${label}`);
        const result = original.apply(this, args);
        Promise.resolve(result).then(
          () => log(`  ✓ ${label}`),
          err => log(`  ✗ ${label} : ${err.name} — ${err.message}`)
        );
        return result;
      };
    }
    proto.tactileSeatTraced = true;
  }

  // Also logs the data received from the device (notifications).
  const charProto = globalThis.BluetoothRemoteGATTCharacteristic?.prototype;
  if (charProto && !charProto.tactileSeatTracedEvents) {
    const originalAdd = charProto.addEventListener;
    charProto.addEventListener = function (type, listener, ...rest) {
      if (type === "characteristicvaluechanged" && typeof listener === "function") {
        const traced = function (event) {
          const bytes = new Uint8Array(event.target.value.buffer);
          const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join(" ");
          log(`← reçu (${bytes.length} octets) : ${hex}`);
          return listener.call(this, event);
        };
        return originalAdd.call(this, type, traced, ...rest);
      }
      return originalAdd.call(this, type, listener, ...rest);
    };
    charProto.tactileSeatTracedEvents = true;
  }
}

// Manages DotPad connection, display, and button events.
export class DotPadManager {
  // onSection(direction): called with -1 / +1 when a panning key is pressed.
  // onDisconnect(): called when the device is lost.
  constructor({ onSection = () => {}, onDisconnect = () => {} } = {}) {
    this.scanner = new DotPadScanner();
    this.sdk = new DotPadSDK();
    this.device = null;
    this.lastHex = null;

    // Registers device status and physical button callbacks.
    this.sdk.setCallBack(
      (device, code, data) => {
        console.log("[DotPad] Status:", code, data);

        if (code === DataCodes.Disconnected) {
          this.device = null;
          this.lastHex = null;
          onDisconnect();
        }
      },
      (device, key, data) => {
        console.log("[DotPad] Button:", key, data);

        if (key === KeyCodes.PanningLeft) {
          onSection(-1);
        }

        if (key === KeyCodes.PanningRight) {
          onSection(1);
        }
      }
    );
  }

  // Graphic area size of the connected device, in cells.
  get cellRows() {
    return this.device?.numberCellRows || 10;
  }

  get cellColumns() {
    return this.device?.numberCellColumns || 30;
  }

  // Connects to a DotPad through Web Serial.
  async connect() {
    if (this.isConnected()) return this.device;

    if (!("serial" in navigator)) {
      throw new Error("Web Serial is not supported in this browser.");
    }

    const port = await this.scanner.startUsbScan();
    if (!port) {
      throw new Error("No DotPad selected.");
    }

    const device = await this.sdk.connectUsbDevice(port);

    if (!device?.isConnect) {
      throw new Error("DotPad connection failed.");
    }

    this.device = device;
    console.log("[DotPad] Connected");
    console.log(
      "[DotPad] Graphic cells:",
      device.numberCellRows,
      "rows x",
      device.numberCellColumns,
      "columns"
    );
    
    return device;
  
  }

  // Connects to a DotPad-compatible Bluetooth device.
  // showAllDevices: lists every Bluetooth device, to pick the DotPad by hand
  // when the filtered list stays empty.
  async connectBluetooth({ showAllDevices = false } = {}) {
    if (this.isConnected()) return this.device;

    if (!("bluetooth" in navigator)) {
      throw new Error("Web Bluetooth is not supported in this browser.");
    }

    // Two simultaneous connections interfere and make each other fail.
    if (this.connecting) {
      throw new Error("une connexion est déjà en cours, patientez.");
    }
    this.connecting = true;
    try {
      return await this.connectBluetoothOnce(showAllDevices);
    } finally {
      this.connecting = false;
    }
  }

  async connectBluetoothOnce(showAllDevices) {

    // Opens the browser's Bluetooth device selector. Called directly instead of
    // scanner.startBleScan() because the SDK hides the real error.
    // The device is matched by name OR by the DotPad service: on Windows, a
    // simulator on iPad is often listed under the iPad's own name.
    const options = showAllDevices
      ? { acceptAllDevices: true }
      : {
          filters: [
            { namePrefix: this.scanner.DOTPAD_PREFIX },
            { services: [this.scanner.DOTPAD_SERVICE] }
          ]
        };

    let bluetoothDevice;
    try {
      bluetoothDevice = await navigator.bluetooth.requestDevice({
        ...options,
        optionalServices: [this.scanner.DOTPAD_SERVICE]
      });
      console.log("[DotPad] Selected:", bluetoothDevice.name, bluetoothDevice.id);
    } catch (err) {
      if (err.name === "NotFoundError") {
        throw new Error("aucun appareil choisi (fenêtre fermée ou aucun DotPad trouvé).");
      }
      throw new Error(`${err.name} — ${err.message}`);
    }

    // Connects and finds the DotPad service first, with retries: on Windows the
    // link often drops during the (slow) service discovery. Once found, the
    // services are cached and the SDK's own connection is fast.
    await this.prepareBluetoothLink(bluetoothDevice);

    // Establishes the connection through the DotPad SDK. The SDK only logs
    // its errors to the console, so they are captured to be shown to the user.
    const sdkErrors = [];
    const originalConsoleError = console.error;
    console.error = (...args) => {
      sdkErrors.push(args.map(a => a?.message ?? String(a)).join(" "));
      originalConsoleError(...args);
    };

    let device;
    try {
      device = await withTimeout(
        // Service discovery alone can take 8 to 25 s on Windows: leave enough time
        // for the SDK to finish or to report its own 5 s handshake timeout.
        this.sdk.connectBleDevice(bluetoothDevice),
        60000,
        "le SDK n'a pas répondu en 60 s"
      );
    } catch (err) {
      sdkErrors.push(err.message);
    } finally {
      console.error = originalConsoleError;
    }

    if (!device?.isConnect) {
      const diagnosis = await this.diagnoseBluetooth(bluetoothDevice);
      const reason = sdkErrors.length ? sdkErrors.join(" | ") : "aucune erreur du SDK";
      // Releases the half-open link so that the next attempt starts clean.
      if (bluetoothDevice.gatt.connected) bluetoothDevice.gatt.disconnect();
      throw new Error(`connexion refusée par le SDK. Raison : ${reason}. Diagnostic : ${diagnosis}`);
    }

    this.device = device;

    console.log("[DotPad] Bluetooth connected");
    console.log(
      "[DotPad] Graphic cells:",
      device.numberCellRows,
      "rows x",
      device.numberCellColumns,
      "columns"
    );

    return device;
  }

  // Connects to the device and finds the DotPad service, retrying if the link drops.
  async prepareBluetoothLink(bluetoothDevice, attempts = 3) {
    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        debugLog(`· préparation de la liaison, essai ${attempt}/${attempts}`);
        const server = bluetoothDevice.gatt.connected
          ? bluetoothDevice.gatt
          : await withTimeout(bluetoothDevice.gatt.connect(), 30000, "connexion bloquée (30 s)");

        await withTimeout(
          server.getPrimaryService(this.scanner.DOTPAD_SERVICE),
          45000,
          "recherche du service bloquée (45 s)"
        );
        debugLog("· liaison prête");
        return;
      } catch (err) {
        lastError = err;
        debugLog(`· essai ${attempt} échoué : ${err.message}`);
        if (bluetoothDevice.gatt.connected) bluetoothDevice.gatt.disconnect();
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    throw new Error(
      `la liaison Bluetooth avec l'iPad coupe à chaque essai (${lastError.message}). ` +
      "Déconnectez les écouteurs Bluetooth du PC, gardez l'iPad déverrouillé près du PC, " +
      "puis éteignez et rallumez le Bluetooth des deux côtés."
    );
  }

  // Checks step by step what the Bluetooth device exposes, to explain a failure.
  async diagnoseBluetooth(bluetoothDevice) {
    const steps = [`appareil « ${bluetoothDevice.name} »`];

    try {
      const server = bluetoothDevice.gatt.connected
        ? bluetoothDevice.gatt
        : await withTimeout(bluetoothDevice.gatt.connect(), 10000, "connexion GATT bloquée (10 s)");
      steps.push("GATT connecté");

      const service = await withTimeout(
        server.getPrimaryService(this.scanner.DOTPAD_SERVICE),
        10000,
        "recherche du service bloquée (10 s)"
      );
      steps.push("service DotPad trouvé");

      const characteristics = await withTimeout(
        service.getCharacteristics(),
        10000,
        "lecture des caractéristiques bloquée (10 s)"
      );
      const flags = ["read", "write", "writeWithoutResponse", "notify", "indicate"];
      steps.push(`caractéristiques : ${characteristics
        .map(c => `${c.uuid.slice(0, 8)} [${flags.filter(f => c.properties[f]).join(",")}]`)
        .join(", ")}`);
    } catch (err) {
      steps.push(`échec : ${err.name} — ${err.message}`);
    }

    return steps.join(" → ");
  }

  // Displays a hexadecimal tactile pattern.
  display(hexData) {
    if (!this.isConnected()) {
      throw new Error("DotPad is not connected.");
    }

    // The pins are slow to move: skip the refresh if nothing changed.
    if (hexData === this.lastHex) return;

    this.lastHex = hexData;
    this.sdk.displayGraphicData(hexData, this.device);
  }

  // Raises all pins for a hardware test.
  displayAllUp() {
    if (!this.isConnected()) {
      throw new Error("DotPad is not connected.");
    }

    this.lastHex = null;
    this.sdk.displayAllUp(this.device);
  }

  // Lowers all pins for a hardware test.
  displayAllDown() {
    if (!this.isConnected()) {
      throw new Error("DotPad is not connected.");
    }

    this.lastHex = null;
    this.sdk.displayAllDown(this.device);
  }

  // Disconnects the device.
  async disconnect() {
    if (!this.device) return;

    const device = this.device;
    this.device = null;
    this.lastHex = null;
    await this.sdk.disconnect(device);
  }

  isConnected() {
    return Boolean(this.device?.isConnect);
  }
}
