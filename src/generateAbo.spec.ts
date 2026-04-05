import { describe, it, expect } from 'vitest';
import * as iconv from 'iconv-lite';
import {
  formatAccountNumber16,
  formatOwnAccount16,
  standardToInternal,
  formatDateDDMMYY,
  formatAmount,
  generateAbo,
  generateAboUtf8,
} from './generateAbo';
import { Transaction, StatementMetadata } from './parseTxt';

// --- Unit tests for formatting helpers ---

describe('standardToInternal', () => {
  it('permutes standard PPPPPPCCCCCCCCCC to internal format', () => {
    // Standard: 0000002900789012 → Internal per Money S3 permutation
    expect(standardToInternal('0000002900789018')).toBe('8018290079000000');
  });

  it('round-trips correctly (internal→standard via inverse)', () => {
    const INV_PERM = [10,11,12,13,14,15,4,5,6,7,8,3,9,1,2,0];
    function internalToStandard(s: string) { return INV_PERM.map(i => s[i]).join(''); }
    const std = '0005020088776654';
    expect(internalToStandard(standardToInternal(std))).toBe(std);
  });
});

describe('formatAccountNumber16', () => {
  it('formats account without prefix (standard, default)', () => {
    const result = formatAccountNumber16({ prefix: '', number: '2900789018', bankCode: '5500' });
    expect(result).toBe('0000002900789018');
    expect(result).toHaveLength(16);
  });

  it('formats account with short prefix (standard)', () => {
    expect(formatAccountNumber16({ prefix: '502', number: '88776654', bankCode: '0100' }))
      .toBe('0005020088776654');
  });

  it('formats account with 4-digit prefix (standard)', () => {
    expect(formatAccountNumber16({ prefix: '2014', number: '55443327', bankCode: '0100' }))
      .toBe('0020140055443327');
  });

  it('formats account in internal format when requested', () => {
    expect(formatAccountNumber16({ prefix: '', number: '2900789018', bankCode: '5500' }, true))
      .toBe('8018290079000000');
    expect(formatAccountNumber16({ prefix: '502', number: '88776654', bankCode: '0100' }, true))
      .toBe('4657008876000502');
  });
});

describe('formatOwnAccount16', () => {
  it('formats to 16 chars standard (default)', () => {
    expect(formatOwnAccount16('2900123451')).toBe('0000002900123451');
  });

  it('formats to 16 chars internal when requested', () => {
    expect(formatOwnAccount16('2900123451', true)).toBe('1452290013000000');
  });
});

describe('formatDateDDMMYY', () => {
  it('converts YYYY-MM-DD to DDMMYY', () => {
    expect(formatDateDDMMYY('2025-04-03')).toBe('030425');
    expect(formatDateDDMMYY('2025-12-29')).toBe('291225');
    expect(formatDateDDMMYY('2026-04-05')).toBe('050426');
  });
});

describe('formatAmount', () => {
  it('formats positive amounts zero-padded', () => {
    expect(formatAmount(18870918, 14)).toBe('00000018870918');
    expect(formatAmount(541200, 12)).toBe('000000541200');
  });

  it('formats negative amounts as absolute value', () => {
    expect(formatAmount(-18000000, 12)).toBe('000018000000');
    expect(formatAmount(-425700, 12)).toBe('000000425700');
  });

  it('formats zero', () => {
    expect(formatAmount(0, 14)).toBe('00000000000000');
  });
});

// --- Integration tests for ABO generation ---

const testMeta: StatementMetadata = {
  accountNumber: '2900123451',
  bankCode: '5500',
  accountName: 'Podnikani',
  openingBalance: 19934836,
  closingBalance: 11582817,
  totalCredit: 194393478,
  totalDebit: 202745497,
  statementNumber: 2,
  statementDate: '2026-04-05',
  periodFrom: '2025-04-01',
  periodTo: '2025-12-31',
};

const testTx: Transaction = {
  datePosted: '2025-04-09',
  dateExecuted: '2025-04-09',
  type: 'Příchozí úhrada',
  transactionCode: '200100300402',
  counterpartName: 'KVITKO S.R.O.',
  counterpartAccount: { prefix: '', number: '1234567899', bankCode: '0300' },
  amount: 18870918,
  fee: 0,
  vs: '2025101',
  ks: '558',
  ss: '',
  details: ['2025101/0558/0/11/045923A/O KVITKO', 'S.R.O'],
};

