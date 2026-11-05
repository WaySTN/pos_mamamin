import {
  type BluetoothPrinterDevice,
  type PrintExecutionResult,
  type PrinterAdapter,
  type PrinterAdapterMetadata,
  type PrinterConnectionSnapshot,
  type PrinterErrorCode,
  type PrinterPermissionStatus,
  type PrintTransmissionPayload,
} from './printerAdapter';
import { DEFAULT_58MM_CHAR_COLUMNS } from './receiptFormatter';

export type MockFailureMode =
  | 'NONE'
  | 'BLUETOOTH_DISABLED'
  | 'PERMISSION_DENIED'
  | 'CONNECTION_TIMEOUT'
  | 'SOCKET_WRITE_FAILED';

const MOCK_PAIRED_DEVICES: readonly BluetoothPrinterDevice[] = [
  {
    address: 'DC:0D:30:00:00:01',
    name: '[SIMULASI DEV] Printer Thermal 58mm',
    bondState: 'BONDED',
    transport: 'MOCK_DEV',
    isMockDevice: true,
  },
];

/**
 * Adapter printer simulasi khusus development/pengujian sebelum perangkat fisik tersedia.
 * Selalu menandai `isSimulated: true` dan `UNVERIFIED_NO_HARDWARE` agar UI tidak pernah
 * mengklaim struk kertas fisik telah tercetak.
 */
export class MockPrinterAdapter implements PrinterAdapter {
  private failureMode: MockFailureMode = 'NONE';
  private connectionState: PrinterConnectionSnapshot = {
    status: 'DISCONNECTED',
    connectedDevice: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    updatedAtMs: Date.now(),
  };
  private lastTransmittedPayload: PrintTransmissionPayload | null = null;

  getAdapterMetadata(): PrinterAdapterMetadata {
    return {
      adapterId: 'mock-escpos-58mm-dev',
      adapterName: 'MockPrinterAdapter (Simulasi Dev)',
      transport: 'MOCK_DEV',
      isSimulatedAdapter: true,
      hardwareVerification: 'UNVERIFIED_NO_HARDWARE',
      targetPaperWidthMm: 58,
      defaultColumns: DEFAULT_58MM_CHAR_COLUMNS,
      notes:
        'Hanya simulasi memori untuk menguji alur struk & error handling. Printer fisik Bluetooth Classic 58 mm BELUM DIUJI.',
    };
  }

  getConnectionState(): PrinterConnectionSnapshot {
    return this.connectionState;
  }

  setFailureMode(mode: MockFailureMode): void {
    this.failureMode = mode;
  }

  getFailureMode(): MockFailureMode {
    return this.failureMode;
  }

  getLastTransmittedPayload(): PrintTransmissionPayload | null {
    return this.lastTransmittedPayload;
  }

  async checkPermissions(): Promise<PrinterPermissionStatus> {
    if (this.failureMode === 'PERMISSION_DENIED') {
      return 'DENIED';
    }
    return 'NOT_REQUIRED_IN_MOCK';
  }

  async listPairedPrinters(): Promise<readonly BluetoothPrinterDevice[]> {
    if (this.failureMode === 'PERMISSION_DENIED') {
      throw this.createAdapterError(
        'PERMISSION_DENIED',
        'Simulasi: Izin BLUETOOTH_CONNECT ditolak pengguna.',
      );
    }
    if (this.failureMode === 'BLUETOOTH_DISABLED') {
      throw this.createAdapterError(
        'BLUETOOTH_DISABLED',
        'Simulasi: Bluetooth perangkat Android sedang mati.',
      );
    }
    return MOCK_PAIRED_DEVICES;
  }

