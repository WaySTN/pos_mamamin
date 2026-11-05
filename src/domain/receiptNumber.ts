import { assertValidBusinessDate } from './dates';
import { assertPositiveInteger } from './money';

/**
 * Memformat nomor struk unik harian sesuai Blueprint §10.2: `MM-YYYYMMDD-NNNN`.
 */
export function formatReceiptNumber(
  businessDate: string,
  dailySequence: number,
  prefix = 'MM',
): string {
  assertValidBusinessDate(businessDate);
  assertPositiveInteger(dailySequence, 'dailySequence');

  const trimmedPrefix = prefix.trim();
  if (!/^[A-Z0-9-]+$/.test(trimmedPrefix)) {
    throw new RangeError(`Prefix nomor struk tidak valid: ${prefix}`);
  }

  const compactDate = businessDate.replaceAll('-', '');
  const sequenceDigits = String(dailySequence).padStart(4, '0');
  return `${trimmedPrefix}-${compactDate}-${sequenceDigits}`;
}