describe('generate074 (header record)', () => {
  it('produces a 128-char line starting with 074', () => {
    const output = generateAboUtf8(testMeta, []);
    const lines = output.split('\r\n').filter(l => l.length > 0);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveLength(128);
    expect(lines[0].substring(0, 3)).toBe('074');
  });

  it('contains correct account number (standard format)', () => {
    const line = generateAboUtf8(testMeta, []).split('\r\n')[0];
    expect(line.substring(3, 19)).toBe('0000002900123451');
  });

  it('contains correct account name padded to 20 chars', () => {
    const line = generateAboUtf8(testMeta, []).split('\r\n')[0];
    expect(line.substring(19, 39)).toBe('Podnikani           ');
  });

  it('contains correct old balance date', () => {
    const line = generateAboUtf8(testMeta, []).split('\r\n')[0];
    expect(line.substring(39, 45)).toBe('010425');
  });

  it('contains correct balances', () => {
    const line = generateAboUtf8(testMeta, []).split('\r\n')[0];
    // Old balance: 19934836 haléřů, sign +
    expect(line.substring(45, 59)).toBe('00000019934836');
    expect(line[59]).toBe('+');
    // New balance: 11582817 haléřů, sign +
    expect(line.substring(60, 74)).toBe('00000011582817');
    expect(line[74]).toBe('+');
  });

  it('contains correct turnovers', () => {
    const line = generateAboUtf8(testMeta, []).split('\r\n')[0];
    // Debit turnover
    expect(line.substring(75, 89)).toBe('00000202745497');
    expect(line[89]).toBe('0');
    // Credit turnover
    expect(line.substring(90, 104)).toBe('00000194393478');
    expect(line[104]).toBe('0');
  });

  it('contains statement number and date', () => {
    const line = generateAboUtf8(testMeta, []).split('\r\n')[0];
    expect(line.substring(105, 108)).toBe('002');
    expect(line.substring(108, 114)).toBe('050426');
  });
});

describe('generate075 (transaction record)', () => {
  it('produces a 128-char line starting with 075', () => {
    const output = generateAboUtf8(testMeta, [testTx], { includeAv: false });
    const lines = output.split('\r\n').filter(l => l.length > 0);
    expect(lines).toHaveLength(2); // 074 + 075
    expect(lines[1]).toHaveLength(128);
    expect(lines[1].substring(0, 3)).toBe('075');
  });

  it('contains correct our account (standard format)', () => {
    const output = generateAboUtf8(testMeta, [testTx], { includeAv: false });
    const line = output.split('\r\n')[1];
    expect(line.substring(3, 19)).toBe('0000002900123451');
  });

  it('contains correct counterpart account (standard format)', () => {
    const output = generateAboUtf8(testMeta, [testTx], { includeAv: false });
    const line = output.split('\r\n')[1];
    expect(line.substring(19, 35)).toBe('0000001234567899');
  });

  it('contains correct document number', () => {
    const output = generateAboUtf8(testMeta, [testTx], { includeAv: false });
    const line = output.split('\r\n')[1];
    expect(line.substring(35, 48)).toBe('0200100300402');
  });

  it('contains correct amount and posting code', () => {
    const output = generateAboUtf8(testMeta, [testTx], { includeAv: false });
    const line = output.split('\r\n')[1];
    // Amount (absolute): 18870918
    expect(line.substring(48, 60)).toBe('000018870918');
    // Credit
    expect(line[60]).toBe('2');
  });

  it('uses posting code 1 for debit', () => {
    const debitTx: Transaction = { ...testTx, amount: -18000000 };
    const output = generateAboUtf8(testMeta, [debitTx], { includeAv: false });
    const line = output.split('\r\n')[1];
    expect(line[60]).toBe('1');
  });

  it('contains correct VS and KS field (00 + bank + KS)', () => {
    const output = generateAboUtf8(testMeta, [testTx], { includeAv: false });
    const line = output.split('\r\n')[1];
    // VS (10 chars)
    expect(line.substring(61, 71)).toBe('0002025101');
    // KS field (10 chars): 00 + bank code + constant symbol
    expect(line.substring(71, 73)).toBe('00');
    expect(line.substring(73, 77)).toBe('0300');
    expect(line.substring(77, 81)).toBe('0558');
  });

  it('contains correct date and counterpart name', () => {
    const output = generateAboUtf8(testMeta, [testTx], { includeAv: false });
    const line = output.split('\r\n')[1];
    expect(line.substring(91, 97)).toBe('090425');
    expect(line.substring(97, 117)).toBe('KVITKO S.R.O.       ');
  });

  it('ends with change code, data type, and due date', () => {
    const output = generateAboUtf8(testMeta, [testTx], { includeAv: false });
    const line = output.split('\r\n')[1];
    expect(line.substring(117, 118)).toBe('0');
    expect(line.substring(118, 122)).toBe('1101');
    expect(line.substring(122, 128)).toBe('090425');
  });
});

