import type { SchemaMigration } from '../types';

export const DATABASE_NAME = 'mamamin_pos' as const;

export const LATEST_SCHEMA_VERSION = 1 as const;

export const EXPECTED_V1_TABLES = [
  'categories',
  'products',
  'option_groups',
  'options',
  'product_option_groups',
  'daily_counters',
  'transactions',
  'transaction_items',
  'transaction_item_options',
  'expenses',
  'print_attempts',
  'settings',
] as const;

export const EXPECTED_V1_INDEXES = [
  'idx_products_category',
  'idx_tx_business_status',
  'idx_tx_time',
  'idx_items_transaction',
  'idx_options_item',
  'idx_expenses_date_status',
  'idx_print_tx',
] as const;

/**
 * Skema relasional awal MamaMin POS v1 sesuai `docs/PROJECT_BLUEPRINT.md` §9.3.
 * Tidak memuat seed menu/harga produksi yang belum dikonfirmasi owner.
 */
export const MIGRATION_V1_STATEMENTS: readonly string[] = [
  `CREATE TABLE categories (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL
  );`,
  `CREATE TABLE products (
    id TEXT PRIMARY KEY NOT NULL,
    category_id TEXT NOT NULL REFERENCES categories(id),
    name TEXT NOT NULL,
    sku TEXT UNIQUE,
    pricing_mode TEXT NOT NULL DEFAULT 'FIXED'
      CHECK (pricing_mode IN ('FIXED', 'BASE_PLUS_OPTIONS')),
    base_price_rupiah INTEGER NOT NULL DEFAULT 0 CHECK (base_price_rupiah >= 0),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    is_available INTEGER NOT NULL DEFAULT 1 CHECK (is_available IN (0,1)),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL
  );`,
  `CREATE TABLE option_groups (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    min_selected INTEGER NOT NULL DEFAULT 0 CHECK (min_selected >= 0),
    max_selected INTEGER CHECK (max_selected IS NULL OR max_selected >= 0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    CHECK (max_selected IS NULL OR max_selected >= min_selected)
  );`,
  `CREATE TABLE options (
    id TEXT PRIMARY KEY NOT NULL,
    group_id TEXT NOT NULL REFERENCES option_groups(id),
    name TEXT NOT NULL,
    unit_price_rupiah INTEGER NOT NULL CHECK (unit_price_rupiah >= 0),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    sort_order INTEGER NOT NULL DEFAULT 0
  );`,
  `CREATE TABLE product_option_groups (
    product_id TEXT NOT NULL REFERENCES products(id),
    group_id TEXT NOT NULL REFERENCES option_groups(id),
    PRIMARY KEY (product_id, group_id)
  );`,
  `CREATE TABLE daily_counters (
    business_date TEXT PRIMARY KEY NOT NULL,
    last_sequence INTEGER NOT NULL DEFAULT 0 CHECK (last_sequence >= 0)
  );`,
  `CREATE TABLE transactions (
    id TEXT PRIMARY KEY NOT NULL,
    receipt_number TEXT NOT NULL UNIQUE,
    daily_sequence INTEGER NOT NULL CHECK (daily_sequence > 0),
    occurred_at_ms INTEGER NOT NULL,
    business_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PAID' CHECK (status IN ('PAID','VOID')),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('CASH','QRIS')),
    subtotal_rupiah INTEGER NOT NULL CHECK (subtotal_rupiah >= 0),
    grand_total_rupiah INTEGER NOT NULL CHECK (grand_total_rupiah >= 0),
    paid_amount_rupiah INTEGER NOT NULL CHECK (paid_amount_rupiah >= 0),
    change_amount_rupiah INTEGER NOT NULL CHECK (change_amount_rupiah >= 0),
    void_reason TEXT,
    voided_at_ms INTEGER,
    created_at_ms INTEGER NOT NULL,
    UNIQUE (business_date, daily_sequence),
    CHECK ((status = 'PAID' AND void_reason IS NULL AND voided_at_ms IS NULL)
        OR (status = 'VOID' AND void_reason IS NOT NULL AND voided_at_ms IS NOT NULL)),
    CHECK (grand_total_rupiah = subtotal_rupiah),
    CHECK (paid_amount_rupiah >= grand_total_rupiah),
    CHECK (change_amount_rupiah = paid_amount_rupiah - grand_total_rupiah),
    CHECK (payment_method <> 'QRIS' OR change_amount_rupiah = 0)
  );`,
  `CREATE TABLE transaction_items (
    id TEXT PRIMARY KEY NOT NULL,
    transaction_id TEXT NOT NULL REFERENCES transactions(id),
    product_id TEXT REFERENCES products(id),
    product_name_snapshot TEXT NOT NULL,
    base_unit_price_rupiah INTEGER NOT NULL CHECK (base_unit_price_rupiah >= 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_total_rupiah INTEGER NOT NULL CHECK (unit_total_rupiah >= 0),
    line_total_rupiah INTEGER NOT NULL CHECK (line_total_rupiah >= 0),
    notes TEXT,
    CHECK (line_total_rupiah = unit_total_rupiah * quantity)
  );`,
  `CREATE TABLE transaction_item_options (
    id TEXT PRIMARY KEY NOT NULL,
    transaction_item_id TEXT NOT NULL REFERENCES transaction_items(id),
    option_id TEXT REFERENCES options(id),
    option_name_snapshot TEXT NOT NULL,
    unit_price_rupiah INTEGER NOT NULL CHECK (unit_price_rupiah >= 0),
    quantity_per_portion INTEGER NOT NULL CHECK (quantity_per_portion > 0)
  );`,
  `CREATE TABLE expenses (
    id TEXT PRIMARY KEY NOT NULL,
    occurred_at_ms INTEGER NOT NULL,
    business_date TEXT NOT NULL,
    category TEXT NOT NULL,
    amount_rupiah INTEGER NOT NULL CHECK (amount_rupiah > 0),
    notes TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','VOID')),
    void_reason TEXT,
    voided_at_ms INTEGER,
    created_at_ms INTEGER NOT NULL,
    CHECK ((status = 'ACTIVE' AND void_reason IS NULL AND voided_at_ms IS NULL)
        OR (status = 'VOID' AND void_reason IS NOT NULL AND voided_at_ms IS NOT NULL))
  );`,
  `CREATE TABLE print_attempts (
    id TEXT PRIMARY KEY NOT NULL,
    transaction_id TEXT NOT NULL REFERENCES transactions(id),
    attempted_at_ms INTEGER NOT NULL,
    result TEXT NOT NULL CHECK (result IN ('SENT_TO_DEVICE','FAILED','UNKNOWN')),
    error_message TEXT
  );`,
  `CREATE TABLE settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at_ms INTEGER NOT NULL
  );`,
  `CREATE INDEX idx_products_category ON products(category_id, is_active, is_available);`,
  `CREATE INDEX idx_tx_business_status ON transactions(business_date, status);`,
  `CREATE INDEX idx_tx_time ON transactions(occurred_at_ms);`,
  `CREATE INDEX idx_items_transaction ON transaction_items(transaction_id);`,
  `CREATE INDEX idx_options_item ON transaction_item_options(transaction_item_id);`,
  `CREATE INDEX idx_expenses_date_status ON expenses(business_date, status);`,
  `CREATE INDEX idx_print_tx ON print_attempts(transaction_id, attempted_at_ms);`,
];

export const MIGRATION_V1: SchemaMigration = {
  toVersion: 1,
  description: 'Skema relasional inti MamaMin POS v1 (12 tabel, 7 indeks)',
  statements: MIGRATION_V1_STATEMENTS,
};

export const ALL_SCHEMA_MIGRATIONS: readonly SchemaMigration[] = [MIGRATION_V1];

