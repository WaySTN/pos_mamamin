import { afterEach, describe, expect, it } from 'vitest';
import {
  TransactionService,
} from '../../src/services/transactionService';
import {
  ReceiptService,
} from '../../src/services/printer/receiptService';
import {
  MockPrinterAdapter,
} from '../../src/services/printer/mockPrinterAdapter';
import {
  ProductRepository,
} from '../../src/database/repositories/productRepository';
import {
  OptionGroupRepository,
} from '../../src/database/repositories/optionGroupRepository';
import {
  CategoryRepository,
} from '../../src/database/repositories/categoryRepository';
import {
  DatabaseService,
} from '../../src/database/sqlite';
import type { CartLineItem } from '../../src/domain/types';
import { NodeSqliteTestDriver } from '../helpers/nodeSqliteTestDriver';

describe('TransactionService & Checkout Integration (P3 - 22 Scenarios)', () => {
  let activeDb: DatabaseService | null = null;

  afterEach(async () => {
    if (activeDb) {
      await activeDb.close();
      activeDb = null;
    }
  });

  function createTestDb(): DatabaseService {
    const db = new DatabaseService(new NodeSqliteTestDriver(':memory:'), {
      isNativePlatformOverride: true,
    });
    activeDb = db;
    return db;
  }

  async function createInitializedTestDb(): Promise<DatabaseService> {
    const db = createTestDb();
    await db.initialize();

    // Seed test category, products, and options to satisfy strict SQLite FOREIGN KEY constraints
    await db.run(
      `INSERT INTO categories (id, name, sort_order, is_active, created_at_ms, updated_at_ms)
       VALUES ('cat_test', 'Makanan', 1, 1, 1000, 1000);`,
    );

    await db.run(
      `INSERT INTO products (id, category_id, name, pricing_mode, base_price_rupiah, is_active, is_available, sort_order, created_at_ms, updated_at_ms)
       VALUES
         ('prod_mie_01', 'cat_test', 'Mie Ayam Original', 'FIXED', 10000, 1, 1, 1, 1000, 1000),
         ('prod_seblak_01', 'cat_test', 'Seblak Prasmanan', 'BASE_PLUS_OPTIONS', 5000, 1, 1, 2, 1000, 1000);`,
    );

    await db.run(
      `INSERT INTO option_groups (id, name, min_selected, max_selected, sort_order, is_active)
       VALUES
         ('grp_level', 'Level Pedas', 1, 1, 1, 1),
         ('grp_topping', 'Topping', 0, NULL, 2, 1);`,
    );

    await db.run(
      `INSERT INTO options (id, group_id, name, unit_price_rupiah, is_active, sort_order)
       VALUES
         ('opt_level_1', 'grp_level', 'Level 1 (Sedang)', 0, 1, 1),
         ('opt_level_2', 'grp_level', 'Level 2 (Pedas)', 0, 1, 2),
         ('opt_level_3', 'grp_level', 'Level 3 (Super Pedas)', 0, 1, 3),
         ('opt_sosis', 'grp_topping', 'Sosis Sapi', 2000, 1, 1),
         ('opt_ceker', 'grp_topping', 'Ceker Ayam', 4000, 1, 2),
         ('opt_telur', 'grp_topping', 'Telur Ayam', 3000, 1, 3);`,
    );

    return db;
  }

  const sampleMieCartItem: CartLineItem = {
    lineId: 'prod_mie_01::',
    productId: 'prod_mie_01',
    productName: 'Mie Ayam Original',
    baseUnitPriceRupiah: 10_000,
    unitTotalRupiah: 10_000,
    quantity: 2,
    lineTotalRupiah: 20_000,
    notes: '',
    options: [],
  };

  const sampleSeblakPorsi1: CartLineItem = {
    lineId: 'prod_seblak_01:opt_level_1,opt_sosis:',
    productId: 'prod_seblak_01',
    productName: 'Seblak Prasmanan',
    baseUnitPriceRupiah: 5_000,
    unitTotalRupiah: 7_000,
    quantity: 1,
    lineTotalRupiah: 7_000,
    notes: 'Pedas sedang',
    options: [
      {
        optionId: 'opt_level_1',
        optionName: 'Level 1 (Sedang)',
        unitPriceRupiah: 0,
        quantityPerPortion: 1,
      },
      {
        optionId: 'opt_sosis',
        optionName: 'Sosis Sapi',
        unitPriceRupiah: 2_000,
        quantityPerPortion: 1,
      },
    ],
  };

  const sampleSeblakPorsi2: CartLineItem = {
    lineId: 'prod_seblak_01:opt_level_3,opt_ceker,opt_telur:',
    productId: 'prod_seblak_01',
    productName: 'Seblak Prasmanan',
    baseUnitPriceRupiah: 5_000,
    unitTotalRupiah: 12_000,
    quantity: 1,
    lineTotalRupiah: 12_000,
    notes: 'Extra pedas',
    options: [
      {
        optionId: 'opt_level_3',
        optionName: 'Level 3 (Super Pedas)',
        unitPriceRupiah: 0,
        quantityPerPortion: 1,
      },
      {
        optionId: 'opt_ceker',
        optionName: 'Ceker Ayam',
        unitPriceRupiah: 4_000,
        quantityPerPortion: 1,
      },
      {
        optionId: 'opt_telur',
        optionName: 'Telur Ayam',
        unitPriceRupiah: 3_000,
        quantityPerPortion: 1,
      },
    ],
  };

  // Scenario 1: checkout_cash_exact
  it('Scenario 1: checkout_cash_exact - handles exact cash payment with change = 0', async () => {
    const db = await createInitializedTestDb();
    const service = new TransactionService(db);

    const tx = await service.checkoutFromCart({
      items: [sampleMieCartItem], // total 20.000
      paymentMethod: 'CASH',
      paidAmountRupiah: 20_000,
    });

    expect(tx.status).toBe('PAID');
    expect(tx.paymentMethod).toBe('CASH');
    expect(tx.grandTotalRupiah).toBe(20_000);
    expect(tx.paidAmountRupiah).toBe(20_000);
    expect(tx.changeAmountRupiah).toBe(0);
  });

  // Scenario 2: checkout_cash_with_change
  it('Scenario 2: checkout_cash_with_change - calculates change correctly when cash > total', async () => {
    const db = await createInitializedTestDb();
    const service = new TransactionService(db);

    const tx = await service.checkoutFromCart({
      items: [sampleMieCartItem], // total 20.000
      paymentMethod: 'CASH',
      paidAmountRupiah: 50_000,
    });

    expect(tx.grandTotalRupiah).toBe(20_000);
    expect(tx.paidAmountRupiah).toBe(50_000);
    expect(tx.changeAmountRupiah).toBe(30_000);
  });

  // Scenario 3: checkout_cash_insufficient
  it('Scenario 3: checkout_cash_insufficient - rejects when tendered cash is less than grand total', async () => {
    const db = await createInitializedTestDb();
    const service = new TransactionService(db);

    await expect(
      service.checkoutFromCart({
        items: [sampleMieCartItem], // total 20.000
        paymentMethod: 'CASH',
        paidAmountRupiah: 15_000,
      }),
    ).rejects.toThrow(/kurang/i);
  });

  // Scenario 4: checkout_qris_manual_confirmed
  it('Scenario 4: checkout_qris_manual_confirmed - completes QRIS payment with change = 0 when confirmed', async () => {
    const db = await createInitializedTestDb();
    const service = new TransactionService(db);

    const tx = await service.checkoutFromCart({
      items: [sampleMieCartItem], // total 20.000
      paymentMethod: 'QRIS',
      qrisConfirmedManually: true,
    });

    expect(tx.status).toBe('PAID');
    expect(tx.paymentMethod).toBe('QRIS');
    expect(tx.grandTotalRupiah).toBe(20_000);
    expect(tx.paidAmountRupiah).toBe(20_000);
    expect(tx.changeAmountRupiah).toBe(0);
  });

  // Scenario 5: checkout_qris_manual_unconfirmed
  it('Scenario 5: checkout_qris_manual_unconfirmed - rejects QRIS payment if cashier does not manually confirm', async () => {
    const db = await createInitializedTestDb();
    const service = new TransactionService(db);

    await expect(
      service.checkoutFromCart({
        items: [sampleMieCartItem],
        paymentMethod: 'QRIS',
        qrisConfirmedManually: false,
      }),
    ).rejects.toThrow(/konfirmasi|mengonfirmasi/i);
  });

  // Scenario 6: empty_cart_checkout
  it('Scenario 6: empty_cart_checkout - rejects checkout when cart is empty', async () => {
    const db = await createInitializedTestDb();
    const service = new TransactionService(db);

    await expect(
      service.checkoutFromCart({
        items: [],
        paymentMethod: 'CASH',
        paidAmountRupiah: 10_000,
      }),
    ).rejects.toThrow(/kosong/i);
  });

  // Scenario 7: double_submit_prevention
  it('Scenario 7: double_submit_prevention - prevents concurrent double-submit in-flight', async () => {
    const db = await createInitializedTestDb();
    const service = new TransactionService(db);

    // Call checkout concurrently
    const p1 = service.checkoutFromCart({
      items: [sampleMieCartItem],
      paymentMethod: 'CASH',
      paidAmountRupiah: 20_000,
    });

    const p2 = service.checkoutFromCart({
      items: [sampleMieCartItem],
      paymentMethod: 'CASH',
      paidAmountRupiah: 20_000,
    });

    const results = await Promise.allSettled([p1, p2]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly one should succeed, and one should be rejected by in-flight lock
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });

  // Scenario 8: idempotent_retry
  it('Scenario 8: idempotent_retry - returning same transaction if identical transactionId is submitted', async () => {
    const db = await createInitializedTestDb();
    const service = new TransactionService(db);

    const fixedId = 'tx_idempotent_test_01';

    const tx1 = await service.checkoutFromCart({
      transactionId: fixedId,
      items: [sampleMieCartItem],
      paymentMethod: 'CASH',
      paidAmountRupiah: 20_000,
    });

    // Retry with same ID after first completes
    const tx2 = await service.checkoutFromCart({
      transactionId: fixedId,
      items: [sampleMieCartItem],
      paymentMethod: 'CASH',
      paidAmountRupiah: 20_000,
    });

    expect(tx1.id).toBe(fixedId);
    expect(tx2.id).toBe(fixedId);
    expect(tx2.receiptNumber).toBe(tx1.receiptNumber);

    // Verify only 1 record exists in database
    const all = await service.listTransactions();
    expect(all).toHaveLength(1);
  });

  // Scenario 9: receipt_number_generation
  it('Scenario 9: receipt_number_generation - generates valid format MM-YYYYMMDD-NNNN', async () => {
    const db = await createInitializedTestDb();
    const service = new TransactionService(db);

    const tx = await service.checkoutFromCart({
      items: [sampleMieCartItem],
      paymentMethod: 'CASH',
      paidAmountRupiah: 20_000,
    });

    expect(tx.receiptNumber).toMatch(/^MM-\d{8}-\d{4}$/);
    expect(tx.dailySequence).toBe(1);
  });

  // Scenario 10: receipt_number_sequence_daily_reset
  it('Scenario 10: receipt_number_sequence_daily_reset - increments sequence on same day and resets on next day', async () => {
    const db = await createInitializedTestDb();
    const service = new TransactionService(db);

    // Day 1: 2026-11-06
    const day1Ms = Date.UTC(2026, 10, 6, 3, 0, 0); // 10:00 WIB
    const tx1 = await service.checkoutFromCart({
      occurredAtMs: day1Ms,
      items: [sampleMieCartItem],
      paymentMethod: 'CASH',
      paidAmountRupiah: 20_000,
    });

    const tx2 = await service.checkoutFromCart({
      occurredAtMs: day1Ms + 1000,
      items: [sampleMieCartItem],
      paymentMethod: 'CASH',
      paidAmountRupiah: 20_000,
    });

    expect(tx1.dailySequence).toBe(1);
    expect(tx2.dailySequence).toBe(2);
    expect(tx1.receiptNumber).toBe('MM-20261106-0001');
    expect(tx2.receiptNumber).toBe('MM-20261106-0002');

    // Day 2: 2026-11-07 (+86400000 ms)
    const day2Ms = day1Ms + 86_400_000;
    const txDay2 = await service.checkoutFromCart({
      occurredAtMs: day2Ms,
      items: [sampleMieCartItem],
      paymentMethod: 'CASH',
      paidAmountRupiah: 20_000,
    });

    expect(txDay2.dailySequence).toBe(1);
    expect(txDay2.receiptNumber).toBe('MM-20261107-0001');
  });

  // Scenario 11: atomic_transaction_rollback
  it('Scenario 11: atomic_transaction_rollback - rolls back entire transaction if an item fails DB constraint', async () => {
    const db = createTestDb();
    await db.initialize();

    // Trigger atomic failure inside withTransaction
    await expect(
      db.withTransaction(async (tx) => {
        await tx.run(
          `INSERT INTO transactions (
            id, receipt_number, daily_sequence, occurred_at_ms, business_date,
            status, payment_method, subtotal_rupiah, grand_total_rupiah,
            paid_amount_rupiah, change_amount_rupiah, created_at_ms
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            'tx_fail_01',
            'MM-20261106-9999',
            9999,
            Date.now(),
            '2026-11-06',
            'PAID',
            'CASH',
            10_000,
            10_000,
            10_000,
            0,
            Date.now(),
          ],
        );

        // Violation: negative unit price violates CHECK constraint (unit_total_rupiah >= 0)
        await tx.run(
          `INSERT INTO transaction_items (
            id, transaction_id, product_id, product_name_snapshot,
            base_unit_price_rupiah, quantity, unit_total_rupiah, line_total_rupiah
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
          ['item_fail_01', 'tx_fail_01', null, 'Corrupt Item', -500, 1, -500, -500],
        );
      }),
    ).rejects.toThrow();

    // Verify header was rolled back and does not exist
    const rows = await db.query('SELECT COUNT(*) AS count FROM transactions WHERE id = ?;', [
      'tx_fail_01',
    ]);
    expect(Number(rows[0]?.count ?? 0)).toBe(0);
  });

  // Scenario 12: item_snapshot_isolation
  it('Scenario 12: item_snapshot_isolation - changing product catalog later does not alter past transaction snapshot', async () => {
    const db = await createInitializedTestDb();
    const productRepo = new ProductRepository(db);
    const categoryRepo = new CategoryRepository(db);
    const service = new TransactionService(db);

    const cat = await categoryRepo.create({ name: 'Makanan Baru', sortOrder: 9 });
    const prod = await productRepo.create({
      categoryId: cat.id,
      name: 'Mie Ayam Manis',
      pricingMode: 'FIXED',
      basePriceRupiah: 12_000,
    });

    const cartItem: CartLineItem = {
      lineId: `${prod.id}::`,
      productId: prod.id,
      productName: prod.name,
      baseUnitPriceRupiah: prod.basePriceRupiah,
      unitTotalRupiah: prod.basePriceRupiah,
      quantity: 1,
      lineTotalRupiah: prod.basePriceRupiah,
      notes: '',
      options: [],
    };

    const tx = await service.checkoutFromCart({
      items: [cartItem],
      paymentMethod: 'CASH',
      paidAmountRupiah: 12_000,
    });

    expect(tx.items[0]?.productNameSnapshot).toBe('Mie Ayam Manis');
    expect(tx.items[0]?.baseUnitPriceRupiah).toBe(12_000);

    // Later: update product catalog name to 'Mie Ayam Spesial' and price to 18.000
    await productRepo.update(prod.id, {
      name: 'Mie Ayam Spesial',
      basePriceRupiah: 18_000,
    });

    // Past transaction must retain snapshot values
    const pastTx = await service.getTransactionById(tx.id);
    expect(pastTx?.items[0]?.productNameSnapshot).toBe('Mie Ayam Manis');
    expect(pastTx?.items[0]?.baseUnitPriceRupiah).toBe(12_000);
    expect(pastTx?.items[0]?.lineTotalRupiah).toBe(12_000);
  });

  // Scenario 13: options_snapshot_isolation
  it('Scenario 13: options_snapshot_isolation - changing option price later does not alter past transaction snapshot', async () => {
    const db = await createInitializedTestDb();
    const optRepo = new OptionGroupRepository(db);
    const service = new TransactionService(db);

    const group = await optRepo.create({
      name: 'Topping Tambahan',
      minSelected: 0,
      maxSelected: null,
      sortOrder: 1,
      options: [
        { name: 'Pangsit Goreng', unitPriceRupiah: 2_000, sortOrder: 1 },
      ],
    });

    const optPangsit = group.options[0]!;

    const cartItem: CartLineItem = {
      lineId: `prod_mie_01:${optPangsit.id}:`,
      productId: 'prod_mie_01',
      productName: 'Mie Ayam Original',
      baseUnitPriceRupiah: 10_000,
      unitTotalRupiah: 12_000,
      quantity: 1,
      lineTotalRupiah: 12_000,
      notes: '',
      options: [
        {
          optionId: optPangsit.id,
          optionName: optPangsit.name,
          unitPriceRupiah: optPangsit.unitPriceRupiah,
          quantityPerPortion: 1,
        },
      ],
    };

    const tx = await service.checkoutFromCart({
      items: [cartItem],
      paymentMethod: 'CASH',
      paidAmountRupiah: 12_000,
    });

    expect(tx.items[0]?.options[0]?.optionNameSnapshot).toBe('Pangsit Goreng');
    expect(tx.items[0]?.options[0]?.unitPriceRupiah).toBe(2_000);

    // Later: update option price in catalog to 3.500
    await optRepo.updateOption(optPangsit.id, {
      name: 'Pangsit Renyah Jumbo',
      unitPriceRupiah: 3_500,
    });

    // Past transaction must retain snapshot values
    const pastTx = await service.getTransactionById(tx.id);
    expect(pastTx?.items[0]?.options[0]?.optionNameSnapshot).toBe('Pangsit Goreng');
    expect(pastTx?.items[0]?.options[0]?.unitPriceRupiah).toBe(2_000);
  });

  // Scenario 14: seblak_multiple_portions_separate_items
  it('Scenario 14: seblak_multiple_portions_separate_items - distinct toppings produce distinct items with snapshots', async () => {
    const db = await createInitializedTestDb();
    const service = new TransactionService(db);

    const tx = await service.checkoutFromCart({
      items: [sampleSeblakPorsi1, sampleSeblakPorsi2], // 7.000 + 12.000 = 19.000
      paymentMethod: 'CASH',
      paidAmountRupiah: 20_000,
    });

    expect(tx.grandTotalRupiah).toBe(19_000);
    expect(tx.changeAmountRupiah).toBe(1_000);
    expect(tx.items).toHaveLength(2);

    // Portion 1
    const item1 = tx.items[0]!;
    expect(item1.unitTotalRupiah).toBe(7_000);
    expect(item1.notes).toBe('Pedas sedang');
    expect(item1.options).toHaveLength(2);
    expect(item1.options[0]?.optionNameSnapshot).toBe('Level 1 (Sedang)');
    expect(item1.options[1]?.optionNameSnapshot).toBe('Sosis Sapi');

    // Portion 2
    const item2 = tx.items[1]!;
    expect(item2.unitTotalRupiah).toBe(12_000);
    expect(item2.notes).toBe('Extra pedas');
    expect(item2.options).toHaveLength(3);
    expect(item2.options[0]?.optionNameSnapshot).toBe('Level 3 (Super Pedas)');
    expect(item2.options[1]?.optionNameSnapshot).toBe('Ceker Ayam');
    expect(item2.options[2]?.optionNameSnapshot).toBe('Telur Ayam');
  });

  // Scenario 15: list_transactions_ordering
  it('Scenario 15: list_transactions_ordering - returns transactions in descending chronological order (occurred_at_ms DESC)', async () => {
    const db = await createInitializedTestDb();
    const service = new TransactionService(db);

    await service.checkoutFromCart({
      occurredAtMs: 1000,
      items: [sampleMieCartItem],
      paymentMethod: 'CASH',
      paidAmountRupiah: 20_000,
    });

    await service.checkoutFromCart({
      occurredAtMs: 3000,
      items: [sampleMieCartItem],
      paymentMethod: 'CASH',
      paidAmountRupiah: 20_000,
    });

    await service.checkoutFromCart({
      occurredAtMs: 2000,
      items: [sampleMieCartItem],
      paymentMethod: 'CASH',
      paidAmountRupiah: 20_000,
    });

    const list = await service.listTransactions();
    expect(list).toHaveLength(3);
    expect(list[0]?.occurredAtMs).toBe(3000);
    expect(list[1]?.occurredAtMs).toBe(2000);
    expect(list[2]?.occurredAtMs).toBe(1000);
  });

  // Scenario 16: list_transactions_date_filtering
  it('Scenario 16: list_transactions_date_filtering - filters transactions by specific business date', async () => {
    const db = await createInitializedTestDb();
    const service = new TransactionService(db);

    // 2026-11-05
    await service.checkoutFromCart({
      occurredAtMs: Date.UTC(2026, 10, 5, 3, 0, 0),
      items: [sampleMieCartItem],
      paymentMethod: 'CASH',
      paidAmountRupiah: 20_000,
    });

    // 2026-11-06
    await service.checkoutFromCart({
      occurredAtMs: Date.UTC(2026, 10, 6, 3, 0, 0),
      items: [sampleMieCartItem],
      paymentMethod: 'CASH',
      paidAmountRupiah: 20_000,
    });

    const listSpecific = await service.listTransactions({
      specificBusinessDate: '2026-11-06',
    });
    expect(listSpecific).toHaveLength(1);
    expect(listSpecific[0]?.businessDate).toBe('2026-11-06');

    const listAll = await service.listTransactions();
    expect(listAll).toHaveLength(2);
  });

  // Scenario 17: void_paid_transaction_with_reason
  it('Scenario 17: void_paid_transaction_with_reason - changes status to VOID with reason and timestamp', async () => {
    const db = await createInitializedTestDb();
    const service = new TransactionService(db);

    const tx = await service.checkoutFromCart({
      items: [sampleMieCartItem],
      paymentMethod: 'CASH',
      paidAmountRupiah: 20_000,
    });

    expect(tx.status).toBe('PAID');

    const voided = await service.voidTransaction(tx.id, 'Salah input porsi');
    expect(voided.status).toBe('VOID');
    expect(voided.voidReason).toBe('Salah input porsi');
    expect(voided.voidedAtMs).toBeGreaterThan(0);

    // Verify persisted in DB
    const fetched = await service.getTransactionById(tx.id);
    expect(fetched?.status).toBe('VOID');
    expect(fetched?.voidReason).toBe('Salah input porsi');
  });

  // Scenario 18: void_without_reason_rejected
  it('Scenario 18: void_without_reason_rejected - rejects void attempt with empty or whitespace reason', async () => {
    const db = await createInitializedTestDb();
    const service = new TransactionService(db);

    const tx = await service.checkoutFromCart({
      items: [sampleMieCartItem],
      paymentMethod: 'CASH',
      paidAmountRupiah: 20_000,
    });

    await expect(service.voidTransaction(tx.id, '   ')).rejects.toThrow(/alasan/i);
  });

  // Scenario 19: void_already_voided_rejected
  it('Scenario 19: void_already_voided_rejected - prevents double-void on already voided transaction', async () => {
    const db = await createInitializedTestDb();
    const service = new TransactionService(db);

    const tx = await service.checkoutFromCart({
      items: [sampleMieCartItem],
      paymentMethod: 'CASH',
      paidAmountRupiah: 20_000,
    });

    await service.voidTransaction(tx.id, 'Pelanggan membatalkan pesanan');

    await expect(
      service.voidTransaction(tx.id, 'Coba batalkan kedua kali'),
    ).rejects.toThrow(/sudah berstatus VOID/i);
  });

  // Scenario 20: receipt_formatter_paid_normal
  it('Scenario 20: receipt_formatter_paid_normal - generates 58 mm receipt with header, items, payment, and change', async () => {
    const db = await createInitializedTestDb();
    const mockPrinter = new MockPrinterAdapter();
    const receiptService = new ReceiptService(db, mockPrinter);
    const service = new TransactionService(db, receiptService);

    const tx = await service.checkoutFromCart({
      items: [sampleMieCartItem],
      paymentMethod: 'CASH',
      paidAmountRupiah: 50_000,
    });

    const preview = await service.getReceiptPreview(tx.id);
    const text = preview.formatted.plainText;

    expect(text).toContain('MAMAMIN');
    expect(text).toContain(tx.receiptNumber);
    expect(text).toContain('Mie Ayam Original');
    expect(text).toContain('CASH');
    expect(text).toContain('20.000'); // total
    expect(text).toContain('50.000'); // bayar
    expect(text).toContain('30.000'); // kembali
    expect(text).not.toContain('*** SALINAN STRUK ***');
    expect(text).not.toContain('*** DIBATALKAN (VOID) ***');
  });

  // Scenario 21: receipt_formatter_reprint_salinan
  it('Scenario 21: receipt_formatter_reprint_salinan - reprint receipt contains *** SALINAN STRUK *** banner', async () => {
    const db = await createInitializedTestDb();
    const mockPrinter = new MockPrinterAdapter();
    const receiptService = new ReceiptService(db, mockPrinter);
    const service = new TransactionService(db, receiptService);

    const tx = await service.checkoutFromCart({
      items: [sampleMieCartItem],
      paymentMethod: 'CASH',
      paidAmountRupiah: 20_000,
    });

    const preview = await service.getReceiptPreview(tx.id, { isReprint: true });
    const text = preview.formatted.plainText;

    expect(text).toContain('*** SALINAN STRUK ***');
  });

  // Scenario 22: receipt_formatter_void_dibatalkan
  it('Scenario 22: receipt_formatter_void_dibatalkan - voided receipt contains *** DIBATALKAN (VOID) *** and reason', async () => {
    const db = await createInitializedTestDb();
    const mockPrinter = new MockPrinterAdapter();
    const receiptService = new ReceiptService(db, mockPrinter);
    const service = new TransactionService(db, receiptService);

    const tx = await service.checkoutFromCart({
      items: [sampleMieCartItem],
      paymentMethod: 'CASH',
      paidAmountRupiah: 20_000,
    });

    await service.voidTransaction(tx.id, 'Pelanggan salah pesan');

    const preview = await service.getReceiptPreview(tx.id);
    const text = preview.formatted.plainText;

    expect(text).toContain('*** DIBATALKAN (VOID) ***');
    expect(text).toContain('Pelanggan salah pesan');
  });
});
