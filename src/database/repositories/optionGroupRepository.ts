import {
  assertNonNegativeIntegerRupiah,
} from '../../domain/money';
import type { OptionGroup, ProductOption } from '../../domain/types';
import type { DatabaseService } from '../sqlite';
import { DatabaseError, type SqlExecutor } from '../types';

interface OptionGroupRow extends Record<string, unknown> {
  readonly id: string;
  readonly name: string;
  readonly min_selected: number;
  readonly max_selected: number | null;
  readonly sort_order: number;
  readonly is_active: number;
}

interface OptionRow extends Record<string, unknown> {
  readonly id: string;
  readonly group_id: string;
  readonly name: string;
  readonly unit_price_rupiah: number;
  readonly is_active: number;
  readonly sort_order: number;
}

export interface CreateOptionItemInput {
  readonly id?: string;
  readonly name: string;
  readonly unitPriceRupiah: number;
  readonly sortOrder?: number;
  readonly isActive?: boolean;
}

export interface CreateOptionGroupInput {
  readonly id?: string;
  readonly name: string;
  readonly minSelected?: number;
  readonly maxSelected?: number | null;
  readonly sortOrder?: number;
  readonly isActive?: boolean;
  readonly options?: readonly CreateOptionItemInput[];
}

export interface UpdateOptionGroupInput {
  readonly name?: string;
  readonly minSelected?: number;
  readonly maxSelected?: number | null;
  readonly sortOrder?: number;
  readonly isActive?: boolean;
}

export interface UpdateOptionItemInput {
  readonly name?: string;
  readonly unitPriceRupiah?: number;
  readonly sortOrder?: number;
  readonly isActive?: boolean;
}

export class OptionGroupRepository {
  private readonly db: DatabaseService;

  constructor(db: DatabaseService) {
    this.db = db;
  }

  async list(includeInactive = false): Promise<readonly OptionGroup[]> {
    return this.listWithExecutor(this.db, includeInactive);
  }

  async listWithExecutor(
    executor: SqlExecutor,
    includeInactive = false,
  ): Promise<readonly OptionGroup[]> {
    const groupFilter = includeInactive
      ? `WHERE id NOT LIKE 'diag_%'`
      : `WHERE id NOT LIKE 'diag_%' AND is_active = 1`;

    const groupRows = await executor.query<OptionGroupRow>(
      `SELECT id, name, min_selected, max_selected, sort_order, is_active
       FROM option_groups
       ${groupFilter}
       ORDER BY sort_order ASC, name ASC;`,
    );

    const optionFilter = includeInactive
      ? `WHERE id NOT LIKE 'diag_%'`
      : `WHERE id NOT LIKE 'diag_%' AND is_active = 1`;

    const optionRows = await executor.query<OptionRow>(
      `SELECT id, group_id, name, unit_price_rupiah, is_active, sort_order
       FROM options
       ${optionFilter}
       ORDER BY sort_order ASC, name ASC;`,
    );

    const optionsByGroup = new Map<string, ProductOption[]>();
    for (const opt of optionRows) {
      const list = optionsByGroup.get(opt.group_id) ?? [];
      list.push({
        id: opt.id,
        groupId: opt.group_id,
        name: opt.name,
        unitPriceRupiah: Number(opt.unit_price_rupiah),
        isActive: Number(opt.is_active) === 1,
        sortOrder: Number(opt.sort_order),
      });
      optionsByGroup.set(opt.group_id, list);
    }

    return groupRows.map((g) => ({
      id: g.id,
      name: g.name,
      minSelected: Number(g.min_selected),
      maxSelected: g.max_selected !== null ? Number(g.max_selected) : null,
      sortOrder: Number(g.sort_order),
      isActive: Number(g.is_active) === 1,
      options: optionsByGroup.get(g.id) ?? [],
    }));
  }

  async getById(
    id: string,
    executor: SqlExecutor = this.db,
  ): Promise<OptionGroup | null> {
    const rows = await executor.query<OptionGroupRow>(
      `SELECT id, name, min_selected, max_selected, sort_order, is_active
       FROM option_groups
       WHERE id = ?;`,
      [id],
    );

    const group = rows[0];
    if (!group) {
      return null;
    }

    const optionRows = await executor.query<OptionRow>(
      `SELECT id, group_id, name, unit_price_rupiah, is_active, sort_order
       FROM options
       WHERE group_id = ?
       ORDER BY sort_order ASC, name ASC;`,
      [id],
    );

    return {
      id: group.id,
      name: group.name,
      minSelected: Number(group.min_selected),
      maxSelected:
        group.max_selected !== null ? Number(group.max_selected) : null,
      sortOrder: Number(group.sort_order),
      isActive: Number(group.is_active) === 1,
      options: optionRows.map((o) => ({
        id: o.id,
        groupId: o.group_id,
        name: o.name,
        unitPriceRupiah: Number(o.unit_price_rupiah),
        isActive: Number(o.is_active) === 1,
        sortOrder: Number(o.sort_order),
      })),
    };
  }