  async connect(deviceAddress: string): Promise<PrinterConnectionSnapshot> {
    const nowMs = Date.now();

    if (this.failureMode === 'PERMISSION_DENIED') {
      return this.failConnection(
        'PERMISSION_DENIED',
        'Simulasi: Izin Bluetooth ditolak.',
        nowMs,
      );
    }
    if (this.failureMode === 'BLUETOOTH_DISABLED') {
      return this.failConnection(
        'BLUETOOTH_DISABLED',
        'Simulasi: Aktifkan Bluetooth terlebih dahulu.',
        nowMs,
      );
    }
    if (this.failureMode === 'CONNECTION_TIMEOUT') {
      return this.failConnection(
        'CONNECTION_TIMEOUT',
        'Simulasi: Printer tidak merespons (timeout koneksi SPP).',
        nowMs,
      );
    }

    const found = MOCK_PAIRED_DEVICES.find(
      (device) => device.address === deviceAddress,
    );
    if (!found) {
      return this.failConnection(
        'DEVICE_NOT_PAIRED',
        `Simulasi: Perangkat ${deviceAddress} belum dipasangkan (paired).`,
        nowMs,
      );
    }

    this.connectionState = {
      status: 'CONNECTED',
      connectedDevice: found,
      lastErrorCode: null,
      lastErrorMessage: null,
      updatedAtMs: nowMs,
    };
    return this.connectionState;
  }

  async disconnect(): Promise<PrinterConnectionSnapshot> {
    this.connectionState = {
      status: 'DISCONNECTED',
      connectedDevice: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      updatedAtMs: Date.now(),
    };
    return this.connectionState;
  }

  async sendRawPayload(
    payload: PrintTransmissionPayload,
  ): Promise<PrintExecutionResult> {
    const nowMs = Date.now();

    if (
      this.connectionState.status !== 'CONNECTED' ||
      !this.connectionState.connectedDevice
    ) {
      return {
        outcome: 'FAILED',
        isSimulated: true,
        deviceAddress: null,
        bytesTransferred: 0,
        attemptedAtMs: nowMs,
        userMessage:
          'Belum terhubung ke adapter printer simulasi. Hubungkan perangkat mock terlebih dahulu.',
        errorCode: 'PRINTER_NOT_CONNECTED',
        technicalDetail: 'MockPrinterAdapter state is DISCONNECTED',
      };
    }

    if (this.failureMode === 'BLUETOOTH_DISABLED') {
      return {
        outcome: 'FAILED',
        isSimulated: true,
        deviceAddress: this.connectionState.connectedDevice.address,
        bytesTransferred: 0,
        attemptedAtMs: nowMs,
        userMessage:
          'Simulasi gagal: Bluetooth mati saat mengirim payload. Transaksi di SQLite tetap aman.',
        errorCode: 'BLUETOOTH_DISABLED',
        technicalDetail: 'Simulated BLUETOOTH_DISABLED',
      };
    }

    if (this.failureMode === 'SOCKET_WRITE_FAILED') {
      return {
        outcome: 'FAILED',
        isSimulated: true,
        deviceAddress: this.connectionState.connectedDevice.address,
        bytesTransferred: 0,
        attemptedAtMs: nowMs,
        userMessage:
          'Simulasi gagal: Koneksi socket SPP terputus. Gunakan Cetak Ulang tanpa membuat transaksi baru.',
        errorCode: 'SOCKET_WRITE_FAILED',
        technicalDetail: 'Simulated RFCOMM socket write IOException',
      };
    }

    this.lastTransmittedPayload = payload;

    return {
      outcome: 'UNKNOWN',
      isSimulated: true,
      deviceAddress: this.connectionState.connectedDevice.address,
      bytesTransferred: payload.escPosBytes.byteLength,
      attemptedAtMs: nowMs,
      userMessage: `Simulasi Dev selesai (${String(payload.escPosBytes.byteLength)} byte ESC/POS dibentuk). TIDAK ada kertas fisik yang dicetak — menunggu perangkat printer 58 mm.`,
      errorCode: null,
      technicalDetail: 'MOCK_SIMULATED_ONLY_NO_PHYSICAL_PRINTER',
    };
  }

  private failConnection(
    code: PrinterErrorCode,
    message: string,
    nowMs: number,
  ): PrinterConnectionSnapshot {
    this.connectionState = {
      status: 'ERROR',
      connectedDevice: null,
      lastErrorCode: code,
      lastErrorMessage: message,
      updatedAtMs: nowMs,
    };
    return this.connectionState;
  }

  private createAdapterError(code: PrinterErrorCode, message: string): Error {
    const err = new Error(message);
    err.name = code;
    return err;
  }
}

