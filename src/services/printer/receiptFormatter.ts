import { formatReceiptDateTimeWib } from '../../domain/dates';
import { formatPlainRupiahDigits } from '../../domain/money';
import type {
  SavedTransaction,
  StoreIdentitySettings,
} from '../../domain/types';

export const DEFAULT_58MM_CHAR_COLUMNS = 32 as const;

export interface ReceiptFormatOptions {
  readonly store: StoreIdentitySettings;
  readonly isReprint?: boolean;
  readonly columns?: number;
}

export interface FormattedReceiptDocument {
  readonly columns: number;
  readonly lines: readonly string[];
  readonly plainText: string;
  readonly escPosBytes: Uint8Array;
  readonly isReprint: boolean;
  readonly isVoid: boolean;
}

/**
 * Menormalkan teks ke ASCII cetak standar (0x20-0x7E) agar tidak rusak pada
 * codepage printer thermal 58 mm murah yang belum dikonfirmasi mereknya.
 */
export function sanitizeThermalAscii(input: string): string {
  const normalized = input.normalize('NFKD');
  let output = '';
  for (let i = 0; i < normalized.length; i += 1) {
    const code = normalized.charCodeAt(i);
    if (code >= 0x20 && code <= 0x7e) {
      output += normalized[i];
    } else if (code === 0x09 || code === 0x0a || code === 0x0d) {
      output += ' ';
    }
  }
  return output.replace(/\s+/g, ' ').trim();
}

export function wrapReceiptText(
  rawText: string,
  maxWidth: number,
  indent = '',
): string[] {
  const safeWidth = Math.max(16, Math.trunc(maxWidth));
  const cleanText = sanitizeThermalAscii(rawText);
  const availableWidth = Math.max(8, safeWidth - indent.length);

  if (cleanText.length === 0) {
    return [];
  }

  const words = cleanText.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (word.length > availableWidth) {
      if (current.length > 0) {
        lines.push(`${indent}${current}`);
        current = '';
      }
      for (let idx = 0; idx < word.length; idx += availableWidth) {
        lines.push(`${indent}${word.slice(idx, idx + availableWidth)}`);
      }
    } else if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= availableWidth) {
      current = `${current} ${word}`;
    } else {
      lines.push(`${indent}${current}`);
      current = word;
    }
  }

  if (current.length > 0) {
    lines.push(`${indent}${current}`);
  }

  return lines;
}

function centerLine(rawText: string, columns: number): string {
  const clean = sanitizeThermalAscii(rawText);
  if (clean.length >= columns) {
    return clean.slice(0, columns);
  }
  const leftPadding = Math.floor((columns - clean.length) / 2);
  return `${' '.repeat(leftPadding)}${clean}`;
}

function formatLeftRight(
  leftRaw: string,
  rightRaw: string,
  columns: number,
): string[] {
  const left = sanitizeThermalAscii(leftRaw);
  const right = sanitizeThermalAscii(rightRaw);

  if (left.length + 1 + right.length <= columns) {
    const spaces = columns - left.length - right.length;
    return [`${left}${' '.repeat(spaces)}${right}`];
  }

  const wrappedLeft = wrapReceiptText(left, columns);
  const rightAligned =
    right.length >= columns
      ? right.slice(0, columns)
      : `${' '.repeat(columns - right.length)}${right}`;
  return [...wrappedLeft, rightAligned];
}

/**
 * Mengonversi baris teks struk menjadi aliran byte ESC/POS dasar (`ESC @` + teks ASCII + feed).
 * Tidak mengirim perintah auto-cutter (`GS V`) agar aman bagi printer 58 mm tanpa pemotong.
 */
export function encodeEscPosDocument(lines: readonly string[]): Uint8Array {
  const bytes: number[] = [
    0x1b,
    0x40, // ESC @ (Initialize printer)
    0x1b,
    0x61,
    0x00, // ESC a 0 (Left justification; centering sudah dihitung per kolom karakter)
  ];

  for (const line of lines) {
    for (let i = 0; i < line.length; i += 1) {
      const code = line.charCodeAt(i);
      bytes.push(code >= 0x20 && code <= 0x7e ? code : 0x3f);
    }
    bytes.push(0x0a); // LF
  }

  // Feed 3 baris kertas di akhir struk agar mudah disobek manual
  bytes.push(0x0a, 0x0a, 0x0a);

  return Uint8Array.from(bytes);
}

/**
 * Memformat `SavedTransaction` dari SQLite menjadi struk thermal 58 mm sesuai
 * `AGENTS.md` §5-6 dan `docs/PROJECT_BLUEPRINT.md` §12.2-12.3.
 */
