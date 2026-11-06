import type { DatabaseService } from '../sqlite';
import { CategoryRepository } from './categoryRepository';
import { OptionGroupRepository } from './optionGroupRepository';
import { ProductRepository } from './productRepository';

export interface StarterTemplateResult {
  readonly categoriesCreated: number;
  readonly optionGroupsCreated: number;
  readonly productsCreated: number;
  readonly message?: string;
}

export interface SeedCatalogOptions {
  /**
   * Jika true, mengganti katalog lama dengan menu resmi MamaMin.
   * Bila ada data transaksi historis, item lama akan dinonaktifkan (soft-deactivate)
   * agar tidak merusak foreign key dan keaslian transaksi lama.
   */
  readonly forceReplace?: boolean;
}

/**
 * Menyediakan katalog resmi Kedai MamaMin sesuai spesifikasi owner:
 * - Mie Ayam Biasa (Rp10.000, topping ceker/telur/kepala/pentol @Rp3.000, sosis @Rp2.000)
 * - Mie Yamin (Rp10.000, level kepedasan: Tidak Pedas, Sedang, Pedas @Rp0 + topping sama)
 * - Seblak Prasmanan (Biaya dasar kuah/masak Rp3.000 + 14 pilihan topping resmi)
 * - Jajanan Biasa (Risol Mayo Biasa, Risol Sayur, Cireng Ayam, Pisang Coklat @Rp1.000)
 * - Risol Jumbo (Ayam, Ayam Pedas, Mayo, Mentai, Coklat, Matcha @Rp3.000)
 * - Minuman (Es Teh Rp3.000, Pop Ice Rp4.000, Es Jeruk, Es Capcin, Milo, Hilo, Good Day, Beng-Beng @Rp5.000)
 */
export async function seedStarterCategoriesIfEmpty(
  db: DatabaseService,
): Promise<StarterTemplateResult> {
  const categoryRepo = new CategoryRepository(db);
  const existingCategories = await categoryRepo.list(true);
  if (existingCategories.length > 0) {
    return {
      categoriesCreated: 0,
      optionGroupsCreated: 0,
      productsCreated: 0,
      message: 'Katalog sudah memiliki kategori, tidak ada data yang ditimpa.',
    };
  }

  return applyOfficialMamaMinCatalog(db, { forceReplace: false });
}

/**
 * Mengaplikasikan katalog menu resmi MamaMin ke dalam SQLite native.
 */