describe('generate078/079 (AV records)', () => {
  it('includes 078 record when AV is enabled', () => {
    const output = generateAboUtf8(testMeta, [testTx], { includeAv: true });
    const lines = output.split('\r\n').filter(l => l.length > 0);
    const av078 = lines.filter(l => l.startsWith('078'));
    expect(av078).toHaveLength(1);
    expect(av078[0]).toHaveLength(128);
  });

  it('078 contains counterpart name and details', () => {
    const output = generateAboUtf8(testMeta, [testTx], { includeAv: true });
    const lines = output.split('\r\n').filter(l => l.length > 0);
    const av078 = lines.find(l => l.startsWith('078'))!;
    const avText = av078.substring(3, 73).trimEnd();
    expect(avText).toContain('KVITKO S.R.O.');
    expect(avText).toContain('2025101/0558/0/11/045923A/O KVITKO');
  });

  it('generates 079 when AV text exceeds 70 chars', () => {
    const longTx: Transaction = {
      ...testTx,
      counterpartName: 'Very Long Company Name That Takes Space',
      details: ['Detail line one with enough text', 'Detail line two to push past seventy characters limit'],
    };
    const output = generateAboUtf8(testMeta, [longTx], { includeAv: true });
    const lines = output.split('\r\n').filter(l => l.length > 0);
    const av079 = lines.filter(l => l.startsWith('079'));
    expect(av079).toHaveLength(1);
    expect(av079[0]).toHaveLength(128);
  });

  it('does not include AV records when disabled', () => {
    const output = generateAboUtf8(testMeta, [testTx], { includeAv: false });
    const lines = output.split('\r\n').filter(l => l.length > 0);
    expect(lines.filter(l => l.startsWith('078'))).toHaveLength(0);
    expect(lines.filter(l => l.startsWith('079'))).toHaveLength(0);
  });
});

describe('generateAbo (Windows-1250 output)', () => {
  it('returns a Buffer', () => {
    const result = generateAbo(testMeta, [testTx], { includeAv: false });
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it('encodes Czech characters in Windows-1250', () => {
    const tx: Transaction = {
      ...testTx,
      counterpartName: 'Svoboda říční',
    };
    const buf = generateAbo(testMeta, [tx], { includeAv: false });
    const decoded = iconv.decode(buf, 'win1250');
    expect(decoded).toContain('Svoboda říční');
  });

  it('uses CRLF line endings', () => {
    const buf = generateAbo(testMeta, [testTx], { includeAv: false });
    const decoded = iconv.decode(buf, 'win1250');
    expect(decoded).toContain('\r\n');
    expect(decoded.split('\r\n').filter(l => l.length > 0).length).toBe(2);
  });

  it('every line is exactly 128 chars', () => {
    const buf = generateAbo(testMeta, [testTx]);
    const decoded = iconv.decode(buf, 'win1250');
    const lines = decoded.split('\r\n').filter(l => l.length > 0);
    for (const line of lines) {
      expect(line).toHaveLength(128);
    }
  });
});

describe('prefix account formatting in 075', () => {
  it('formats prefix account 502-88776654 in standard format with correct bank code', () => {
    const tx: Transaction = {
      ...testTx,
      counterpartAccount: { prefix: '502', number: '88776654', bankCode: '0100' },
    };
    const output = generateAboUtf8(testMeta, [tx], { includeAv: false });
    const line = output.split('\r\n')[1];
    expect(line.substring(19, 35)).toBe('0005020088776654');
    expect(line.substring(73, 77)).toBe('0100');
  });

  it('formats prefix account 2014-55443327 in standard format', () => {
    const tx: Transaction = {
      ...testTx,
      counterpartAccount: { prefix: '2014', number: '55443327', bankCode: '0100' },
    };
    const output = generateAboUtf8(testMeta, [tx], { includeAv: false });
    const line = output.split('\r\n')[1];
    expect(line.substring(19, 35)).toBe('0020140055443327');
  });

  it('uses internal (permuted) format when useInternalFormat=true', () => {
    const tx: Transaction = {
      ...testTx,
      counterpartAccount: { prefix: '502', number: '88776654', bankCode: '0100' },
    };
    const output = generateAboUtf8(testMeta, [tx], { includeAv: false, useInternalFormat: true });
    const line = output.split('\r\n')[1];
    expect(line.substring(19, 35)).toBe('4657008876000502');
  });
});
