import { describe, expect, it } from 'vitest';
import {
  BACKUP_FORMAT_ID,
  CURRENT_BACKUP_SCHEMA_VERSION,
  calculateRecordCounts,
  computeSha256Hex,
  formatTimestampToWib,
  generateBackupFileName,
  inspectBackupContent,
  type BackupTableData,
  type MamaminBackupPayload,
} from '../../src/domain/backup';

describe('domain/backup: Metadata, Checksums, and Inspection', () => {
  const dummyTables: BackupTableData = {
    categories: [
      { id: 'cat_1', name: 'Mie Ayam', sort_order: 1, is_active: 1, created_at_ms: 1000, updated_at_ms: 1000 },
    ],
    products: [
      {
        id: 'prod_1',
        category_id: 'cat_1',
        name: 'Mie Ayam Biasa',
        sku: null,
        pricing_mode: 'FIXED',
        base_price_rupiah: 10000,
        is_active: 1,
        is_available: 1,
        sort_order: 1,
        created_at_ms: 1000,
        updated_at_ms: 1000,
      },
    ],
    option_groups: [],
    options: [],
    product_option_groups: [],
    daily_counters: [{ business_date: '2026-11-06', last_sequence: 1 }],
    transactions: [
      {
        id: 'tx_1',
        receipt_number: 'MM-20261106-0001',
        daily_sequence: 1,
        occurred_at_ms: 1730865600000,
        business_date: '2026-11-06',
        status: 'PAID',
        payment_method: 'CASH',
        subtotal_rupiah: 10000,
        grand_total_rupiah: 10000,
        paid_amount_rupiah: 15000,
        change_amount_rupiah: 5000,
        void_reason: null,
        voided_at_ms: null,
        created_at_ms: 1730865600000,
      },
    ],
    transaction_items: [
      {
        id: 'item_1',
        transaction_id: 'tx_1',
        product_id: 'prod_1',
        product_name_snapshot: 'Mie Ayam Biasa',
        base_unit_price_rupiah: 10000,
        quantity: 1,
        unit_total_rupiah: 10000,
        line_total_rupiah: 10000,
        notes: null,
      },
    ],
    transaction_item_options: [],
    expenses: [
      {
        id: 'exp_1',
        occurred_at_ms: 1730865600000,
        business_date: '2026-11-06',
        category: 'Bahan Baku & Pasar',
        amount_rupiah: 5000,
        notes: 'Beli sawi',
        status: 'ACTIVE',
        void_reason: null,
        voided_at_ms: null,
        created_at_ms: 1730865600000,
      },
    ],
    print_attempts: [],
    settings: [{ key: 'app_name', value: 'MamaMin POS', updated_at_ms: 1000 }],
  };

  it('computes correct and deterministic SHA-256 hex string', async () => {
    const hash1 = await computeSha256Hex('mamamin-pos-test-string');
    const hash2 = await computeSha256Hex('mamamin-pos-test-string');
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('generates formatted backup file name based on WIB date', () => {
    // 2026-11-06 09:30 WIB = UTC 02:30
    const testDateMs = new Date('2026-11-06T02:30:00Z').getTime();
    const fileName = generateBackupFileName(testDateMs);
    expect(fileName).toBe('mamamin-backup-2026-11-06-0930.json');
  });

  it('formats timestamp to WIB with timezone indicator', () => {
    const testDateMs = new Date('2026-11-06T02:30:00Z').getTime();
    const wibString = formatTimestampToWib(testDateMs);
    expect(wibString).toContain('06/11/2026');
    expect(wibString).toContain('WIB');
  });

  it('calculates record counts accurately across all 12 tables', () => {
    const counts = calculateRecordCounts(dummyTables);
    expect(counts.categories).toBe(1);
    expect(counts.products).toBe(1);
    expect(counts.transactions).toBe(1);
    expect(counts.transaction_items).toBe(1);
    expect(counts.expenses).toBe(1);
    expect(counts.settings).toBe(1);
    expect(counts.options).toBe(0);
  });

  it('inspects valid backup payload successfully and extracts statistical summary (T20)', async () => {
    const counts = calculateRecordCounts(dummyTables);
    const checksum = await computeSha256Hex(JSON.stringify(dummyTables));

    const validPayload: MamaminBackupPayload = {
      metadata: {
        format_id: BACKUP_FORMAT_ID,
        app_version: '0.1.0',
        schema_version: CURRENT_BACKUP_SCHEMA_VERSION,
        exported_at_ms: 1730865600000,
        exported_at_wib: '06/11/2026, 09.30.00 WIB',
        business_date_wib: '2026-11-06',
        timezone: 'Asia/Jakarta',
        record_counts: counts,
        total_records: 6,
        sha256_checksum: checksum,
      },
      tables: dummyTables,
    };

    const inspection = await inspectBackupContent(JSON.stringify(validPayload));
    expect(inspection.isValid).toBe(true);
    expect(inspection.errorMessage).toBeNull();
    expect(inspection.summary?.paidTransactionsCount).toBe(1);
    expect(inspection.summary?.totalPaidOmzetRupiah).toBe(10000);
    expect(inspection.summary?.totalActiveExpensesRupiah).toBe(5000);
    expect(inspection.summary?.categoriesCount).toBe(1);
    expect(inspection.summary?.productsCount).toBe(1);
  });

  it('rejects invalid JSON content (T21)', async () => {
    const inspection = await inspectBackupContent('invalid json { broken');
    expect(inspection.isValid).toBe(false);
    expect(inspection.errorMessage).toContain('bukan JSON yang sah');
  });

  it('rejects payload with invalid format_id (T21)', async () => {
    const counts = calculateRecordCounts(dummyTables);
    const checksum = await computeSha256Hex(JSON.stringify(dummyTables));

    const invalidPayload = {
      metadata: {
        format_id: 'unknown-format',
        app_version: '0.1.0',
        schema_version: 1,
        exported_at_ms: 1730865600000,
        exported_at_wib: '06/11/2026, 09.30.00 WIB',
        business_date_wib: '2026-11-06',
        timezone: 'Asia/Jakarta',
        record_counts: counts,
        total_records: 6,
        sha256_checksum: checksum,
      },
      tables: dummyTables,
    };

    const inspection = await inspectBackupContent(JSON.stringify(invalidPayload));
    expect(inspection.isValid).toBe(false);
    expect(inspection.errorMessage).toContain('Format backup tidak dikenal');
  });

  it('rejects payload with incompatible schema version (T21)', async () => {
    const counts = calculateRecordCounts(dummyTables);
    const checksum = await computeSha256Hex(JSON.stringify(dummyTables));

    const invalidPayload = {
      metadata: {
        format_id: BACKUP_FORMAT_ID,
        app_version: '0.1.0',
        schema_version: 99, // incompatible future version
        exported_at_ms: 1730865600000,
        exported_at_wib: '06/11/2026, 09.30.00 WIB',
        business_date_wib: '2026-11-06',
        timezone: 'Asia/Jakarta',
        record_counts: counts,
        total_records: 6,
        sha256_checksum: checksum,
      },
      tables: dummyTables,
    };

    const inspection = await inspectBackupContent(JSON.stringify(invalidPayload));
    expect(inspection.isValid).toBe(false);
    expect(inspection.errorMessage).toContain('Versi skema database backup');
  });

  it('rejects tampered data where SHA-256 checksum does not match (T21)', async () => {
    const counts = calculateRecordCounts(dummyTables);
    const validChecksum = await computeSha256Hex(JSON.stringify(dummyTables));

    const tamperedTables: BackupTableData = {
      ...dummyTables,
      transactions: [
        {
          ...dummyTables.transactions[0]!,
          grand_total_rupiah: 999999, // Dimodifikasi secara diam-diam!
        },
      ],
    };

    const payloadWithTamperedTables: MamaminBackupPayload = {
      metadata: {
        format_id: BACKUP_FORMAT_ID,
        app_version: '0.1.0',
        schema_version: CURRENT_BACKUP_SCHEMA_VERSION,
        exported_at_ms: 1730865600000,
        exported_at_wib: '06/11/2026, 09.30.00 WIB',
        business_date_wib: '2026-11-06',
        timezone: 'Asia/Jakarta',
        record_counts: counts,
        total_records: 6,
        sha256_checksum: validChecksum, // checksum lama
      },
      tables: tamperedTables,
    };

    const inspection = await inspectBackupContent(JSON.stringify(payloadWithTamperedTables));
    expect(inspection.isValid).toBe(false);
    expect(inspection.errorMessage).toContain('Checksum integritas SHA-256 tidak cocok');
  });

  it('rejects payload with mismatched table record counts (T21)', async () => {
    const checksum = await computeSha256Hex(JSON.stringify(dummyTables));

    const payloadWithMismatchedCounts = {
      metadata: {
        format_id: BACKUP_FORMAT_ID,
        app_version: '0.1.0',
        schema_version: CURRENT_BACKUP_SCHEMA_VERSION,
        exported_at_ms: 1730865600000,
        exported_at_wib: '06/11/2026, 09.30.00 WIB',
        business_date_wib: '2026-11-06',
        timezone: 'Asia/Jakarta',
        record_counts: {
          categories: 999, // palsu
          products: 1,
          option_groups: 0,
          options: 0,
          product_option_groups: 0,
          daily_counters: 1,
          transactions: 1,
          transaction_items: 1,
          transaction_item_options: 0,
          expenses: 1,
          print_attempts: 0,
          settings: 1,
        },
        total_records: 6,
        sha256_checksum: checksum,
      },
      tables: dummyTables,
    };

    const inspection = await inspectBackupContent(JSON.stringify(payloadWithMismatchedCounts));
    expect(inspection.isValid).toBe(false);
    expect(inspection.errorMessage).toContain('tidak cocok dengan metadata');
  });
});

