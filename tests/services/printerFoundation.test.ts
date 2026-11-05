import { afterEach, describe, expect, it } from 'vitest';
import { TransactionRepository } from '../../src/database/repositories/transactionRepository';
import { DatabaseService } from '../../src/database/sqlite';
import { formatReceiptNumber } from '../../src/domain/receiptNumber';
import { MockPrinterAdapter } from '../../src/services/printer/mockPrinterAdapter';
import {
  DEFAULT_58MM_CHAR_COLUMNS,
  formatTransactionReceipt,
} from '../../src/services/printer/receiptFormatter';
import { ReceiptService } from '../../src/services/printer/receiptService';
import { NodeSqliteTestDriver } from '../helpers/nodeSqliteTestDriver';

describe('58 mm Receipt Formatter, MockPrinterAdapter, & ReceiptService', () => {
  let activeDb: DatabaseService | null = null;

  afterEach(async () => {
    if (activeDb) {
      await activeDb.close();
      activeDb = null;
    }
  });

  it('formats receipt numbers cleanly with 4-digit padding', () => {
    expect(formatReceiptNumber('2026-11-05', 1)).toBe('MM-20261105-0001');
    expect(formatReceiptNumber('2026-11-05', 42)).toBe('MM-20261105-0042');
    expect(formatReceiptNumber('2026-11-05', 12_345)).toBe('MM-20261105-12345');
  });

  it('wraps long names within 32 columns, marks SALINAN/DIBATALKAN, and omits cutter commands (T25)', async () => {
    const db = new DatabaseService(new NodeSqliteTestDriver(':memory:'), {
      isNativePlatformOverride: true,
    });
    activeDb = db;
    await db.initialize();

    const txRepo = new TransactionRepository(db);
    const occurredAtMs = Date.UTC(2026, 10, 5, 12, 35, 0); // 05/11/2026 19:35 WIB

    const saved = await txRepo.createPaidSale({
      id: 'tx_receipt_long',
      occurredAtMs,
      paymentMethod: 'CASH',
      paidAmountRupiah: 50_000,
      items: [
        {
          id: 'item_long_1',
          productId: null,
          productNameSnapshot:
            'Paket Komplit Spesial Nama Sangat Panjang Untuk Uji Lebar Kertas Thermal 58mm',
          baseUnitPriceRupiah: 18_000,
          quantity: 2,
          notes: 'Kuah dipisah jangan terlalu pedas',
          options: [
            {
              id: 'opt_long_1',
              optionId: null,
              optionNameSnapshot: 'Topping Tambahan Ekstra Panjang Sekali',
              unitPriceRupiah: 3_000,
              quantityPerPortion: 1,
            },
          ],
        },
      ],
    });

    const normalDoc = formatTransactionReceipt(saved, {
      store: {
        storeName: 'Kedai MamaMin',
        storeAddress: 'Jl. Contoh Usaha UMKM No. 12',
        footerNote: 'Terima kasih!',
      },
      isReprint: false,
      columns: DEFAULT_58MM_CHAR_COLUMNS,
    });

    for (const line of normalDoc.lines) {
      expect(line.length).toBeLessThanOrEqual(DEFAULT_58MM_CHAR_COLUMNS);
    }
    expect(normalDoc.plainText).toContain('MM-20261105-0001');
    expect(normalDoc.plainText).toContain('05/11/2026 19:35 WIB');
    expect(normalDoc.plainText).toContain('42.000');
    expect(normalDoc.plainText).toContain('KEMBALIAN');
    expect(normalDoc.plainText).not.toContain('SALINAN');
    expect(normalDoc.plainText).not.toContain('DIBATALKAN');

    // ESC @ (0x1b, 0x40) di awal dan tidak mengandung GS V auto-cut (0x1d, 0x56)
    expect(normalDoc.escPosBytes[0]).toBe(0x1b);
    expect(normalDoc.escPosBytes[1]).toBe(0x40);
    let hasAutoCutCommand = false;
    for (let i = 0; i < normalDoc.escPosBytes.length - 1; i += 1) {
      if (
        normalDoc.escPosBytes[i] === 0x1d &&
        normalDoc.escPosBytes[i + 1] === 0x56
      ) {
        hasAutoCutCommand = true;
      }
    }
    expect(hasAutoCutCommand).toBe(false);

    // Void + Reprint wajib menampilkan DIBATALKAN dan SALINAN
    const voided = await txRepo.voidTransaction(
      saved.id,
      'Pesanan dibatalkan atas permintaan pembeli',
      occurredAtMs + 60_000,
    );
    const voidReprintDoc = formatTransactionReceipt(voided, {
      store: {
        storeName: 'MamaMin',
        storeAddress: null,
        footerNote: 'Terima kasih!',
      },
      isReprint: true,
    });

    expect(voidReprintDoc.plainText).toContain('DIBATALKAN (VOID)');
    expect(voidReprintDoc.plainText).toContain('SALINAN STRUK');
    for (const line of voidReprintDoc.lines) {
      expect(line.length).toBeLessThanOrEqual(DEFAULT_58MM_CHAR_COLUMNS);
    }
  });

  it('handles MockPrinterAdapter failures safely and never duplicates transactions on reprint (T12, T13, T24)', async () => {
    const db = new DatabaseService(new NodeSqliteTestDriver(':memory:'), {
      isNativePlatformOverride: true,
    });
    activeDb = db;
    await db.initialize();

    const txRepo = new TransactionRepository(db);
    const mockPrinter = new MockPrinterAdapter();
    const receiptService = new ReceiptService(db, mockPrinter);

    const saved = await txRepo.createPaidSale({
      id: 'tx_print_flow',
      occurredAtMs: Date.UTC(2026, 10, 5, 14, 0, 0),
      paymentMethod: 'QRIS',
      qrisConfirmedManually: true,
      items: [
        {
          id: 'item_p1',
          productId: null,
          productNameSnapshot: 'Item Uji QRIS',
          baseUnitPriceRupiah: 13_000,
          quantity: 1,
        },
      ],
    });

    // T12: Saat belum terhubung / printer mati, print gagal namun transaksi tetap PAID
    const disconnectedPrint = await receiptService.printSavedTransaction(
      saved.id,
    );
    expect(disconnectedPrint.transmission.outcome).toBe('FAILED');
    expect(disconnectedPrint.transmission.errorCode).toBe(
      'PRINTER_NOT_CONNECTED',
    );

    const stillSaved = await txRepo.getById(saved.id);
    expect(stillSaved?.status).toBe('PAID');

    // T24: Simulasi izin Bluetooth ditolak
    mockPrinter.setFailureMode('PERMISSION_DENIED');
    expect(await mockPrinter.checkPermissions()).toBe('DENIED');
    const deniedConn = await mockPrinter.connect('DC:0D:30:00:00:01');
    expect(deniedConn.status).toBe('ERROR');
    expect(deniedConn.lastErrorCode).toBe('PERMISSION_DENIED');

    // Pulihkan koneksi mock normal & uji T13 (reprint 3x tidak membuat transaksi baru)
    mockPrinter.setFailureMode('NONE');
    const devices = await mockPrinter.listPairedPrinters();
    await mockPrinter.connect(devices[0]!.address);

    for (let i = 0; i < 3; i += 1) {
      const reprintRes = await receiptService.printSavedTransaction(saved.id, {
        isReprint: true,
        nowMs: 10_000 + i,
      });
      // Mock tidak boleh mengklaim SENT_TO_DEVICE fisik; harus UNKNOWN + isSimulated
      expect(reprintRes.transmission.outcome).toBe('UNKNOWN');
      expect(reprintRes.transmission.isSimulated).toBe(true);
      expect(reprintRes.formatted.plainText).toContain('SALINAN STRUK');
    }

    // Cetak uji 58 mm tidak boleh menambah baris di tabel transactions
    const testPageRes = await receiptService.printTestPage(20_000);
    expect(testPageRes.transmission.isSimulated).toBe(true);

    const txCountRows = await db.query<{ total: number }>(
      'SELECT COUNT(*) AS total FROM transactions;',
    );
    expect(Number(txCountRows[0]?.total)).toBe(1);

    const attempts = await txRepo.listPrintAttempts(saved.id);
    expect(attempts).toHaveLength(4); // 1 FAILED + 3 UNKNOWN (mock reprint)
  });
});

