import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  parseTxt,
  parseDate,
  parseAmount,
  parseAccountString,
  extractAmountFromLine,
} from './parseTxt';

// --- Unit tests for helper functions ---

describe('parseDate', () => {
  it('converts DD.MM.YYYY to YYYY-MM-DD', () => {
    expect(parseDate('03.04.2025')).toBe('2025-04-03');
    expect(parseDate('29.12.2025')).toBe('2025-12-29');
    expect(parseDate('01.01.2000')).toBe('2000-01-01');
  });

  it('throws on invalid date', () => {
    expect(() => parseDate('2025-04-03')).toThrow('Invalid date');
    expect(() => parseDate('3.4.2025')).toThrow('Invalid date');
    expect(() => parseDate('')).toThrow('Invalid date');
  });
});

describe('parseAmount', () => {
  it('parses positive amounts', () => {
    expect(parseAmount('188 709,18')).toBe(18870918);
    expect(parseAmount('5 412,00')).toBe(541200);
    expect(parseAmount('50 000,00')).toBe(5000000);
    expect(parseAmount('2 323,20')).toBe(232320);
    expect(parseAmount('0,00')).toBe(0);
  });

  it('parses negative amounts', () => {
    expect(parseAmount('-180 000,00')).toBe(-18000000);
    expect(parseAmount('-776,97')).toBe(-77697);
    expect(parseAmount('-4 257,00')).toBe(-425700);
  });

  it('parses amounts without thousand separators', () => {
    expect(parseAmount('100,50')).toBe(10050);
    expect(parseAmount('-99,99')).toBe(-9999);
  });
});

describe('parseAccountString', () => {
  it('parses simple account number', () => {
    expect(parseAccountString('2900789018 / 5500')).toEqual({
      prefix: '',
      number: '2900789018',
      bankCode: '5500',
    });
  });

  it('parses account with prefix', () => {
    expect(parseAccountString('502-88776654 / 0100')).toEqual({
      prefix: '502',
      number: '88776654',
      bankCode: '0100',
    });
    expect(parseAccountString('2014-55443327 / 0100')).toEqual({
      prefix: '2014',
      number: '55443327',
      bankCode: '0100',
    });
    expect(parseAccountString('801-77665545 / 0100')).toEqual({
      prefix: '801',
      number: '77665545',
      bankCode: '0100',
    });
  });

  it('returns null for non-account strings', () => {
    expect(parseAccountString('Petr Svoboda')).toBeNull();
    expect(parseAccountString('VS2025101 / KS558')).toBeNull();
    expect(parseAccountString('OSVČ zdravotní poj.')).toBeNull();
    expect(parseAccountString('')).toBeNull();
  });
});

describe('extractAmountFromLine', () => {
  it('extracts amount from amount-only line', () => {
    const result = extractAmountFromLine('-180 000,00 0,00');
    expect(result).toEqual({ amount: -18000000, fee: 0, textBefore: '' });
  });

  it('extracts amount from line with preceding text', () => {
    const result = extractAmountFromLine('Vklad podnikatele 50 000,00 0,00');
    expect(result).toEqual({ amount: 5000000, fee: 0, textBefore: 'Vklad podnikatele' });
  });

  it('extracts amount from VS/KS line with amount', () => {
    const result = extractAmountFromLine('VS1234567890 / KS558 5 412,00 0,00');
    expect(result).toEqual({ amount: 541200, fee: 0, textBefore: 'VS1234567890 / KS558' });
  });

  it('does not match KS digits as part of amount', () => {
    // KS558 followed by space and amount must NOT merge into "558 5 412,00"
    const result = extractAmountFromLine('VS1234567890 / KS558 5 412,00 0,00');
    expect(result!.amount).toBe(541200); // 5 412,00 CZK, not 558 5 412,00
  });

  it('returns null for lines without amounts', () => {
    expect(extractAmountFromLine('Petr Svoboda')).toBeNull();
    expect(extractAmountFromLine('VS2025101 / KS558')).toBeNull();
    expect(extractAmountFromLine('Odchozí úhrada')).toBeNull();
  });
});

// --- Integration tests for full parser ---

