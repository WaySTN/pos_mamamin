import { describe, expect, it } from 'vitest';
import { formatDateTimeWib, getBusinessDateWib } from '../../src/domain/dates';
import {
  assertNonNegativeIntegerRupiah,
  formatRupiah,
  formatSignedRupiah,
  isNonNegativeIntegerRupiah,
} from '../../src/domain/money';

describe('domain/money invariants', () => {
  it('formats non-negative integer Rupiah without decimals', () => {
    expect(formatRupiah(0)).toBe('Rp0');
    expect(formatRupiah(10_000)).toBe('Rp10.000');
    expect(formatRupiah(16_000)).toBe('Rp16.000');
  });

  it('formats signed integer Rupiah for net cash differences', () => {
    expect(formatSignedRupiah(0)).toBe('Rp0');
    expect(formatSignedRupiah(24_000)).toBe('Rp24.000');
    expect(formatSignedRupiah(-10_000)).toBe('-Rp10.000');
  });

  it('rejects negative and floating-point amounts', () => {
    expect(isNonNegativeIntegerRupiah(-1)).toBe(false);
    expect(isNonNegativeIntegerRupiah(10_000.5)).toBe(false);
    expect(() => assertNonNegativeIntegerRupiah(-500)).toThrow(RangeError);
    expect(() => assertNonNegativeIntegerRupiah(12.34)).toThrow(RangeError);
  });
});

describe('domain/dates WIB business_date invariants', () => {
  it('resolves Asia/Jakarta midnight boundary accurately (T19)', () => {
    // 2026-11-05 16:59:00 UTC === 2026-11-05 23:59:00 WIB
    const beforeMidnightWib = Date.UTC(2026, 10, 5, 16, 59, 0);
    expect(getBusinessDateWib(beforeMidnightWib)).toBe('2026-11-05');

    // 2026-11-05 17:01:00 UTC === 2026-11-06 00:01:00 WIB
    // Note: toISOString().slice(0,10) would wrongly return '2026-11-05' here!
    const afterMidnightWib = Date.UTC(2026, 10, 5, 17, 1, 0);
    expect(getBusinessDateWib(afterMidnightWib)).toBe('2026-11-06');
  });

  it('formats WIB display date-time with explicit WIB suffix', () => {
    const sampleUtc = Date.UTC(2026, 10, 5, 12, 30, 0);
    expect(formatDateTimeWib(sampleUtc)).toContain('2026');
    expect(formatDateTimeWib(sampleUtc)).toMatch(/WIB$/);
  });
});

