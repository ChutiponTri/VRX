"use client";

export const hrStore = {
  currentHR: 0,
  intensityMultiplier: 1.0, 
  device: null as BluetoothDevice | null,

  async connectPolar() {
    try {
      // 1. Filter by the Heart Rate service rather than a strict name prefix.
      // This will find real Polar devices AND your M5 simulator.
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: ['heart_rate'] }] 
      });

      const server = await device.gatt?.connect();
      
      // 2. Use the official Bluetooth string aliases for cleaner code
      const service = await server?.getPrimaryService('heart_rate');
      const characteristic = await service?.getCharacteristic('heart_rate_measurement');
      
      await characteristic?.startNotifications();

      characteristic?.addEventListener('characteristicvaluechanged', (event: any) => {
        const value = event.target.value;
        const flags = value.getUint8(0);
        const hr16 = flags & 1;
        
        // Parse standard Bluetooth HR Data
        const hr = hr16 ? value.getUint16(1, true) : value.getUint8(1);
        hrStore.currentHR = hr;
      });

      this.device = device;
      console.log(`${device.name} Connected!`);
      return true;
    } catch (error) {
      console.error("Bluetooth connection failed or user canceled", error);
      return false;
    }
  },

  disconnect() {
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
    this.currentHR = 0;
    this.intensityMultiplier = 1.0;
  }
};