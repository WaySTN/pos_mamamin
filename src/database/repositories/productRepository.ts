import { assertNonNegativeIntegerRupiah } from '../../domain/money';
import type {
  PricingMode,
  Product,
  ProductWithDetails,
} from '../../domain/types';
import type { DatabaseService } from '../sqlite';
import { DatabaseError, type SqlExecutor, type SqlValue } from '../types';
import { OptionGroupRepository } from './optionGroupRepository';

interface ProductRow extends Record<string, unknown> {
  readonly id: string;
  readonly category_id: string;
  readonly category_name: string;
  readonly name: string;
  readonly sku: string | null;
  readonly pricing_mode: PricingMode;
  readonly base_price_rupiah: number;
  readonly is_active: number;
  readonly is_available: number;
  readonly sort_order: number;
  readonly created_at_ms: number;
  readonly updated_at_ms: number;
}

export interface ListProductsFilter {
  readonly categoryId?: string;
  readonly includeInactive?: boolean;
  readonly includeUnavailable?: boolean;
  readonly searchQuery?: string;
}

export interface CreateProductInput {
  readonly id?: string;
  readonly categoryId: string;
  readonly name: string;
  readonly sku?: string | null;
  readonly pricingMode?: PricingMode;
  readonly basePriceRupiah: number;
  readonly isActive?: boolean;
  readonly isAvailable?: boolean;
  readonly sortOrder?: number;
  readonly optionGroupIds?: readonly string[];
  readonly nowMs?: number;
}

export interface UpdateProductInput {
  readonly categoryId?: string;
  readonly name?: string;
  readonly sku?: string | null;
  readonly pricingMode?: PricingMode;
  readonly basePriceRupiah?: number;
  readonly isActive?: boolean;
  readonly isAvailable?: boolean;
  readonly sortOrder?: number;
  readonly optionGroupIds?: readonly string[];
  readonly nowMs?: number;
}

export class ProductRepository {
  private readonly db: DatabaseService;
  private readonly optionGroupRepo: OptionGroupRepository;

  constructor(db: DatabaseService) {
    this.db = db;
    this.optionGroupRepo = new OptionGroupRepository(db);
  }

  async list(filter: ListProductsFilter = {}): Promise<readonly ProductWithDetails[]> {
    return this.listWithExecutor(this.db, filter);
  }

  async listWithExecutor(
    executor: SqlExecutor,
    filter: ListProductsFilter = {},
  ): Promise<readonly ProductWithDetails[]> {
    const conditions: string[] = ["p.id NOT LIKE 'diag_%'"];
    const params: SqlValue[] = [];

    if (!filter.includeInactive) {
      conditions.push('p.is_active = 1', 'c.is_active = 1');
    }

    if (!filter.includeUnavailable) {
      conditions.push('p.is_available = 1');
    }

    if (filter.categoryId && filter.categoryId !== 'ALL') {
      conditions.push('p.category_id = ?');
      params.push(filter.categoryId);
    }

    if (filter.searchQuery?.trim()) {
      const q = `%${filter.searchQuery.trim().toLowerCase()}%`;
      conditions.push('(LOWER(p.name) LIKE ? OR LOWER(COALESCE(p.sku, \'\')) LIKE ?)');
      params.push(q, q);
    }

    const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await executor.query<ProductRow>(
      `SELECT
        p.id,
        p.category_id,
        c.name AS category_name,
        p.name,
        p.sku,
        p.pricing_mode,
        p.base_price_rupiah,
        p.is_active,
        p.is_available,
        p.sort_order,
        p.created_at_ms,
        p.updated_at_ms
       FROM products p
       JOIN categories c ON c.id = p.category_id
       ${whereSql}
       ORDER BY p.sort_order ASC, p.name ASC;`,
      params,
    );

    const results: ProductWithDetails[] = [];
    for (const r of rows) {
      const optionGroups = await this.optionGroupRepo.getGroupsForProduct(
        r.id,
        filter.includeInactive ?? false,
        executor,
      );
      results.push({
        id: r.id,
        categoryId: r.category_id,
        categoryName: r.category_name,
        name: r.name,
        sku: r.sku,
        pricingMode: r.pricing_mode,
        basePriceRupiah: Number(r.base_price_rupiah),
        isActive: Number(r.is_active) === 1,
        isAvailable: Number(r.is_available) === 1,
        sortOrder: Number(r.sort_order),
        createdAtMs: Number(r.created_at_ms),
        updatedAtMs: Number(r.updated_at_ms),
        optionGroups,
      });
    }

    return results;
  }

