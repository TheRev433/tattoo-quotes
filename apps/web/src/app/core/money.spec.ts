import { formatBytes, formatCents, formatRange, parseMoneyToCents } from './money';

describe('money helpers', () => {
  it('formats integer cents as MXN', () => {
    expect(formatCents(150000)).toBe('$1,500.00');
    expect(formatCents(5)).toBe('$0.05');
    expect(formatCents(123456789)).toBe('$1,234,567.89');
  });

  it('parses typed amounts into integer cents', () => {
    expect(parseMoneyToCents('1500')).toBe(150000);
    expect(parseMoneyToCents('$1,500.5')).toBe(150050);
    expect(parseMoneyToCents('0.07')).toBe(7);
    expect(parseMoneyToCents('  ')).toBeNull();
    expect(parseMoneyToCents(undefined)).toBeNull();
    expect(parseMoneyToCents('12.345')).toBeNaN();
    expect(parseMoneyToCents('-5')).toBeNaN();
    expect(parseMoneyToCents('abc')).toBeNaN();
  });

  it('formats budgets and quote ranges', () => {
    expect(formatRange(150000, 250000)).toBe('$1,500.00 – $2,500.00 MXN');
    expect(formatRange(850000, 850000)).toBe('$8,500.00 MXN');
    expect(formatRange(null, 800000)).toBe('Up to $8,000.00 MXN');
    expect(formatRange(100000, null)).toBe('From $1,000.00 MXN');
    expect(formatRange(null, null)).toBe('Not specified');
  });

  it('formats file sizes', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
    expect(formatBytes(2048)).toBe('2 KB');
  });
});