  async getGroupsForProduct(
    productId: string,
    includeInactive = false,
    executor: SqlExecutor = this.db,
  ): Promise<readonly OptionGroup[]> {
    const groupFilter = includeInactive
      ? `WHERE pog.product_id = ? AND og.id NOT LIKE 'diag_%'`
      : `WHERE pog.product_id = ? AND og.id NOT LIKE 'diag_%' AND og.is_active = 1`;

    const groupRows = await executor.query<OptionGroupRow>(
      `SELECT og.id, og.name, og.min_selected, og.max_selected, og.sort_order, og.is_active
       FROM option_groups og
       JOIN product_option_groups pog ON pog.group_id = og.id
       ${groupFilter}
       ORDER BY og.sort_order ASC, og.name ASC;`,
      [productId],
    );

    if (groupRows.length === 0) {
      return [];
    }

    const groupIds = groupRows.map((g) => g.id);
    const placeholders = groupIds.map(() => '?').join(',');
    const optionFilter = includeInactive
      ? `WHERE group_id IN (${placeholders}) AND id NOT LIKE 'diag_%'`
      : `WHERE group_id IN (${placeholders}) AND id NOT LIKE 'diag_%' AND is_active = 1`;

    const optionRows = await executor.query<OptionRow>(
      `SELECT id, group_id, name, unit_price_rupiah, is_active, sort_order
       FROM options
       ${optionFilter}
       ORDER BY sort_order ASC, name ASC;`,
      groupIds,
    );

    const optionsByGroup = new Map<string, ProductOption[]>();
    for (const opt of optionRows) {
      const list = optionsByGroup.get(opt.group_id) ?? [];
      list.push({
        id: opt.id,
        groupId: opt.group_id,
        name: opt.name,
        unitPriceRupiah: Number(opt.unit_price_rupiah),
        isActive: Number(opt.is_active) === 1,
        sortOrder: Number(opt.sort_order),
      });
      optionsByGroup.set(opt.group_id, list);
    }

    return groupRows.map((g) => ({
      id: g.id,
      name: g.name,
      minSelected: Number(g.min_selected),
      maxSelected: g.max_selected !== null ? Number(g.max_selected) : null,
      sortOrder: Number(g.sort_order),
      isActive: Number(g.is_active) === 1,
      options: optionsByGroup.get(g.id) ?? [],
    }));
  }

  async create(
    input: CreateOptionGroupInput,
    executor?: SqlExecutor,
  ): Promise<OptionGroup> {
    const trimmedName = input.name.trim();
    if (!trimmedName) {
      throw new RangeError('Nama grup opsi wajib diisi.');
    }

    const minSelected = Math.max(0, input.minSelected ?? 0);
    const maxSelected =
      input.maxSelected !== undefined && input.maxSelected !== null
        ? Math.max(0, input.maxSelected)
        : null;

    if (maxSelected !== null && maxSelected < minSelected) {
      throw new RangeError(
        `maxSelected (${String(maxSelected)}) tidak boleh lebih kecil dari minSelected (${String(minSelected)}).`,
      );
    }

    if (executor) {
      return this.createInternal(input, executor);
    }
    return this.db.withTransaction(async (tx) => this.createInternal(input, tx));
  }

