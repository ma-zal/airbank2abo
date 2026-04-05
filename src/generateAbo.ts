import * as iconv from 'iconv-lite';
import { Transaction, StatementMetadata, AccountNumber } from './parseTxt';

/**
 * Convert 16-char standard account format (PPPPPPCCCCCCCCCC) to internal
 * (permuted) format used by older Money S3 ABO drivers and Česká spořitelna.
 *
 * Standard: P0 P1 P2 P3 P4 P5 C0 C1 C2 C3 C4 C5 C6 C7 C8 C9
 * Internal: C9 C7 C8 C5 C0 C1 C2 C3 C4 C6 P0 P1 P2 P3 P4 P5
 */
const INTERNAL_PERM = [15, 13, 14, 11, 6, 7, 8, 9, 10, 12, 0, 1, 2, 3, 4, 5];

export function standardToInternal(std: string): string {
  return INTERNAL_PERM.map(i => std[i]).join('');
}

/**
 * Format account number as 16-char ABO field: PPPPPPCCCCCCCCCC.
 * When useInternalFormat=true, applies permutation for older drivers.
 */
export function formatAccountNumber16(acct: AccountNumber, useInternalFormat = false): string {
  const prefix = (acct.prefix || '').padStart(6, '0');
  const number = acct.number.padStart(10, '0');
  const standard = prefix + number;
  return useInternalFormat ? standardToInternal(standard) : standard;
}

/**
 * Format our own account number as 16-char field.
 * When useInternalFormat=true, applies permutation for older drivers.
 */
export function formatOwnAccount16(accountNumber: string, useInternalFormat = false): string {
  const standard = accountNumber.padStart(16, '0');
  return useInternalFormat ? standardToInternal(standard) : standard;
}

/**
 * Format date as DDMMYY.
 */
export function formatDateDDMMYY(dateStr: string): string {
  // dateStr is YYYY-MM-DD
  const [y, m, d] = dateStr.split('-');
  return d + m + y.slice(2);
}

/**
 * Format amount in haléře as zero-padded string of given length.
 * Always uses absolute value.
 */
export function formatAmount(halere: number, length: number): string {
  return Math.abs(halere).toString().padStart(length, '0');
}

/**
 * Pad string to given length with spaces on the right, truncating if needed.
 */
function padRight(str: string, length: number): string {
  return str.substring(0, length).padEnd(length, ' ');
}

/**
 * Pad string to given length with zeros on the left, truncating from the left if needed.
 */
function padLeft(str: string, length: number): string {
  return str.substring(0, length).padStart(length, '0');
}

/**
 * Generate ABO record 074 (header).
 * Total: 128 chars.
 */
function generate074(meta: StatementMetadata, useInternalFormat: boolean): string {
  const parts: string[] = [];

  // 1-3: Record type
  parts.push('074');
  // 4-19: Account number (16 chars)
  parts.push(formatOwnAccount16(meta.accountNumber, useInternalFormat));
  // 20-39: Account name (20 chars, space-padded)
  parts.push(padRight(meta.accountName, 20));
  // 40-45: Old balance date (DDMMYY)
  parts.push(formatDateDDMMYY(meta.periodFrom));
  // 46-59: Old balance in haléře (14 digits)
  parts.push(formatAmount(meta.openingBalance, 14));
  // 60: Old balance sign
  parts.push(meta.openingBalance >= 0 ? '+' : '-');
  // 61-74: New balance in haléře (14 digits)
  parts.push(formatAmount(meta.closingBalance, 14));
  // 75: New balance sign
  parts.push(meta.closingBalance >= 0 ? '+' : '-');
  // 76-89: Debit turnover (14 digits)
  parts.push(formatAmount(meta.totalDebit, 14));
  // 90: Debit sign
  parts.push('0');
  // 91-104: Credit turnover (14 digits)
  parts.push(formatAmount(meta.totalCredit, 14));
  // 105: Credit sign
  parts.push('0');
  // 106-108: Statement sequence number (3 digits)
  parts.push(meta.statementNumber.toString().padStart(3, '0'));
  // 109-114: Statement date (DDMMYY)
  parts.push(formatDateDDMMYY(meta.statementDate));
  // 115-128: Filler (14 spaces)
  parts.push(' '.repeat(14));

  const line = parts.join('');
  if (line.length !== 128) {
    throw new Error(`074 record has ${line.length} chars, expected 128`);
  }
  return line;
}

/**
 * Generate ABO record 075 (transaction).
 * Total: 128 chars.
 */