  async getById(
    id: string,
    executor: SqlExecutor = this.db,
  ): Promise<ProductWithDetails | null> {
    const rows = await executor.query<ProductRow>(
      `SELECT
        p.id,
        p.category_id,
        c.name AS category_name,
        p.name,
        p.sku,
        p.pricing_mode,
        p.base_price_rupiah,
        p.is_active,
        p.is_available,
        p.sort_order,
        p.created_at_ms,
        p.updated_at_ms
       FROM products p
       JOIN categories c ON c.id = p.category_id
       WHERE p.id = ?;`,
      [id],
    );

    const first = rows[0];
    if (!first) {
      return null;
    }

    const optionGroups = await this.optionGroupRepo.getGroupsForProduct(
      id,
      true,
      executor,
    );

    return {
      id: first.id,
      categoryId: first.category_id,
      categoryName: first.category_name,
      name: first.name,
      sku: first.sku,
      pricingMode: first.pricing_mode,
      basePriceRupiah: Number(first.base_price_rupiah),
      isActive: Number(first.is_active) === 1,
      isAvailable: Number(first.is_available) === 1,
      sortOrder: Number(first.sort_order),
      createdAtMs: Number(first.created_at_ms),
      updatedAtMs: Number(first.updated_at_ms),
      optionGroups,
    };
  }

  async create(
    input: CreateProductInput,
    executor?: SqlExecutor,
  ): Promise<ProductWithDetails> {
    const trimmedName = input.name.trim();
    if (!trimmedName) {
      throw new RangeError('Nama produk wajib diisi.');
    }
    if (!input.categoryId) {
      throw new RangeError('Kategori produk wajib dipilih.');
    }
    assertNonNegativeIntegerRupiah(input.basePriceRupiah, 'basePriceRupiah');

    if (executor) {
      return this.createInternal(input, executor);
    }
    return this.db.withTransaction(async (tx) => this.createInternal(input, tx));
  }

