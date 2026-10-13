
import {
  DotPadScanner,
  DotPadSDK,
  DataCodes,
  KeyCodes
} from "./sdk/DotPadSDK-3.0.3.js";

// Manages DotPad connection, display, and button events.
export class DotPadManager {
  constructor() {
    this.scanner = new DotPadScanner();
    this.sdk = new DotPadSDK();
    this.device = null;

    // Registers device status and physical button callbacks.
    this.sdk.setCallBack(
      (device, code, data) => {
        console.log("[DotPad] Status:", code, data);

        if (code === DataCodes.Disconnected) {
          this.device = null;
        }
      },
      (device, key, data) => {
        console.log("[DotPad] Button:", key, data);

        if (key === KeyCodes.PanningLeft) {
          console.log("[DotPad] Previous section");
        }

        if (key === KeyCodes.PanningRight) {
          console.log("[DotPad] Next section");
        }
      }
    );
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
  async connectBluetooth() {
    if (this.isConnected()) return this.device;

    if (!("bluetooth" in navigator)) {
      throw new Error("Web Bluetooth is not supported in this browser.");
    }

    // Opens the browser's Bluetooth device selector.
    const bluetoothDevice = await this.scanner.startBleScan();

    if (!bluetoothDevice) {
      throw new Error("No Bluetooth device selected.");
    }

    // Establishes the connection through the DotPad SDK.
    const device = await this.sdk.connectBleDevice(bluetoothDevice);

    if (!device?.isConnect) {
      throw new Error("Bluetooth connection failed.");
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

  // Displays a hexadecimal tactile pattern.
  display(hexData) {
    if (!this.isConnected()) {
      throw new Error("DotPad is not connected.");
    }

    this.sdk.displayGraphicData(hexData, this.device);
  }

  // Raises all pins for a hardware test.
  displayAllUp() {
    if (!this.isConnected()) {
      throw new Error("DotPad is not connected.");
    }

    this.sdk.displayAllUp(this.device);
  }

  // Lowers all pins for a hardware test.
  displayAllDown() {
    if (!this.isConnected()) {
      throw new Error("DotPad is not connected.");
    }

    this.sdk.displayAllDown(this.device);
  }

  // Disconnects the device.
  async disconnect() {
    if (!this.device) return;

    const device = this.device;
    this.device = null;
    await this.sdk.disconnect(device);
  }

  isConnected() {
    return Boolean(this.device?.isConnect);
  }
}