  private async createInternal(
    input: CreateOptionGroupInput,
    executor: SqlExecutor,
  ): Promise<OptionGroup> {
    const trimmedName = input.name.trim();
    const minSelected = Math.max(0, input.minSelected ?? 0);
    const maxSelected =
      input.maxSelected !== undefined && input.maxSelected !== null
        ? Math.max(0, input.maxSelected)
        : null;

    const id = input.id ?? `grp_${String(Date.now())}_${Math.random().toString(36).slice(2, 7)}`;
    const sortOrder = input.sortOrder ?? 0;
    const isActive = input.isActive !== false ? 1 : 0;

    await executor.run(
      `INSERT INTO option_groups (id, name, min_selected, max_selected, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?);`,
      [id, trimmedName, minSelected, maxSelected, sortOrder, isActive],
    );

    if (input.options && input.options.length > 0) {
      for (const opt of input.options) {
        const optName = opt.name.trim();
        if (!optName) continue;
        assertNonNegativeIntegerRupiah(opt.unitPriceRupiah, 'option.unitPriceRupiah');
        const optId = opt.id ?? `opt_${String(Date.now())}_${Math.random().toString(36).slice(2, 7)}`;
        const optSort = opt.sortOrder ?? 0;
        const optActive = opt.isActive !== false ? 1 : 0;

        await executor.run(
          `INSERT INTO options (id, group_id, name, unit_price_rupiah, is_active, sort_order)
           VALUES (?, ?, ?, ?, ?, ?);`,
          [optId, id, optName, opt.unitPriceRupiah, optActive, optSort],
        );
      }
    }

    const saved = await this.getById(id, executor);
    if (!saved) {
      throw new DatabaseError(
        'DB_QUERY_FAILED',
        'Gagal memuat grup opsi setelah dibuat.',
      );
    }
    return saved;
  }

  async update(
    id: string,
    input: UpdateOptionGroupInput,
    executor: SqlExecutor = this.db,
  ): Promise<OptionGroup> {
    const existing = await this.getById(id, executor);
    if (!existing) {
      throw new DatabaseError(
        'DB_QUERY_FAILED',
        `Grup opsi "${id}" tidak ditemukan.`,
      );
    }

    const nextName = input.name !== undefined ? input.name.trim() : existing.name;
    if (!nextName) {
      throw new RangeError('Nama grup opsi tidak boleh kosong.');
    }

    const nextMin =
      input.minSelected !== undefined
        ? Math.max(0, input.minSelected)
        : existing.minSelected;
    const nextMax =
      input.maxSelected !== undefined
        ? input.maxSelected !== null
          ? Math.max(0, input.maxSelected)
          : null
        : existing.maxSelected;

    if (nextMax !== null && nextMax < nextMin) {
      throw new RangeError(
        `maxSelected (${String(nextMax)}) tidak boleh lebih kecil dari minSelected (${String(nextMin)}).`,
      );
    }

    const nextSort = input.sortOrder ?? existing.sortOrder;
    const nextActive =
      input.isActive !== undefined
        ? input.isActive
          ? 1
          : 0
        : existing.isActive
          ? 1
          : 0;

    await executor.run(
      `UPDATE option_groups
       SET name = ?, min_selected = ?, max_selected = ?, sort_order = ?, is_active = ?
       WHERE id = ?;`,
      [nextName, nextMin, nextMax, nextSort, nextActive, id],
    );

    const saved = await this.getById(id, executor);
    if (!saved) {
      throw new DatabaseError(
        'DB_QUERY_FAILED',
        'Gagal memuat grup opsi setelah diperbarui.',
      );
    }
    return saved;
  }

  async addOption(
    groupId: string,
    input: CreateOptionItemInput,
    executor: SqlExecutor = this.db,
  ): Promise<ProductOption> {
    const group = await this.getById(groupId, executor);
    if (!group) {
      throw new DatabaseError(
        'DB_QUERY_FAILED',
        `Grup opsi "${groupId}" tidak ditemukan.`,
      );
    }

    const trimmedName = input.name.trim();
    if (!trimmedName) {
      throw new RangeError('Nama opsi wajib diisi.');
    }
    assertNonNegativeIntegerRupiah(input.unitPriceRupiah, 'unitPriceRupiah');

    const id = input.id ?? `opt_${String(Date.now())}_${Math.random().toString(36).slice(2, 7)}`;
    const sortOrder = input.sortOrder ?? group.options.length + 1;
    const isActive = input.isActive !== false ? 1 : 0;

    await executor.run(
      `INSERT INTO options (id, group_id, name, unit_price_rupiah, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?);`,
      [id, groupId, trimmedName, input.unitPriceRupiah, isActive, sortOrder],
    );

    const rows = await executor.query<OptionRow>(
      'SELECT id, group_id, name, unit_price_rupiah, is_active, sort_order FROM options WHERE id = ?;',
      [id],
    );
    const row = rows[0];
    if (!row) {
      throw new DatabaseError('DB_QUERY_FAILED', 'Gagal memuat opsi baru.');
    }

    return {
      id: row.id,
      groupId: row.group_id,
      name: row.name,
      unitPriceRupiah: Number(row.unit_price_rupiah),
      isActive: Number(row.is_active) === 1,
      sortOrder: Number(row.sort_order),
    };
  }