  private async createInternal(
    input: CreateProductInput,
    executor: SqlExecutor,
  ): Promise<ProductWithDetails> {
    const trimmedName = input.name.trim();
    const id = input.id ?? `prod_${String(Date.now())}_${Math.random().toString(36).slice(2, 7)}`;
    const sku = input.sku?.trim() ? input.sku.trim() : null;
    const pricingMode: PricingMode = input.pricingMode ?? 'FIXED';
    const isActive = input.isActive !== false ? 1 : 0;
    const isAvailable = input.isAvailable !== false ? 1 : 0;
    const sortOrder = input.sortOrder ?? 0;
    const nowMs = input.nowMs ?? Date.now();

    await executor.run(
      `INSERT INTO products (
        id, category_id, name, sku, pricing_mode, base_price_rupiah,
        is_active, is_available, sort_order, created_at_ms, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        id,
        input.categoryId,
        trimmedName,
        sku,
        pricingMode,
        input.basePriceRupiah,
        isActive,
        isAvailable,
        sortOrder,
        nowMs,
        nowMs,
      ],
    );

    if (input.optionGroupIds && input.optionGroupIds.length > 0) {
      for (const grpId of input.optionGroupIds) {
        await executor.run(
          `INSERT INTO product_option_groups (product_id, group_id)
           VALUES (?, ?)
           ON CONFLICT(product_id, group_id) DO NOTHING;`,
          [id, grpId],
        );
      }
    }

    const saved = await this.getById(id, executor);
    if (!saved) {
      throw new DatabaseError('DB_QUERY_FAILED', 'Gagal memuat produk setelah disimpan.');
    }
    return saved;
  }

  async update(
    id: string,
    input: UpdateProductInput,
    executor?: SqlExecutor,
  ): Promise<ProductWithDetails> {
    if (executor) {
      return this.updateInternal(id, input, executor);
    }
    return this.db.withTransaction(async (tx) => this.updateInternal(id, input, tx));
  }

  private async updateInternal(
    id: string,
    input: UpdateProductInput,
    executor: SqlExecutor,
  ): Promise<ProductWithDetails> {
    const existing = await this.getById(id, executor);
    if (!existing) {
      throw new DatabaseError('DB_QUERY_FAILED', `Produk "${id}" tidak ditemukan.`);
    }

    const nextName = input.name !== undefined ? input.name.trim() : existing.name;
    if (!nextName) {
      throw new RangeError('Nama produk tidak boleh kosong.');
    }

    const nextCategoryId = input.categoryId ?? existing.categoryId;
    const nextSku =
      input.sku !== undefined ? (input.sku?.trim() ? input.sku.trim() : null) : existing.sku;
    const nextPricingMode = input.pricingMode ?? existing.pricingMode;

    let nextBasePrice = existing.basePriceRupiah;
    if (input.basePriceRupiah !== undefined) {
      assertNonNegativeIntegerRupiah(input.basePriceRupiah, 'basePriceRupiah');
      nextBasePrice = input.basePriceRupiah;
    }

    const nextIsActive =
      input.isActive !== undefined ? (input.isActive ? 1 : 0) : (existing.isActive ? 1 : 0);
    const nextIsAvailable =
      input.isAvailable !== undefined
        ? input.isAvailable
          ? 1
          : 0
        : (existing.isAvailable ? 1 : 0);
    const nextSortOrder = input.sortOrder ?? existing.sortOrder;
    const nowMs = input.nowMs ?? Date.now();

    await executor.run(
      `UPDATE products
       SET category_id = ?, name = ?, sku = ?, pricing_mode = ?,
           base_price_rupiah = ?, is_active = ?, is_available = ?,
           sort_order = ?, updated_at_ms = ?
       WHERE id = ?;`,
      [
        nextCategoryId,
        nextName,
        nextSku,
        nextPricingMode,
        nextBasePrice,
        nextIsActive,
        nextIsAvailable,
        nextSortOrder,
        nowMs,
        id,
      ],
    );

    if (input.optionGroupIds !== undefined) {
      await executor.run('DELETE FROM product_option_groups WHERE product_id = ?;', [id]);
      for (const grpId of input.optionGroupIds) {
        await executor.run(
          `INSERT INTO product_option_groups (product_id, group_id)
           VALUES (?, ?)
           ON CONFLICT(product_id, group_id) DO NOTHING;`,
          [id, grpId],
        );
      }
    }

    const saved = await this.getById(id, executor);
    if (!saved) {
      throw new DatabaseError('DB_QUERY_FAILED', 'Gagal memuat produk setelah diperbarui.');
    }
    return saved;
  }

  async toggleAvailability(
    id: string,
    isAvailable?: boolean,
    executor: SqlExecutor = this.db,
  ): Promise<Product> {
    const existing = await this.getById(id, executor);
    if (!existing) {
      throw new DatabaseError('DB_QUERY_FAILED', `Produk "${id}" tidak ditemukan.`);
    }

    const nextStatus = isAvailable !== undefined ? (isAvailable ? 1 : 0) : (existing.isAvailable ? 0 : 1);
    await executor.run(
      'UPDATE products SET is_available = ?, updated_at_ms = ? WHERE id = ?;',
      [nextStatus, Date.now(), id],
    );

    return {
      ...existing,
      isAvailable: nextStatus === 1,
      updatedAtMs: Date.now(),
    };
  }

  /**
   * Menghapus atau me-nonaktifkan produk.
   * - Jika produk pernah terjual (tercatat di transaction_items):
   *   lakukan soft deactivation (is_active = 0) agar audit penjualan & riwayat transaksi aman.
   * - Jika produk belum pernah terjual: hard-delete dan hapus relasi grup opsi.
   */
  async deleteOrDeactivate(
    id: string,
    executor?: SqlExecutor,
  ): Promise<{
    readonly action: 'DELETED' | 'DEACTIVATED';
    readonly message: string;
    readonly product: ProductWithDetails | null;
  }> {
    if (executor) {
      return this.deleteOrDeactivateInternal(id, executor);
    }
    return this.db.withTransaction(async (tx) => this.deleteOrDeactivateInternal(id, tx));
  }

  private async deleteOrDeactivateInternal(
    id: string,
    executor: SqlExecutor,
  ): Promise<{
    readonly action: 'DELETED' | 'DEACTIVATED';
    readonly message: string;
    readonly product: ProductWithDetails | null;
  }> {
    const existing = await this.getById(id, executor);
    if (!existing) {
      return {
        action: 'DELETED',
        message: 'Produk tidak ditemukan.',
        product: null,
      };
    }

    const salesRows = await executor.query<{ count: number }>(
      'SELECT COUNT(*) AS count FROM transaction_items WHERE product_id = ?;',
      [id],
    );
    const hasSalesHistory = Number(salesRows[0]?.count ?? 0) > 0;

    if (hasSalesHistory) {
      await executor.run(
        'UPDATE products SET is_active = 0, is_available = 0, updated_at_ms = ? WHERE id = ?;',
        [Date.now(), id],
      );
      const updated = await this.getById(id, executor);
      return {
        action: 'DEACTIVATED',
        message: 'Produk dinonaktifkan (disembunyikan dari kasir) karena telah tercatat dalam riwayat penjualan.',
        product: updated,
      };
    }

    await executor.run('DELETE FROM product_option_groups WHERE product_id = ?;', [id]);
    await executor.run('DELETE FROM products WHERE id = ?;', [id]);
    return {
      action: 'DELETED',
      message: 'Produk berhasil dihapus.',
      product: null,
    };
  }
}
