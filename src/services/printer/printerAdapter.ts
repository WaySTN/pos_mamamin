export const BLUETOOTH_CLASSIC_SPP_UUID =
  '00001101-0000-1000-8000-00805F9B34FB' as const;

export type PrinterTransportType = 'BLUETOOTH_CLASSIC_SPP' | 'MOCK_DEV';

export type PrinterHardwareVerificationStatus =
  | 'UNVERIFIED_NO_HARDWARE'
  | 'VERIFIED_PHYSICAL';

export type PrinterConnectionStatus =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'ERROR';

export type PrinterPermissionStatus =
  | 'NOT_REQUIRED_IN_MOCK'
  | 'PROMPT_NEEDED'
  | 'GRANTED'
  | 'DENIED';

/**
 * Status hasil pengiriman ke adapter printer.
 * PENTING: Tidak ada status "PRINTED_SUCCESS" karena selesainya penulisan
 * socket Bluetooth tidak membuktikan kertas fisik benar-benar tercetak.
 */
export type PrintOutcomeStatus = 'SENT_TO_DEVICE' | 'FAILED' | 'UNKNOWN';

export type PrinterErrorCode =
  | 'BLUETOOTH_DISABLED'
  | 'PERMISSION_DENIED'
  | 'DEVICE_NOT_PAIRED'
  | 'PRINTER_NOT_CONNECTED'
  | 'CONNECTION_TIMEOUT'
  | 'SOCKET_WRITE_FAILED'
  | 'HARDWARE_NOT_AVAILABLE';

export interface BluetoothPrinterDevice {
  readonly address: string;
  readonly name: string;
  readonly bondState: 'BONDED' | 'NONE';
  readonly transport: PrinterTransportType;
  readonly isMockDevice: boolean;
}

export interface PrinterAdapterMetadata {
  readonly adapterId: string;
  readonly adapterName: string;
  readonly transport: PrinterTransportType;
  readonly isSimulatedAdapter: boolean;
  readonly hardwareVerification: PrinterHardwareVerificationStatus;
  readonly targetPaperWidthMm: 58;
  readonly defaultColumns: number;
  readonly notes: string;
}

export interface PrinterConnectionSnapshot {
  readonly status: PrinterConnectionStatus;
  readonly connectedDevice: BluetoothPrinterDevice | null;
  readonly lastErrorCode: PrinterErrorCode | null;
  readonly lastErrorMessage: string | null;
  readonly updatedAtMs: number;
}

export interface PrintTransmissionPayload {
  readonly jobKind: 'TRANSACTION_RECEIPT' | 'TEST_PAGE';
  readonly referenceNumber: string | null;
  readonly paperWidthMm: 58;
  readonly characterColumns: number;
  readonly plainTextPreview: string;
  readonly escPosBytes: Uint8Array;
}

export interface PrintExecutionResult {
  readonly outcome: PrintOutcomeStatus;
  readonly isSimulated: boolean;
  readonly deviceAddress: string | null;
  readonly bytesTransferred: number;
  readonly attemptedAtMs: number;
  readonly userMessage: string;
  readonly errorCode: PrinterErrorCode | null;
  readonly technicalDetail: string | null;
}

/**
 * Kontrak tunggal komunikasi printer thermal 58 mm (Bluetooth Classic SPP / Mock Dev).
 * Terpisah sepenuhnya dari kalkulasi domain dan penyimpanan transaksi SQLite.
 */
export interface PrinterAdapter {
  getAdapterMetadata(): PrinterAdapterMetadata;
  getConnectionState(): PrinterConnectionSnapshot;
  checkPermissions(): Promise<PrinterPermissionStatus>;
  listPairedPrinters(): Promise<readonly BluetoothPrinterDevice[]>;
  connect(deviceAddress: string): Promise<PrinterConnectionSnapshot>;
  disconnect(): Promise<PrinterConnectionSnapshot>;
  sendRawPayload(
    payload: PrintTransmissionPayload,
  ): Promise<PrintExecutionResult>;
}

