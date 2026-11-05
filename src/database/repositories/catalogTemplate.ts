import type { DatabaseService } from '../sqlite';
import { CategoryRepository } from './categoryRepository';
import { OptionGroupRepository } from './optionGroupRepository';
import { ProductRepository } from './productRepository';

export interface StarterTemplateResult {
  readonly categoriesCreated: number;
  readonly optionGroupsCreated: number;
  readonly productsCreated: number;
}

/**
 * Menyediakan inisialisasi kategori awal (Mie Ayam, Seblak, Jajanan, Minuman)
 * yang sepenuhnya dapat diedit oleh owner melalui menu aplikasi.
 * PERHATIAN: Tidak mengunci harga atau aturan seblak; seluruh item berlabel template
 * dan harga dapat diubah kapan saja.
 */
export async function seedStarterCategoriesIfEmpty(
  db: DatabaseService,
): Promise<StarterTemplateResult> {
  const categoryRepo = new CategoryRepository(db);
  const optionGroupRepo = new OptionGroupRepository(db);
  const productRepo = new ProductRepository(db);

  const existingCategories = await categoryRepo.list(true);
  if (existingCategories.length > 0) {
    return {
      categoriesCreated: 0,
      optionGroupsCreated: 0,
      productsCreated: 0,
    };
  }

  const nowMs = Date.now();

  return db.withTransaction(async (tx) => {
    // 1. Kategori Dasar Kedai MamaMin
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

    // 2. Grup Opsi Contoh (Dapat diedit/dihapus owner)
    const grpLevelPedas = await optionGroupRepo.create(
      {
        name: 'Level Pedas',
        minSelected: 0,
        maxSelected: 1,
        sortOrder: 1,
        options: [
          { name: 'Level 0 (Tidak Pedas)', unitPriceRupiah: 0, sortOrder: 1 },
          { name: 'Level 1 (Sedang)', unitPriceRupiah: 0, sortOrder: 2 },
          { name: 'Level 2 (Pedas)', unitPriceRupiah: 0, sortOrder: 3 },
          { name: 'Level 3 (Ekstra Pedas)', unitPriceRupiah: 0, sortOrder: 4 },
        ],
      },
      tx,
    );

    const grpToppingMie = await optionGroupRepo.create(
      {
        name: 'Topping Tambahan Mie',
        minSelected: 0,
        maxSelected: null,
        sortOrder: 2,
        options: [
          { name: 'Bakso Sapi (2 pcs)', unitPriceRupiah: 4000, sortOrder: 1 },
          { name: 'Pangsit Basah (2 pcs)', unitPriceRupiah: 3000, sortOrder: 2 },
          { name: 'Ceker Ayam (2 pcs)', unitPriceRupiah: 4000, sortOrder: 3 },
          { name: 'Telur Rebus', unitPriceRupiah: 3000, sortOrder: 4 },
        ],
      },
      tx,
    );

    const grpToppingSeblak = await optionGroupRepo.create(
      {
        name: 'Pilihan Topping Seblak (Contoh Draf)',
        minSelected: 0,
        maxSelected: null,
        sortOrder: 3,
        options: [
          { name: 'Kerupuk Bintang/Mawar', unitPriceRupiah: 1500, sortOrder: 1 },
          { name: 'Makaroni', unitPriceRupiah: 1500, sortOrder: 2 },
          { name: 'Sosis Sapi', unitPriceRupiah: 2000, sortOrder: 3 },
          { name: 'Bakso Ikan / Sapi', unitPriceRupiah: 2000, sortOrder: 4 },
          { name: 'Dumpling Keju', unitPriceRupiah: 2500, sortOrder: 5 },
          { name: 'Cikuwa', unitPriceRupiah: 2000, sortOrder: 6 },
          { name: 'Sayur Sawi / Kol', unitPriceRupiah: 1000, sortOrder: 7 },
          { name: 'Telur Ayam', unitPriceRupiah: 3000, sortOrder: 8 },
        ],
      },
      tx,
    );

    // 3. Produk Starter Terbuka (Dapat disesuaikan harganya oleh kasir/owner)
    await productRepo.create(
      {
        categoryId: catMie.id,
        name: 'Mie Ayam Original',
        pricingMode: 'BASE_PLUS_OPTIONS',
        basePriceRupiah: 10000,
        sortOrder: 1,
        optionGroupIds: [grpLevelPedas.id, grpToppingMie.id],
        nowMs,
      },
      tx,
    );

    await productRepo.create(
      {
        categoryId: catMie.id,
        name: 'Mie Yamin Manis',
        pricingMode: 'BASE_PLUS_OPTIONS',
        basePriceRupiah: 11000,
        sortOrder: 2,
        optionGroupIds: [grpLevelPedas.id, grpToppingMie.id],
        nowMs,
      },
      tx,
    );

    await productRepo.create(
      {
        categoryId: catSeblak.id,
        name: 'Seblak Prasmanan (Draf Wadah)',
        pricingMode: 'BASE_PLUS_OPTIONS',
        basePriceRupiah: 5000, // Harga kuah/bumbu dasar draft
        sortOrder: 1,
        optionGroupIds: [grpLevelPedas.id, grpToppingSeblak.id],
        nowMs,
      },
      tx,
    );

    await productRepo.create(
      {
        categoryId: catMinuman.id,
        name: 'Es Teh Manis',
        pricingMode: 'FIXED',
        basePriceRupiah: 3000,
        sortOrder: 1,
        nowMs,
      },
      tx,
    );

    await productRepo.create(
      {
        categoryId: catMinuman.id,
        name: 'Teh Manis Hangat',
        pricingMode: 'FIXED',
        basePriceRupiah: 3000,
        sortOrder: 2,
        nowMs,
      },
      tx,
    );

    await productRepo.create(
      {
        categoryId: catJajanan.id,
        name: 'Cireng Crispy Bumbu Rujak',
        pricingMode: 'FIXED',
        basePriceRupiah: 8000,
        sortOrder: 1,
        nowMs,
      },
      tx,
    );

    await productRepo.create(
      {
        categoryId: catJajanan.id,
        name: 'Pisang Goreng Keju',
        pricingMode: 'FIXED',
        basePriceRupiah: 10000,
        sortOrder: 2,
        nowMs,
      },
      tx,
    );

    return {
      categoriesCreated: 4,
      optionGroupsCreated: 3,
      productsCreated: 7,
    };
  });
}