export async function applyOfficialMamaMinCatalog(
  db: DatabaseService,
  options?: SeedCatalogOptions,
): Promise<StarterTemplateResult> {
  const categoryRepo = new CategoryRepository(db);
  const optionGroupRepo = new OptionGroupRepository(db);
  const productRepo = new ProductRepository(db);

  return db.withTransaction(async (tx) => {
    const nowMs = Date.now();

    if (options?.forceReplace) {
      // Cek apakah ada transaksi historis
      const txCheck = await tx.query<{ count: number }>(
        'SELECT COUNT(*) as count FROM transaction_items;',
        [],
      );
      const hasTransactions = (txCheck[0]?.count ?? 0) > 0;

      if (!hasTransactions) {
        // Aman membersihkan total jika belum pernah ada transaksi
        await tx.run('DELETE FROM product_option_groups;', []);
        await tx.run('DELETE FROM products;', []);
        await tx.run('DELETE FROM options;', []);
        await tx.run('DELETE FROM option_groups;', []);
        await tx.run('DELETE FROM categories;', []);
      } else {
        // Jika ada transaksi lama: nonaktifkan (soft-deactivate) produk lama
        await tx.run('UPDATE products SET is_active = 0, is_available = 0;', []);
        await tx.run('UPDATE option_groups SET is_active = 0;', []);
        await tx.run('UPDATE categories SET is_active = 0;', []);
      }
    }

    // 1. Kategori Resmi Kedai MamaMin (4 Kategori)
    const catMie = await categoryRepo.create(
      {
        name: 'Mie Ayam & Yamin',
        sortOrder: 1,
        nowMs,
      },
      tx,
    );
    const catSeblak = await categoryRepo.create(
      {
        name: 'Seblak',
        sortOrder: 2,
        nowMs,
      },
      tx,
    );
    const catJajanan = await categoryRepo.create(
      {
        name: 'Jajanan',
        sortOrder: 3,
        nowMs,
      },
      tx,
    );
    const catMinuman = await categoryRepo.create(
      {
        name: 'Minuman',
        sortOrder: 4,
        nowMs,
      },
      tx,
    );

    // 2. Grup Opsi & Topping Resmi (4 Grup)

    // a. Level Pedas Mie Yamin (Wajib pilih 1: Tidak Pedas, Sedang, Pedas @Rp0)
    const grpPedasYamin = await optionGroupRepo.create(
      {
        name: 'Level Pedas Mie Yamin',
        minSelected: 1,
        maxSelected: 1,
        sortOrder: 1,
        options: [
          { name: 'Tidak Pedas', unitPriceRupiah: 0, sortOrder: 1 },
          { name: 'Sedang', unitPriceRupiah: 0, sortOrder: 2 },
          { name: 'Pedas', unitPriceRupiah: 0, sortOrder: 3 },
        ],
      },
      tx,
    );

    // b. Topping Tambahan Mie (Bisa untuk Mie Ayam Biasa & Mie Yamin)
    const grpToppingMie = await optionGroupRepo.create(
      {
        name: 'Topping Tambahan Mie',
        minSelected: 0,
        maxSelected: null,
        sortOrder: 2,
        options: [
          { name: 'Telur', unitPriceRupiah: 3000, sortOrder: 1 },
          { name: 'Ceker', unitPriceRupiah: 3000, sortOrder: 2 },
          { name: 'Kepala', unitPriceRupiah: 3000, sortOrder: 3 },
          { name: 'Pentol', unitPriceRupiah: 3000, sortOrder: 4 },
          { name: 'Sosis Tambahan', unitPriceRupiah: 2000, sortOrder: 5 },
        ],
      },
      tx,
    );

    // c. Level Pedas Seblak (Tingkat pedas kuah seblak)
    const grpPedasSeblak = await optionGroupRepo.create(
      {
        name: 'Level Pedas Seblak',
        minSelected: 0,
        maxSelected: 1,
        sortOrder: 3,
        options: [
          { name: 'Level 0 (Tidak Pedas)', unitPriceRupiah: 0, sortOrder: 1 },
          { name: 'Level 1 (Sedang)', unitPriceRupiah: 0, sortOrder: 2 },
          { name: 'Level 2 (Pedas)', unitPriceRupiah: 0, sortOrder: 3 },
          { name: 'Level 3 (Ekstra Pedas)', unitPriceRupiah: 0, sortOrder: 4 },
        ],
      },
      tx,
    );

    // d. Topping Seblak Prasmanan Resmi (14 Topping Sesuai Konfirmasi Owner)
    const grpToppingSeblak = await optionGroupRepo.create(
      {
        name: 'Pilihan Topping Seblak Prasmanan',
        minSelected: 0,
        maxSelected: null,
        sortOrder: 4,
        options: [
          { name: 'Aneka Kerupuk Seblak', unitPriceRupiah: 1000, sortOrder: 1 },
          { name: 'Mie', unitPriceRupiah: 1000, sortOrder: 2 },
          { name: 'Sawi Hijau', unitPriceRupiah: 1000, sortOrder: 3 },
          { name: 'Jamur Enoki', unitPriceRupiah: 1000, sortOrder: 4 },
          { name: 'Cireng', unitPriceRupiah: 1000, sortOrder: 5 },
          { name: 'Sosis Merah', unitPriceRupiah: 1500, sortOrder: 6 },
          { name: 'Ceker', unitPriceRupiah: 2000, sortOrder: 7 },
          { name: 'Chikuwa', unitPriceRupiah: 2000, sortOrder: 8 },
          { name: 'Crab Stick', unitPriceRupiah: 2000, sortOrder: 9 },
          { name: 'Otak-Otak', unitPriceRupiah: 2000, sortOrder: 10 },
          { name: 'Dumpling Ayam', unitPriceRupiah: 2000, sortOrder: 11 },
          { name: 'Dumpling Keju', unitPriceRupiah: 2000, sortOrder: 12 },
          { name: 'Sosis Bakar', unitPriceRupiah: 3000, sortOrder: 13 },
          { name: 'Telur', unitPriceRupiah: 3000, sortOrder: 14 },
        ],
      },
      tx,
    );

    // 3. Produk Menu Resmi Kedai MamaMin (21 Produk)
    let productsCreated = 0;

    // --- Kategori: Mie Ayam & Yamin ---
    // Mie Ayam Biasa: Rp10.000 (tanpa level pedas, ada topping tambahan)
    await productRepo.create(
      {
        categoryId: catMie.id,
        name: 'Mie Ayam Biasa',
        pricingMode: 'BASE_PLUS_OPTIONS',
        basePriceRupiah: 10000,
        sortOrder: 1,
        optionGroupIds: [grpToppingMie.id],
        nowMs,
      },
      tx,
    );
    productsCreated++;

    // Mie Yamin: Rp10.000 (ada pilihan kepedasan: Tidak Pedas, Sedang, Pedas + topping tambahan)
    await productRepo.create(
      {
        categoryId: catMie.id,
        name: 'Mie Yamin',
        pricingMode: 'BASE_PLUS_OPTIONS',
        basePriceRupiah: 10000,
        sortOrder: 2,
        optionGroupIds: [grpPedasYamin.id, grpToppingMie.id],
        nowMs,
      },
      tx,
    );
    productsCreated++;

    // --- Kategori: Seblak ---
    // Seblak Prasmanan: Rp3.000 (biaya dasar kuah/masak, ditambah akumulasi topping)
    await productRepo.create(
      {
        categoryId: catSeblak.id,
        name: 'Seblak Prasmanan',
        pricingMode: 'BASE_PLUS_OPTIONS',
        basePriceRupiah: 3000,
        sortOrder: 1,
        optionGroupIds: [grpPedasSeblak.id, grpToppingSeblak.id],
        nowMs,
      },
      tx,
    );
    productsCreated++;

    // --- Kategori: Jajanan (10 Produk) ---
    // Jajanan Biasa @ Rp1.000
    const regularSnacks = [
      { name: 'Risol Mayo Biasa', price: 1000, order: 1 },
      { name: 'Risol Sayur', price: 1000, order: 2 },
      { name: 'Cireng Ayam', price: 1000, order: 3 },
      { name: 'Pisang Coklat', price: 1000, order: 4 },
    ];
    for (const snack of regularSnacks) {
      await productRepo.create(
        {
          categoryId: catJajanan.id,
          name: snack.name,
          pricingMode: 'FIXED',
          basePriceRupiah: snack.price,
          sortOrder: snack.order,
          nowMs,
        },
        tx,
      );
      productsCreated++;
    }

    // Risol Jumbo @ Rp3.000
    const jumboRisols = [
      { name: 'Risol Ayam Jumbo', price: 3000, order: 5 },
      { name: 'Risol Ayam Pedas Jumbo', price: 3000, order: 6 },
      { name: 'Risol Mayo Jumbo', price: 3000, order: 7 },
      { name: 'Risol Mentai Jumbo', price: 3000, order: 8 },
      { name: 'Risol Coklat Jumbo', price: 3000, order: 9 },
      { name: 'Risol Matcha Jumbo', price: 3000, order: 10 },
    ];
    for (const risol of jumboRisols) {
      await productRepo.create(
        {
          categoryId: catJajanan.id,
          name: risol.name,
          pricingMode: 'FIXED',
          basePriceRupiah: risol.price,
          sortOrder: risol.order,
          nowMs,
        },
        tx,
      );
      productsCreated++;
    }

    // --- Kategori: Minuman (8 Produk) ---
    const beverages = [
      { name: 'Es Teh', price: 3000, order: 1 },
      { name: 'Pop Ice', price: 4000, order: 2 },
      { name: 'Es Jeruk', price: 5000, order: 3 },
      { name: 'Es Capcin', price: 5000, order: 4 },
      { name: 'Es Milo', price: 5000, order: 5 },
      { name: 'Es Hilo', price: 5000, order: 6 },
      { name: 'Es Good Day', price: 5000, order: 7 },
      { name: 'Es Beng-Beng', price: 5000, order: 8 },
    ];
    for (const beverage of beverages) {
      await productRepo.create(
        {
          categoryId: catMinuman.id,
          name: beverage.name,
          pricingMode: 'FIXED',
          basePriceRupiah: beverage.price,
          sortOrder: beverage.order,
          nowMs,
        },
        tx,
      );
      productsCreated++;
    }

    return {
      categoriesCreated: 4,
      optionGroupsCreated: 4,
      productsCreated,
      message: `Menu resmi MamaMin berhasil diterapkan (4 Kategori, 4 Grup Opsi, ${productsCreated} Produk).`,
    };
  });
}