  async updateOption(
    optionId: string,
    input: UpdateOptionItemInput,
    executor: SqlExecutor = this.db,
  ): Promise<ProductOption> {
    const rows = await executor.query<OptionRow>(
      'SELECT id, group_id, name, unit_price_rupiah, is_active, sort_order FROM options WHERE id = ?;',
      [optionId],
    );
    const existing = rows[0];
    if (!existing) {
      throw new DatabaseError(
        'DB_QUERY_FAILED',
        `Opsi dengan id "${optionId}" tidak ditemukan.`,
      );
    }

    const nextName = input.name !== undefined ? input.name.trim() : existing.name;
    if (!nextName) {
      throw new RangeError('Nama opsi tidak boleh kosong.');
    }

    let nextPrice = Number(existing.unit_price_rupiah);
    if (input.unitPriceRupiah !== undefined) {
      assertNonNegativeIntegerRupiah(input.unitPriceRupiah, 'unitPriceRupiah');
      nextPrice = input.unitPriceRupiah;
    }

    const nextSort = input.sortOrder ?? Number(existing.sort_order);
    const nextActive =
      input.isActive !== undefined
        ? input.isActive
          ? 1
          : 0
        : Number(existing.is_active);

    await executor.run(
      `UPDATE options
       SET name = ?, unit_price_rupiah = ?, sort_order = ?, is_active = ?
       WHERE id = ?;`,
      [nextName, nextPrice, nextSort, nextActive, optionId],
    );

    return {
      id: existing.id,
      groupId: existing.group_id,
      name: nextName,
      unitPriceRupiah: nextPrice,
      isActive: nextActive === 1,
      sortOrder: nextSort,
    };
  }

  /**
   * Menghapus atau me-nonaktifkan opsi.
   * Jika opsi sudah pernah digunakan dalam riwayat transaksi (transaction_item_options),
   * lakukan soft-deactivation (is_active = 0) agar audit trail penjualan tidak rusak.
   */
  async deleteOrDeactivateOption(
    optionId: string,
    executor: SqlExecutor = this.db,
  ): Promise<{ action: 'DELETED' | 'DEACTIVATED' }> {
    const usageRows = await executor.query<{ count: number }>(
      'SELECT COUNT(*) AS count FROM transaction_item_options WHERE option_id = ?;',
      [optionId],
    );
    const usedInSales = Number(usageRows[0]?.count ?? 0) > 0;

    if (usedInSales) {
      await executor.run('UPDATE options SET is_active = 0 WHERE id = ?;', [optionId]);
      return { action: 'DEACTIVATED' };
    }

    await executor.run('DELETE FROM options WHERE id = ?;', [optionId]);
    return { action: 'DELETED' };
  }

  /**
   * Menghapus atau me-nonaktifkan seluruh grup opsi.
   */
  async deleteOrDeactivateGroup(
    groupId: string,
    executor?: SqlExecutor,
  ): Promise<{ action: 'DELETED' | 'DEACTIVATED' }> {
    if (executor) {
      return this.deleteOrDeactivateGroupInternal(groupId, executor);
    }
    return this.db.withTransaction(async (tx) =>
      this.deleteOrDeactivateGroupInternal(groupId, tx),
    );
  }

  private async deleteOrDeactivateGroupInternal(
    groupId: string,
    executor: SqlExecutor,
  ): Promise<{ action: 'DELETED' | 'DEACTIVATED' }> {
    const usageRows = await executor.query<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM transaction_item_options tim
       JOIN options o ON o.id = tim.option_id
       WHERE o.group_id = ?;`,
      [groupId],
    );
    const usedInSales = Number(usageRows[0]?.count ?? 0) > 0;

    if (usedInSales) {
      await executor.run('UPDATE option_groups SET is_active = 0 WHERE id = ?;', [groupId]);
      await executor.run('UPDATE options SET is_active = 0 WHERE group_id = ?;', [groupId]);
      return { action: 'DEACTIVATED' };
    }

    await executor.run('DELETE FROM product_option_groups WHERE group_id = ?;', [groupId]);
    await executor.run('DELETE FROM options WHERE group_id = ?;', [groupId]);
    await executor.run('DELETE FROM option_groups WHERE id = ?;', [groupId]);
    return { action: 'DELETED' };
  }
}
