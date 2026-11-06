import { afterEach, describe, expect, it } from 'vitest';
import { applyOfficialMamaMinCatalog } from '../../src/database/repositories/catalogTemplate';
import { ExpenseRepository } from '../../src/database/repositories/expenseRepository';
import { ProductRepository } from '../../src/database/repositories/productRepository';
import { DatabaseService } from '../../src/database/sqlite';
import { BackupService } from '../../src/services/backup/backupService';
import { TransactionService } from '../../src/services/transactionService';
import { NodeSqliteTestDriver } from '../helpers/nodeSqliteTestDriver';

describe('BackupService (Full Export, Inspection, and Atomic Restore)', () => {
  let activeDb: DatabaseService | null = null;

  afterEach(async () => {
    if (activeDb) {
      await activeDb.close();
      activeDb = null;
    }
  });

  function createMemoryDb(): DatabaseService {
    const db = new DatabaseService(new NodeSqliteTestDriver(':memory:'), {
      isNativePlatformOverride: true,
    });
    activeDb = db;
    return db;
  }

  it('exports full database accurately and updates last backup metadata (T20)', async () => {
    const db = createMemoryDb();
    await db.initialize();

    // 1. Inisialisasi katalog resmi MamaMin
    await applyOfficialMamaMinCatalog(db);

    // 2. Buat satu transaksi penjualan
    const txService = new TransactionService(db);
    const prodRepo = new ProductRepository(db);
    const products = await prodRepo.list();
    const mieAyam = products.find((p) => p.name === 'Mie Ayam Biasa')!;

    await txService.checkoutFromCart({
      paymentMethod: 'CASH',
      paidAmountRupiah: 20000,
      occurredAtMs: 1730865600000,
      items: [
        {
          lineId: `${mieAyam.id}::`,
          productId: mieAyam.id,
          productName: mieAyam.name,
          baseUnitPriceRupiah: 10000,
          unitTotalRupiah: 10000,
          quantity: 1,
          lineTotalRupiah: 10000,
          notes: '',
          options: [],
        },
      ],
    });

    // 3. Catat satu pengeluaran operasional
    const expRepo = new ExpenseRepository(db);
    await expRepo.createExpense({
      occurredAtMs: 1730865600000,
      businessDate: '2026-11-06',
      category: 'Bahan Baku & Pasar',
      amountRupiah: 15000,
      notes: 'Beli bumbu seblak',
    });

    const backupService = new BackupService(db);
    const backup = await backupService.exportFullBackup(1730865600000);

    // Verifikasi metadata
    expect(backup.metadata.format_id).toBe('mamamin-backup-v1');
    expect(backup.metadata.schema_version).toBe(1);
    expect(backup.metadata.sha256_checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(backup.metadata.record_counts.categories).toBe(4);
    expect(backup.metadata.record_counts.products).toBe(21);
    expect(backup.metadata.record_counts.transactions).toBe(1);
    expect(backup.metadata.record_counts.expenses).toBe(1);

    // Verifikasi data tabel
    expect(backup.tables.categories.length).toBe(4);
    expect(backup.tables.products.length).toBe(21);
    expect(backup.tables.transactions[0]?.status).toBe('PAID');
    expect(backup.tables.transactions[0]?.grand_total_rupiah).toBe(10000);
    expect(backup.tables.expenses[0]?.amount_rupiah).toBe(15000);

    // Verifikasi catatan riwayat backup tersimpan di tabel settings
    const info = await backupService.getLastBackupInfo();
    expect(info.lastBackupAtMs).toBe(1730865600000);
    expect(info.filename).toContain('mamamin-backup-');
  });

  it('restores valid backup payload completely into clean or modified database (T22)', async () => {
    const db = createMemoryDb();
    await db.initialize();

    // 1. Setup data awal di database
    await applyOfficialMamaMinCatalog(db);
    const txService = new TransactionService(db);
    const prodRepo = new ProductRepository(db);
    const products = await prodRepo.list();
    const mieYamin = products.find((p) => p.name === 'Mie Yamin')!;
    const pedasGroup = mieYamin.optionGroups.find((g) => g.name === 'Level Pedas Mie Yamin');
    const sedangOption = pedasGroup?.options.find((o) => o.name === 'Sedang');
    const optionId = sedangOption ? sedangOption.id : 'opt_temp';

    // Transaksi dengan modifier level pedas
    const tx = await txService.checkoutFromCart({
      paymentMethod: 'CASH',
      paidAmountRupiah: 15000,
      occurredAtMs: 1730865600000,
      items: [
        {
          lineId: `${mieYamin.id}:${optionId ?? ''}:`,
          productId: mieYamin.id,
          productName: mieYamin.name,
          baseUnitPriceRupiah: 10000,
          unitTotalRupiah: 10000,
          quantity: 1,
          lineTotalRupiah: 10000,
          notes: '',
          options: [
            {
              optionId,
              optionName: 'Sedang',
              unitPriceRupiah: 0,
              quantityPerPortion: 1,
            },
          ],
        },
      ],
    });

    const expRepo = new ExpenseRepository(db);
    await expRepo.createExpense({
      occurredAtMs: 1730865600000,
      businessDate: '2026-11-06',
      category: 'Gas & Minyak',
      amountRupiah: 22000,
      notes: 'Beli gas elpiji 3kg',
    });

    // 2. Ekspor backup snapshot
    const backupService = new BackupService(db);
    const exportedBackup = await backupService.exportFullBackup(1730865600000);

    // 3. Simulasi database mengalami modifikasi / penghapusan data
    // Buat transaksi lain dan batalkan transaksi pertama
    await txService.voidTransaction(tx.id, 'Koreksi uji coba');
    const modifiedTxList = await txService.listTransactions();
    expect(modifiedTxList[0]?.status).toBe('VOID');

    // 4. Lakukan pemulihan (RESTORE) dari file backup snapshot
    const restoreResult = await backupService.restoreValidatedBackup(exportedBackup);
    expect(restoreResult.success).toBe(true);

    // 5. Verifikasi bahwa status transaksi kembali menjadi PAID seperti saat dibackup!
    const restoredTxList = await txService.listTransactions();
    expect(restoredTxList.length).toBe(1);
    expect(restoredTxList[0]?.status).toBe('PAID');
    expect(restoredTxList[0]?.voidReason).toBeNull();
    expect(restoredTxList[0]?.grandTotalRupiah).toBe(10000);

    // Verifikasi snapshot item & options
    const restoredDetail = await txService.getTransactionById(tx.id);
    expect(restoredDetail?.items.length).toBe(1);
    expect(restoredDetail?.items[0]?.productNameSnapshot).toBe('Mie Yamin');
    expect(restoredDetail?.items[0]?.options.length).toBe(1);
    expect(restoredDetail?.items[0]?.options[0]?.optionNameSnapshot).toBe('Sedang');

    // Verifikasi pengeluaran kembali utuh
    const restoredExpenses = await expRepo.listExpenses();
    expect(restoredExpenses.length).toBe(1);
    expect(restoredExpenses[0]?.category).toBe('Gas & Minyak');
    expect(restoredExpenses[0]?.amountRupiah).toBe(22000);

    // Verifikasi integritas relasi SQLite (foreign key check)
    const fkErrors = await db.query('PRAGMA foreign_key_check;');
    expect(fkErrors.length).toBe(0);
  });

  it('rejects tampered or corrupt backup and leaves active database untouched (T21)', async () => {
    const db = createMemoryDb();
    await db.initialize();
    await applyOfficialMamaMinCatalog(db);

    const txService = new TransactionService(db);
    const prodRepo = new ProductRepository(db);
    const products = await prodRepo.list();
    const mieAyam = products.find((p) => p.name === 'Mie Ayam Biasa')!;

    await txService.checkoutFromCart({
      paymentMethod: 'CASH',
      paidAmountRupiah: 10000,
      occurredAtMs: 1730865600000,
      items: [
        {
          lineId: `${mieAyam.id}::`,
          productId: mieAyam.id,
          productName: mieAyam.name,
          baseUnitPriceRupiah: 10000,
          unitTotalRupiah: 10000,
          quantity: 1,
          lineTotalRupiah: 10000,
          notes: '',
          options: [],
        },
      ],
    });

    const backupService = new BackupService(db);
    const validBackup = await backupService.exportFullBackup(1730865600000);

    // Rusak checksum payload backup
    const tamperedBackup = {
      ...validBackup,
      metadata: {
        ...validBackup.metadata,
        sha256_checksum: 'deadbeef00000000000000000000000000000000000000000000000000000000',
      },
    };

    // Eksekusi restore harus melempar error
    await expect(backupService.restoreValidatedBackup(tamperedBackup)).rejects.toThrow(
      /Checksum integritas SHA-256 tidak cocok/,
    );

    // Verifikasi database aktif TIDAK rusak dan transaksi tetap ada
    const currentTxs = await txService.listTransactions();
    expect(currentTxs.length).toBe(1);
    expect(currentTxs[0]?.status).toBe('PAID');
  });
});