function generate075(tx: Transaction, ownAccountNumber: string, useInternalFormat: boolean): string {
  const parts: string[] = [];

  // 1-3: Record type
  parts.push('075');
  // 4-19: Our account number (16 chars)
  parts.push(formatOwnAccount16(ownAccountNumber, useInternalFormat));
  // 20-35: Counterpart account number (16 chars)
  parts.push(formatAccountNumber16(tx.counterpartAccount, useInternalFormat));
  // 36-48: Document number / transaction code (13 chars)
  parts.push(padLeft(tx.transactionCode, 13));
  // 49-60: Amount in haléře (12 digits, absolute value)
  parts.push(formatAmount(tx.amount, 12));
  // 61: Posting code: 1=debit, 2=credit
  parts.push(tx.amount < 0 ? '1' : '2');
  // 62-71: Variable symbol (10 chars, zero-padded)
  parts.push(padLeft(tx.vs, 10));
  // 72-81: Combined KS field (10 chars): 00 + bank code (4) + constant symbol (4)
  // Bank code is at "5th-8th position from right", KS at "1st-4th from right"
  parts.push('00');
  parts.push(padLeft(tx.counterpartAccount.bankCode, 4));
  parts.push(padLeft(tx.ks, 4));
  // 82-91: Specific symbol (10 chars)
  parts.push(padLeft(tx.ss, 10));
  // 92-97: Value date (DDMMYY)
  parts.push(formatDateDDMMYY(tx.datePosted));
  // 98-117: Counterpart name (20 chars, space-padded)
  parts.push(padRight(tx.counterpartName, 20));
  // 118: Change code
  parts.push('0');
  // 119-122: Type of data (CZK payment)
  parts.push('1101');
  // 123-128: Due date (same as value date — some drivers read date from here)
  parts.push(formatDateDDMMYY(tx.datePosted));

  const line = parts.join('');
  if (line.length !== 128) {
    throw new Error(`075 record has ${line.length} chars, expected 128`);
  }
  return line;
}

/**
 * Generate ABO record 078 (extended AV field, part 1).
 * Total: 128 chars.
 */
function generate078(avText: string): string {
  const parts: string[] = [];
  parts.push('078');
  parts.push(padRight(avText.substring(0, 70), 70));
  parts.push(' '.repeat(55));

  const line = parts.join('');
  if (line.length !== 128) {
    throw new Error(`078 record has ${line.length} chars, expected 128`);
  }
  return line;
}

/**
 * Generate ABO record 079 (extended AV field, part 2).
 * Total: 128 chars.
 */
function generate079(avText: string): string {
  const parts: string[] = [];
  parts.push('079');
  parts.push(padRight(avText, 70));
  parts.push(' '.repeat(55));

  const line = parts.join('');
  if (line.length !== 128) {
    throw new Error(`079 record has ${line.length} chars, expected 128`);
  }
  return line;
}

/**
 * Build AV text from transaction details.
 */
function buildAvText(tx: Transaction): string {
  const parts: string[] = [];
  if (tx.counterpartName) parts.push(tx.counterpartName);
  parts.push(...tx.details);
  return parts.join(' ');
}

export interface GenerateAboOptions {
  includeAv?: boolean;          // include 078/079 records (default: true)
  useInternalFormat?: boolean;  // permuted account numbers for older drivers (default: false)
}

/**
 * Generate complete ABO/GPC file content.
 * Returns a Buffer in Windows-1250 encoding.
 */
export function generateAbo(
  meta: StatementMetadata,
  transactions: Transaction[],
  options: GenerateAboOptions = {}
): Buffer {
  const includeAv = options.includeAv !== false;
  const internal = options.useInternalFormat === true;
  const lines: string[] = [];

  lines.push(generate074(meta, internal));

  for (const tx of transactions) {
    lines.push(generate075(tx, meta.accountNumber, internal));

    if (includeAv) {
      const avText = buildAvText(tx);
      if (avText.trim()) {
        lines.push(generate078(avText));
        if (avText.length > 70) {
          lines.push(generate079(avText.substring(70, 140)));
        }
      }
    }
  }

  const content = lines.join('\r\n') + '\r\n';
  return iconv.encode(content, 'win1250');
}

/**
 * Generate ABO as UTF-8 string (for debugging).
 */
export function generateAboUtf8(
  meta: StatementMetadata,
  transactions: Transaction[],
  options: GenerateAboOptions = {}
): string {
  const includeAv = options.includeAv !== false;
  const internal = options.useInternalFormat === true;
  const lines: string[] = [];

  lines.push(generate074(meta, internal));

  for (const tx of transactions) {
    lines.push(generate075(tx, meta.accountNumber, internal));

    if (includeAv) {
      const avText = buildAvText(tx);
      if (avText.trim()) {
        lines.push(generate078(avText));
        if (avText.length > 70) {
          lines.push(generate079(avText.substring(70, 140)));
        }
      }
    }
  }

  return lines.join('\r\n') + '\r\n';
}
