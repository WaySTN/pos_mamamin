import { afterEach, describe, expect, it } from 'vitest';
import {
  CategoryRepository,
} from '../../src/database/repositories/categoryRepository';
import {
  OptionGroupRepository,
} from '../../src/database/repositories/optionGroupRepository';
import {
  ProductRepository,
} from '../../src/database/repositories/productRepository';
import {
  seedStarterCategoriesIfEmpty,
} from '../../src/database/repositories/catalogTemplate';
import {
  TransactionRepository,
} from '../../src/database/repositories/transactionRepository';
import {
  DatabaseService,
} from '../../src/database/sqlite';
import { NodeSqliteTestDriver } from '../helpers/nodeSqliteTestDriver';

describe('Catalog Repositories (Category, OptionGroup, Product, Template)', () => {
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

  describe('CategoryRepository', () => {
    it('creates, lists, updates, and fetches categories', async () => {
      const db = createMemoryDb();
      await db.initialize();
      const repo = new CategoryRepository(db);

      const cat1 = await repo.create({ name: 'Makanan', sortOrder: 1 });
      const cat2 = await repo.create({ name: 'Minuman', sortOrder: 2 });

      expect(cat1.id).toBeDefined();
      expect(cat1.name).toBe('Makanan');
      expect(cat1.isActive).toBe(true);
      expect(cat2.name).toBe('Minuman');

      const list = await repo.list();
      expect(list.length).toBe(2);
      expect(list[0]?.name).toBe('Makanan');
      expect(list[1]?.name).toBe('Minuman');

      const byId = await repo.getById(cat1.id);
      expect(byId?.id).toBe(cat1.id);

      const updated = await repo.update(cat1.id, { name: 'Makanan Berat', sortOrder: 10 });
      expect(updated.name).toBe('Makanan Berat');
      expect(updated.sortOrder).toBe(10);
    });

    it('rejects empty or blank category names', async () => {
      const db = createMemoryDb();
      await db.initialize();
      const repo = new CategoryRepository(db);

      await expect(repo.create({ name: '   ' })).rejects.toThrow(
        /Nama kategori/,
      );
    });

    it('hard-deletes category if no products attached, but soft-deactivates if products exist', async () => {
      const db = createMemoryDb();
      await db.initialize();
      const catRepo = new CategoryRepository(db);
      const prodRepo = new ProductRepository(db);

      const catA = await catRepo.create({ name: 'Kategori Kosong' });
      const delA = await catRepo.deleteOrDeactivate(catA.id);
      expect(delA.action).toBe('DELETED');
      expect(await catRepo.getById(catA.id)).toBeNull();

      const catB = await catRepo.create({ name: 'Kategori Berisi' });
      await prodRepo.create({
        categoryId: catB.id,
        name: 'Produk B',
        basePriceRupiah: 10_000,
      });

      const delB = await catRepo.deleteOrDeactivate(catB.id);
      expect(delB.action).toBe('DEACTIVATED');

      const updatedB = await catRepo.getById(catB.id);
      expect(updatedB).not.toBeNull();
      expect(updatedB?.isActive).toBe(false);

      const activeList = await catRepo.list(false);
      expect(activeList.some((c) => c.id === catB.id)).toBe(false);

      const fullList = await catRepo.list(true);
      expect(fullList.some((c) => c.id === catB.id)).toBe(true);
    });
  });

  describe('OptionGroupRepository', () => {
    it('creates option groups with nested options and lists them', async () => {
      const db = createMemoryDb();
      await db.initialize();
      const repo = new OptionGroupRepository(db);

      const group = await repo.create({
        name: 'Level Kepedasan',
        minSelected: 1,
        maxSelected: 1,
        options: [
          { name: 'Level 0', unitPriceRupiah: 0, sortOrder: 1 },
          { name: 'Level 1', unitPriceRupiah: 0, sortOrder: 2 },
          { name: 'Level 2', unitPriceRupiah: 2000, sortOrder: 3 },
        ],
      });

      expect(group.id).toBeDefined();
      expect(group.name).toBe('Level Kepedasan');
      expect(group.options.length).toBe(3);
      expect(group.options[2]?.unitPriceRupiah).toBe(2000);

      const list = await repo.list();
      expect(list.length).toBe(1);
      expect(list[0]?.options.length).toBe(3);
    });

    it('adds option, updates option, and soft-deactivates when used in sales history', async () => {
      const db = createMemoryDb();
      await db.initialize();
      const repo = new OptionGroupRepository(db);

      const group = await repo.create({
        name: 'Topping Seblak',
        options: [{ name: 'Sosis', unitPriceRupiah: 2000 }],
      });
      const sosisId = group.options[0]!.id;

      const added = await repo.addOption(group.id, {
        name: 'Bakso',
        unitPriceRupiah: 2500,
      });
      expect(added.name).toBe('Bakso');
      expect(added.unitPriceRupiah).toBe(2500);

      // Hard delete option when not referenced
      const delBakso = await repo.deleteOrDeactivateOption(added.id);
      expect(delBakso.action).toBe('DELETED');

      // Simulate historical transaction referencing sosis
      const txRepo = new TransactionRepository(db);
      await txRepo.createPaidSale({
        id: 'tx_hist_opt',
        occurredAtMs: Date.now(),
        paymentMethod: 'CASH',
        paidAmountRupiah: 10_000,
        items: [
          {
            id: 'item_hist_opt',
            productId: null,
            productNameSnapshot: 'Seblak Custom',
            baseUnitPriceRupiah: 5000,
            quantity: 1,
            options: [
              {
                id: 'opt_snap_1',
                optionId: sosisId,
                optionNameSnapshot: 'Sosis',
                unitPriceRupiah: 2000,
                quantityPerPortion: 1,
              },
            ],
          },
        ],
      });

      // Now deleting sosis must soft-deactivate to protect sales history
      const delSosis = await repo.deleteOrDeactivateOption(sosisId);
      expect(delSosis.action).toBe('DEACTIVATED');

      const groups = await repo.list(true);
      const sosisOpt = groups[0]?.options.find((o) => o.id === sosisId);
      expect(sosisOpt?.isActive).toBe(false);
    });
  });

  describe('ProductRepository', () => {
    it('creates product, assigns option groups, and handles search & filters', async () => {
      const db = createMemoryDb();
      await db.initialize();
      const catRepo = new CategoryRepository(db);
      const optRepo = new OptionGroupRepository(db);
      const prodRepo = new ProductRepository(db);

      const catFood = await catRepo.create({ name: 'Makanan' });
      const catDrink = await catRepo.create({ name: 'Minuman' });

      const optPedas = await optRepo.create({
        name: 'Pedas',
        options: [{ name: 'Pedas 1', unitPriceRupiah: 0 }],
      });

      const p1 = await prodRepo.create({
        categoryId: catFood.id,
        name: 'Mie Ayam Original',
        sku: 'MIE-01',
        basePriceRupiah: 12_000,
        optionGroupIds: [optPedas.id],
      });

      const p2 = await prodRepo.create({
        categoryId: catDrink.id,
        name: 'Es Teh Manis',
        sku: 'DRK-01',
        basePriceRupiah: 4000,
      });

      expect(p1.id).toBeDefined();
      expect(p1.optionGroups.length).toBe(1);
      expect(p1.optionGroups[0]?.name).toBe('Pedas');

      // Filter by category
      const foodOnly = await prodRepo.list({ categoryId: catFood.id });
      expect(foodOnly.length).toBe(1);
      expect(foodOnly[0]?.name).toBe('Mie Ayam Original');

      // Search query by name
      const searchTeh = await prodRepo.list({ searchQuery: 'teh' });
      expect(searchTeh.length).toBe(1);
      expect(searchTeh[0]?.name).toBe('Es Teh Manis');

      // Search query by SKU
      const searchSku = await prodRepo.list({ searchQuery: 'MIE-01' });
      expect(searchSku.length).toBe(1);
      expect(searchSku[0]?.name).toBe('Mie Ayam Original');

      // Toggle availability
      const toggled = await prodRepo.toggleAvailability(p2.id);
      expect(toggled.isAvailable).toBe(false);

      // Unavailable excluded by default
      const availableOnly = await prodRepo.list({ includeUnavailable: false });
      expect(availableOnly.some((p) => p.id === p2.id)).toBe(false);

      // Included when requested
      const withUnavailable = await prodRepo.list({ includeUnavailable: true });
      expect(withUnavailable.some((p) => p.id === p2.id)).toBe(true);
    });

    it('rejects negative base price', async () => {
      const db = createMemoryDb();
      await db.initialize();
      const catRepo = new CategoryRepository(db);
      const prodRepo = new ProductRepository(db);

      const cat = await catRepo.create({ name: 'Makanan' });

      await expect(
        prodRepo.create({
          categoryId: cat.id,
          name: 'Invalid Price',
          basePriceRupiah: -5000,
        }),
      ).rejects.toThrow(/nonnegatif/);
    });

    it('protects transaction history by soft-deactivating products already sold', async () => {
      const db = createMemoryDb();
      await db.initialize();
      const catRepo = new CategoryRepository(db);
      const prodRepo = new ProductRepository(db);

      const cat = await catRepo.create({ name: 'Makanan' });
      const prod = await prodRepo.create({
        categoryId: cat.id,
        name: 'Menu Populer',
        basePriceRupiah: 15_000,
      });

      // Simulate historical transaction item referencing this product
      const txRepo = new TransactionRepository(db);
      await txRepo.createPaidSale({
        id: 'tx_hist_prod',
        occurredAtMs: Date.now(),
        paymentMethod: 'CASH',
        paidAmountRupiah: 20_000,
        items: [
          {
            id: 'item_hist_prod',
            productId: prod.id,
            productNameSnapshot: 'Menu Populer',
            baseUnitPriceRupiah: 15_000,
            quantity: 1,
          },
        ],
      });

      // Attempt to delete -> must soft deactivate
      const delResult = await prodRepo.deleteOrDeactivate(prod.id);
      expect(delResult.action).toBe('DEACTIVATED');

      const byId = await prodRepo.getById(prod.id);
      expect(byId).not.toBeNull();
      expect(byId?.isActive).toBe(false);

      // Active list excludes it
      const activeList = await prodRepo.list({ includeInactive: false });
      expect(activeList.some((p) => p.id === prod.id)).toBe(false);
    });
  });

  describe('seedStarterCategoriesIfEmpty', () => {
    it('seeds starter categories, option groups, and products when empty, and is idempotent', async () => {
      const db = createMemoryDb();
      await db.initialize();
      const catRepo = new CategoryRepository(db);
      const optRepo = new OptionGroupRepository(db);
      const prodRepo = new ProductRepository(db);

      const result1 = await seedStarterCategoriesIfEmpty(db);
      expect(result1.categoriesCreated).toBe(4);
      expect(result1.optionGroupsCreated).toBe(3);
      expect(result1.productsCreated).toBe(7);

      const categories = await catRepo.list();
      expect(categories.map((c) => c.name)).toEqual([
        'Mie Ayam & Yamin',
        'Seblak',
        'Jajanan',
        'Minuman',
      ]);

      const groups = await optRepo.list();
      expect(groups.length).toBe(3);

      const products = await prodRepo.list();
      expect(products.length).toBe(7);

      // Idempotency check: running again must return 0 and not duplicate
      const result2 = await seedStarterCategoriesIfEmpty(db);
      expect(result2.categoriesCreated).toBe(0);
      expect(result2.optionGroupsCreated).toBe(0);
      expect(result2.productsCreated).toBe(0);

      const categoriesAfter = await catRepo.list();
      expect(categoriesAfter.length).toBe(4);
    });
  });
});
