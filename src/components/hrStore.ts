"use client";

export const hrStore = {
  currentHR: 0,
  intensityMultiplier: 1.0, 
  device: null as BluetoothDevice | null,
  characteristic: null as BluetoothRemoteGATTCharacteristic | null,
  isConnecting: false,

  // Handler สำหรับรับค่า HR (แยกฟังก์ชันออกมาเพื่อให้ removeEventListener ได้ถูกต้อง)
  handleHRUpdate(event: any) {
    const value = event.target.value;
    if (!value) return;

    const flags = value.getUint8(0);
    const hr16 = flags & 1;
    const hr = hr16 ? value.getUint16(1, true) : value.getUint8(1);
    
    hrStore.currentHR = hr;
    // console.log(`[Polar HR] Current HR: ${hr}`);
  },

  // Handler เมื่ออุปกรณ์หลุดการเชื่อมต่อเอง
  handleDisconnected(event: any) {
    const dev = event.target as BluetoothDevice;
    console.warn(`[Polar BLE] Device '${dev.name}' disconnected unexpectedly.`);
    hrStore.cleanupState();
  },

  async connectPolar() {
    if (this.isConnecting) {
      console.warn("[Polar BLE] Connection already in progress...");
      return false;
    }

    this.isConnecting = true;
    console.log("[Polar BLE] Initiating connection process...");

    try {
      // 1. เคลียร์ Session เก่าทิ้งก่อนเชื่อมต่อใหม่เสมอ
      this.disconnect();

      let targetDevice = this.device;

      // 2. Try Auto-Reconnect ถ้ามี device instance เดิมค้างอยู่
      if (targetDevice && targetDevice.gatt) {
        console.log(`[Polar BLE] Attempting auto-reconnect to previous device: ${targetDevice.name}`);
        try {
          await targetDevice.gatt.connect();
        } catch (reconnectErr) {
          console.warn("[Polar BLE] Auto-reconnect failed. Falling back to manual picker.", reconnectErr);
          targetDevice = null;
        }
      }

      // 3. ถ้าไม่มี device เดิม หรือ auto-reconnect ล้มเหลว ให้เปิด Popup เลือกใหม่
      if (!targetDevice) {
        console.log("[Polar BLE] Requesting Bluetooth Device picker...");
        targetDevice = await navigator.bluetooth.requestDevice({
          filters: [{ services: ['heart_rate'] }] 
        });
      }

      if (!targetDevice || !targetDevice.gatt) {
        throw new Error("Device GATT server is not available.");
      }

      console.log(`[Polar BLE] Connecting to GATT Server (${targetDevice.name})...`);
      const server = await targetDevice.gatt.connect();

      console.log("[Polar BLE] Getting Heart Rate Service...");
      const service = await server.getPrimaryService('heart_rate');

      console.log("[Polar BLE] Getting Heart Rate Measurement Characteristic...");
      const char = await service.getCharacteristic('heart_rate_measurement');

      console.log("[Polar BLE] Starting Notifications...");
      await char.startNotifications();

      // ผูก Event Listeners
      char.addEventListener('characteristicvaluechanged', this.handleHRUpdate);
      targetDevice.addEventListener('gattserverdisconnected', this.handleDisconnected);

      // เก็บ State
      this.device = targetDevice;
      this.characteristic = char;

      console.log(`[Polar BLE] ✅ Successfully connected to ${targetDevice.name}`);
      this.isConnecting = false;
      return true;

    } catch (error) {
      console.error("❌ [Polar BLE] Connection failed or user canceled:", error);
      this.cleanupState();
      this.isConnecting = false;
      return false;
    }
  },

  // ฟังก์ชันล้าง State ภายใน
  cleanupState() {
    if (this.characteristic) {
      try {
        this.characteristic.removeEventListener('characteristicvaluechanged', this.handleHRUpdate);
        this.characteristic.stopNotifications().catch(() => {});
      } catch (e) {
        // Ignore if already disconnected
      }
      this.characteristic = null;
    }

    if (this.device) {
      this.device.removeEventListener('gattserverdisconnected', this.handleDisconnected);
    }

    this.currentHR = 0;
    this.intensityMultiplier = 1.0;
  },

  disconnect() {
    console.log("[Polar BLE] Executing clean disconnect...");
    
    this.cleanupState();

    if (this.device?.gatt?.connected) {
      console.log(`[Polar BLE] Disconnecting GATT from ${this.device.name}...`);
      this.device.gatt.disconnect();
    }
    
    // หากต้องการให้ล้างความจำอุปกรณ์เดิมทิ้งไปเลย (บังคับ Popup ใหม่ทุกครั้ง) ให้เปิดบรรทัดล่างนี้ค่ะ:
    // this.device = null;
    
    console.log("[Polar BLE] Disconnected successfully.");
  }
};