describe('parseTxt', () => {
  const samplePath = path.resolve(__dirname, '../tests/fixtures/sample.txt');
  const sample = fs.readFileSync(samplePath, 'utf-8');

  it('parses correct number of transactions', () => {
    const txns = parseTxt(sample);
    expect(txns).toHaveLength(5);
  });

  it('parses simple outgoing payment (tx 1)', () => {
    const txns = parseTxt(sample);
    const tx = txns[0];
    expect(tx.datePosted).toBe('2025-04-03');
    expect(tx.dateExecuted).toBe('2025-04-03');
    expect(tx.type).toBe('Odchozí úhrada');
    expect(tx.transactionCode).toBe('200100300401');
    expect(tx.counterpartName).toBe('Petr Svoboda');
    expect(tx.counterpartAccount).toEqual({ prefix: '', number: '2900789018', bankCode: '5500' });
    expect(tx.amount).toBe(-18000000);
    expect(tx.fee).toBe(0);
    expect(tx.vs).toBe('');
    expect(tx.ks).toBe('');
  });

  it('parses incoming payment with VS/KS and details (tx 2)', () => {
    const txns = parseTxt(sample);
    const tx = txns[1];
    expect(tx.type).toBe('Příchozí úhrada');
    expect(tx.transactionCode).toBe('200100300402');
    expect(tx.counterpartName).toBe('KVITKO S.R.O.');
    expect(tx.counterpartAccount.number).toBe('1234567899');
    expect(tx.counterpartAccount.bankCode).toBe('0300');
    expect(tx.amount).toBe(18870918);
    expect(tx.vs).toBe('2025101');
    expect(tx.ks).toBe('558');
    expect(tx.details).toEqual([
      '2025101/0558/0/11/045923A/O KVITKO',
      'S.R.O',
    ]);
  });

  it('parses tx with code+account on same line and prefix account (tx 3)', () => {
    const txns = parseTxt(sample);
    const tx = txns[2];
    expect(tx.transactionCode).toBe('200100300403');
    expect(tx.counterpartAccount).toEqual({ prefix: '502', number: '88776654', bankCode: '0100' });
    expect(tx.vs).toBe('1234567890');
    expect(tx.amount).toBe(-10322900);
  });

  it('parses standing order with multiple detail lines (tx 4)', () => {
    const txns = parseTxt(sample);
    const tx = txns[3];
    expect(tx.type).toBe('Trvalý příkaz');
    expect(tx.transactionCode).toBe('200100300404');
    expect(tx.counterpartAccount.number).toBe('6644332219');
    expect(tx.vs).toBe('1234567890');
    expect(tx.ks).toBe('0558');
    expect(tx.amount).toBe(-425700);
    expect(tx.details.length).toBeGreaterThanOrEqual(1);
  });

  it('parses tx where VS/KS and amount share the same line (tx 5)', () => {
    const txns = parseTxt(sample);
    const tx = txns[4];
    expect(tx.type).toBe('Příchozí úhrada');
    expect(tx.counterpartName).toBe('ZP Hlavní 3');
    expect(tx.counterpartAccount.number).toBe('6644998870');
    expect(tx.amount).toBe(541200);
    expect(tx.vs).toBe('1234567890');
    expect(tx.ks).toBe('558');
  });

  it('skips header lines automatically', () => {
    const withExtraHeader = 'Some random header\n' + sample;
    const txns = parseTxt(withExtraHeader);
    expect(txns).toHaveLength(5);
    expect(txns[0].datePosted).toBe('2025-04-03');
  });

  describe('full file', () => {
    const fullPath = path.resolve(__dirname, '../Vypis z uctu 2900123451 za 01-04-2025 - 31-12-2025 (plain copy-paste).txt');

    // Skip if full file not present (CI)
    const fullFileExists = fs.existsSync(fullPath);
    it.skipIf(!fullFileExists)('parses all transactions from the real statement', () => {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const txns = parseTxt(content);
      expect(txns.length).toBe(47);
    });

    it.skipIf(!fullFileExists)('debit total matches statement', () => {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const txns = parseTxt(content);
      const totalDebit = txns
        .filter(t => t.amount < 0)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      expect(totalDebit).toBe(202745497); // 2 027 454,97 CZK
    });

    it.skipIf(!fullFileExists)('credit total matches statement', () => {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const txns = parseTxt(content);
      const totalCredit = txns
        .filter(t => t.amount > 0)
        .reduce((sum, t) => sum + t.amount, 0);
      expect(totalCredit).toBe(194393478); // 1 943 934,78 CZK
    });
  });
});
