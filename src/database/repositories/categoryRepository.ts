import type { Category } from '../../domain/types';
import type { DatabaseService } from '../sqlite';
import { DatabaseError, type SqlExecutor } from '../types';

interface CategoryRow extends Record<string, unknown> {
  readonly id: string;
  readonly name: string;
  readonly sort_order: number;
  readonly is_active: number;
  readonly created_at_ms: number;
  readonly updated_at_ms: number;
  readonly product_count?: number;
}

export interface CreateCategoryInput {
  readonly id?: string;
  readonly name: string;
  readonly sortOrder?: number;
  readonly isActive?: boolean;
  readonly nowMs?: number;
}

export interface UpdateCategoryInput {
  readonly name?: string;
  readonly sortOrder?: number;
  readonly isActive?: boolean;
  readonly nowMs?: number;
}

export class CategoryRepository {
  private readonly db: DatabaseService;

  constructor(db: DatabaseService) {
    this.db = db;
  }

  async list(includeInactive = false): Promise<readonly Category[]> {
    return this.listWithExecutor(this.db, includeInactive);
  }

  async listWithExecutor(
    executor: SqlExecutor,
    includeInactive = false,
  ): Promise<readonly Category[]> {
    const filterClause = includeInactive
      ? `WHERE c.id NOT LIKE 'diag_%'`
      : `WHERE c.id NOT LIKE 'diag_%' AND c.is_active = 1`;

    const rows = await executor.query<CategoryRow>(
      `SELECT
        c.id,
        c.name,
        c.sort_order,
        c.is_active,
        c.created_at_ms,
        c.updated_at_ms,
        COUNT(p.id) AS product_count
       FROM categories c
       LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1
       ${filterClause}
       GROUP BY c.id
       ORDER BY c.sort_order ASC, c.name ASC;`,
    );

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      sortOrder: Number(r.sort_order),
      isActive: Number(r.is_active) === 1,
      createdAtMs: Number(r.created_at_ms),
      updatedAtMs: Number(r.updated_at_ms),
      productCount: Number(r.product_count ?? 0),
    }));
  }

  async getById(
    id: string,
    executor: SqlExecutor = this.db,
  ): Promise<Category | null> {
    const rows = await executor.query<CategoryRow>(
      `SELECT
        c.id,
        c.name,
        c.sort_order,
        c.is_active,
        c.created_at_ms,
        c.updated_at_ms,
        COUNT(p.id) AS product_count
       FROM categories c
       LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1
       WHERE c.id = ?
       GROUP BY c.id;`,
      [id],
    );

    const first = rows[0];
    if (!first) {
      return null;
    }

    return {
      id: first.id,
      name: first.name,
      sortOrder: Number(first.sort_order),
      isActive: Number(first.is_active) === 1,
      createdAtMs: Number(first.created_at_ms),
      updatedAtMs: Number(first.updated_at_ms),
      productCount: Number(first.product_count ?? 0),
    };
  }

  async create(
    input: CreateCategoryInput,
    executor: SqlExecutor = this.db,
  ): Promise<Category> {
    const trimmedName = input.name.trim();
    if (!trimmedName) {
      throw new RangeError('Nama kategori wajib diisi.');
    }

    const id = input.id ?? `cat_${String(Date.now())}_${Math.random().toString(36).slice(2, 7)}`;
    const sortOrder = input.sortOrder ?? 0;
    const isActive = input.isActive !== false ? 1 : 0;
    const nowMs = input.nowMs ?? Date.now();

    await executor.run(
      `INSERT INTO categories (id, name, sort_order, is_active, created_at_ms, updated_at_ms)
       VALUES (?, ?, ?, ?, ?, ?);`,
      [id, trimmedName, sortOrder, isActive, nowMs, nowMs],
    );

    const saved = await this.getById(id, executor);
    if (!saved) {
      throw new DatabaseError(
        'DB_QUERY_FAILED',
        'Gagal memuat kategori setelah disimpan.',
      );
    }
    return saved;
  }

  async update(
    id: string,
    input: UpdateCategoryInput,
    executor: SqlExecutor = this.db,
  ): Promise<Category> {
    const existing = await this.getById(id, executor);
    if (!existing) {
      throw new DatabaseError(
        'DB_QUERY_FAILED',
        `Kategori dengan id "${id}" tidak ditemukan.`,
      );
    }

    const nextName = input.name !== undefined ? input.name.trim() : existing.name;
    if (!nextName) {
      throw new RangeError('Nama kategori tidak boleh kosong.');
    }

    const nextSortOrder = input.sortOrder ?? existing.sortOrder;
    const nextIsActive =
      input.isActive !== undefined ? (input.isActive ? 1 : 0) : (existing.isActive ? 1 : 0);
    const nowMs = input.nowMs ?? Date.now();

    await executor.run(
      `UPDATE categories
       SET name = ?, sort_order = ?, is_active = ?, updated_at_ms = ?
       WHERE id = ?;`,
      [nextName, nextSortOrder, nextIsActive, nowMs, id],
    );

    const updated = await this.getById(id, executor);
    if (!updated) {
      throw new DatabaseError('DB_QUERY_FAILED', 'Gagal memuat kategori setelah diperbarui.');
    }
    return updated;
  }

  async deleteOrDeactivate(
    id: string,
    executor: SqlExecutor = this.db,
  ): Promise<{
    readonly action: 'DELETED' | 'DEACTIVATED';
    readonly message: string;
    readonly category: Category | null;
  }> {
    const existing = await this.getById(id, executor);
    if (!existing) {
      return {
        action: 'DELETED',
        message: 'Kategori tidak ditemukan.',
        category: null,
      };
    }

    const countRows = await executor.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM products WHERE category_id = ?;',
      [id],
    );
    const productCount = Number(countRows[0]?.count ?? 0);

    if (productCount > 0) {
      // Ada produk yang merujuk kategori ini: nonaktifkan (soft delete) agar FK dan historis aman
      await executor.run(
        'UPDATE categories SET is_active = 0, updated_at_ms = ? WHERE id = ?;',
        [Date.now(), id],
      );
      const updated = await this.getById(id, executor);
      return {
        action: 'DEACTIVATED',
        message: `Kategori dinonaktifkan karena masih terdapat ${String(productCount)} produk terkait.`,
        category: updated,
      };
    }

    // Tidak ada produk yang merujuk: aman dihapus fisik
    await executor.run('DELETE FROM categories WHERE id = ?;', [id]);
    return {
      action: 'DELETED',
      message: 'Kategori berhasil dihapus.',
      category: null,
    };
  }
}