export function formatTransactionReceipt(
  transaction: SavedTransaction,
  options: ReceiptFormatOptions,
): FormattedReceiptDocument {
  const columns = Math.max(24, Math.trunc(options.columns ?? DEFAULT_58MM_CHAR_COLUMNS));
  const isReprint = options.isReprint === true;
  const isVoid = transaction.status === 'VOID';
  const divider = '-'.repeat(columns);
  const strongDivider = '='.repeat(columns);
  const lines: string[] = [];

  // Header identitas kedai
  const storeTitle = sanitizeThermalAscii(options.store.storeName || 'MAMAMIN').toUpperCase();
  for (const titleLine of wrapReceiptText(storeTitle, columns)) {
    lines.push(centerLine(titleLine, columns));
  }

  if (options.store.storeAddress) {
    for (const addrLine of wrapReceiptText(options.store.storeAddress, columns)) {
      lines.push(centerLine(addrLine, columns));
    }
  }

  lines.push(divider);

  // Penanda wajib untuk status VOID (DIBATALKAN) dan Reprint (SALINAN)
  if (isVoid) {
    lines.push(strongDivider);
    lines.push(centerLine('*** DIBATALKAN (VOID) ***', columns));
    if (transaction.voidReason) {
      lines.push(
        ...wrapReceiptText(`Alasan: ${transaction.voidReason}`, columns),
      );
    }
    lines.push(strongDivider);
  }

  if (isReprint) {
    lines.push(centerLine('*** SALINAN STRUK ***', columns));
    lines.push(divider);
  }

  // Metadata nomor & waktu WIB
  lines.push(...wrapReceiptText(`No  : ${transaction.receiptNumber}`, columns));
  lines.push(
    ...wrapReceiptText(
      `Wkt : ${formatReceiptDateTimeWib(transaction.occurredAtMs)}`,
      columns,
    ),
  );
  lines.push(divider);

  // Detail item & opsi dari snapshot tersimpan (bukan harga katalog aktif)
  for (const item of transaction.items) {
    lines.push(...wrapReceiptText(item.productNameSnapshot, columns));

    for (const opt of item.options) {
      const optLabel = `+ ${String(opt.quantityPerPortion)}x ${opt.optionNameSnapshot} (@${formatPlainRupiahDigits(opt.unitPriceRupiah)})`;
      lines.push(...wrapReceiptText(optLabel, columns, '  '));
    }

    if (item.notes) {
      lines.push(...wrapReceiptText(`Cat: ${item.notes}`, columns, '  '));
    }

    const qtyAndUnit = `  ${String(item.quantity)} x ${formatPlainRupiahDigits(item.unitTotalRupiah)}`;
    const lineTotal = formatPlainRupiahDigits(item.lineTotalRupiah);
    lines.push(...formatLeftRight(qtyAndUnit, lineTotal, columns));
  }

  lines.push(divider);

  // Ringkasan pembayaran
  lines.push(
    ...formatLeftRight(
      'TOTAL',
      formatPlainRupiahDigits(transaction.grandTotalRupiah),
      columns,
    ),
  );

  if (transaction.paymentMethod === 'CASH') {
    lines.push(
      ...formatLeftRight(
        'BAYAR CASH',
        formatPlainRupiahDigits(transaction.paidAmountRupiah),
        columns,
      ),
    );
    lines.push(
      ...formatLeftRight(
        'KEMBALIAN',
        formatPlainRupiahDigits(transaction.changeAmountRupiah),
        columns,
      ),
    );
  } else {
    lines.push(
      ...formatLeftRight(
        'BAYAR QRIS',
        formatPlainRupiahDigits(transaction.paidAmountRupiah),
        columns,
      ),
    );
    lines.push(...formatLeftRight('STATUS QRIS', 'KONFIRMASI MANUAL', columns));
  }

  lines.push(divider);

  for (const footerLine of wrapReceiptText(
    options.store.footerNote || 'Terima kasih!',
    columns,
  )) {
    lines.push(centerLine(footerLine, columns));
  }

  const escPosBytes = encodeEscPosDocument(lines);

  return {
    columns,
    lines,
    plainText: lines.join('\n'),
    escPosBytes,
    isReprint,
    isVoid,
  };
}

/**
 * Memformat halaman cetak uji 58 mm yang TIDAK membuat transaksi penjualan.
 */
export function formatPrinterTestPage(
  store: StoreIdentitySettings,
  nowMs: number,
  columns: number = DEFAULT_58MM_CHAR_COLUMNS,
): FormattedReceiptDocument {
  const safeCols = Math.max(24, Math.trunc(columns));
  const divider = '-'.repeat(safeCols);
  const lines: string[] = [
    centerLine(
      sanitizeThermalAscii(store.storeName || 'MAMAMIN').toUpperCase(),
      safeCols,
    ),
    centerLine('CETAK UJI PRINTER 58 MM', safeCols),
    divider,
    ...wrapReceiptText('BUKAN TRANSAKSI PENJUALAN', safeCols),
    ...wrapReceiptText(`Wkt : ${formatReceiptDateTimeWib(nowMs)}`, safeCols),
    ...wrapReceiptText(`Lebar kolom: ${String(safeCols)} karakter`, safeCols),
    divider,
    '01234567890123456789012345678901'.slice(0, safeCols),
    ...formatLeftRight('Contoh Angka', '16.000', safeCols),
    divider,
    centerLine('Uji Format Selesai', safeCols),
  ];

  return {
    columns: safeCols,
    lines,
    plainText: lines.join('\n'),
    escPosBytes: encodeEscPosDocument(lines),
    isReprint: false,
    isVoid: false,
  };
}

