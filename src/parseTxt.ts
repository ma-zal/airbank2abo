export interface AccountNumber {
  prefix: string;
  number: string;
  bankCode: string;
}

export interface Transaction {
  datePosted: string;    // YYYY-MM-DD
  dateExecuted: string;  // YYYY-MM-DD
  type: string;          // "Odchozí úhrada", "Příchozí úhrada", "Trvalý příkaz"
  transactionCode: string;
  counterpartName: string;
  counterpartAccount: AccountNumber;
  amount: number;        // in haléře, negative for debits
  fee: number;           // in haléře
  vs: string;            // variabilní symbol
  ks: string;            // konstantní symbol
  ss: string;            // specifický symbol
  details: string[];     // additional detail lines
}

export interface StatementMetadata {
  accountNumber: string;
  bankCode: string;
  accountName: string;
  openingBalance: number;  // haléře
  closingBalance: number;  // haléře
  totalCredit: number;     // haléře
  totalDebit: number;      // haléře
  statementNumber: number;
  statementDate: string;   // YYYY-MM-DD
  periodFrom: string;      // YYYY-MM-DD
  periodTo: string;        // YYYY-MM-DD
}

const DATE_RE = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const AMOUNT_RE = /(-?\d{1,3}(?: \d{3})*,\d{2})\s+(\d{1,3}(?: \d{3})*,\d{2})$/;
const ACCOUNT_RE = /^(\d{1,6}-)?(\d{1,10})\s*\/\s*(\d{4})$/;
const TRANSACTION_CODE_RE = /^(\d{9,15})\s*(.*)$/;
const VS_KS_RE = /VS(\d+)(?:\s*\/\s*KS(\d+))?/;
const TYPE_VALUES = ['Odchozí úhrada', 'Příchozí úhrada', 'Trvalý příkaz'];

export function parseDate(dateStr: string): string {
  const m = dateStr.match(DATE_RE);
  if (!m) throw new Error(`Invalid date: ${dateStr}`);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function parseAmount(amountStr: string): number {
  // "188 709,18" -> 18870918 (haléře)
  // "-180 000,00" -> -18000000
  const cleaned = amountStr.replace(/\s/g, '').replace(',', '.');
  return Math.round(parseFloat(cleaned) * 100);
}

export function parseAccountString(str: string): AccountNumber | null {
  // Handle formats:
  // "2900789018 / 5500"
  // "502-88776654 / 0100"
  // "2014-55443327 / 0100"
  const trimmed = str.trim();
  const m = trimmed.match(ACCOUNT_RE);
  if (!m) return null;
  return {
    prefix: m[1] ? m[1].replace('-', '') : '',
    number: m[2],
    bankCode: m[3],
  };
}

function isDate(line: string): boolean {
  return DATE_RE.test(line.trim());
}

function isType(line: string): boolean {
  return TYPE_VALUES.includes(line.trim());
}

export function extractAmountFromLine(line: string): { amount: number; fee: number; textBefore: string } | null {
  const m = line.match(AMOUNT_RE);
  if (!m) return null;
  return {
    amount: parseAmount(m[1]),
    fee: parseAmount(m[2]),
    textBefore: line.substring(0, m.index!).trim(),
  };
}

interface RawBlock {
  lines: string[];
}

function splitIntoBlocks(lines: string[]): RawBlock[] {
  const blocks: RawBlock[] = [];
  let currentStart = -1;

  for (let i = 0; i < lines.length; i++) {
    if (isDate(lines[i]) && i + 1 < lines.length && isDate(lines[i + 1])) {
      if (currentStart >= 0) {
        blocks.push({ lines: lines.slice(currentStart, i) });
      }
      currentStart = i;
    }
  }
  // Last block
  if (currentStart >= 0) {
    blocks.push({ lines: lines.slice(currentStart) });
  }
  return blocks;
}

function parseBlock(block: RawBlock): Transaction {
  const lines = block.lines.map(l => l.trim()).filter(l => l.length > 0);

  // First two lines are dates
  const datePosted = parseDate(lines[0]);
  const dateExecuted = parseDate(lines[1]);

  // Third line is type
  const type = lines[2];
  if (!isType(type)) {
    throw new Error(`Expected transaction type, got: "${type}"`);
  }

  // Find amount line (last line or line ending with amount pattern)
  let amountLineIdx = -1;
  let amountInfo: { amount: number; fee: number; textBefore: string } | null = null;
  for (let i = lines.length - 1; i >= 3; i--) {
    amountInfo = extractAmountFromLine(lines[i]);
    if (amountInfo) {
      amountLineIdx = i;
      break;
    }
  }
  if (!amountInfo || amountLineIdx < 0) {
    throw new Error(`No amount found in block starting at date ${datePosted}`);
  }

  // Middle lines (between type and amount) contain: transaction code, account, VS/KS, details
  const middleLines = lines.slice(3, amountLineIdx);
  // If amount line had text before it, add that text too
  if (amountInfo.textBefore) {
    middleLines.push(amountInfo.textBefore);
  }

  let transactionCode = '';
  let counterpartAccount: AccountNumber = { prefix: '', number: '', bankCode: '' };
  let counterpartName = '';
  let vs = '';
  let ks = '';
  let ss = '';
  const details: string[] = [];

  let codeAndAccountParsed = false;

  for (let i = 0; i < middleLines.length; i++) {
    const line = middleLines[i];

    // Try to parse transaction code (first numeric-heavy line after type)
    if (!codeAndAccountParsed) {
      const codeMatch = line.match(TRANSACTION_CODE_RE);
      if (codeMatch && codeMatch[1].length >= 9) {
        transactionCode = codeMatch[1];
        const rest = codeMatch[2].trim();
        if (rest) {
          // Code + account on same line: "200100300403 502-88776654 / 0100"
          const acct = parseAccountString(rest);
          if (acct) {
            counterpartAccount = acct;
          }
        }
        codeAndAccountParsed = true;
        continue;
      }
    }

    // Try to parse account number
    const acct = parseAccountString(line);
    if (acct) {
      counterpartAccount = acct;
      continue;
    }

    // Try to parse VS/KS
    const vsKsMatch = line.match(VS_KS_RE);
    if (vsKsMatch) {
      vs = vsKsMatch[1] || vs;
      ks = vsKsMatch[2] || ks;
      // There might be more text on this line (but amount already stripped)
      continue;
    }

    // Everything else is either a name or detail
    details.push(line);
  }

  // Heuristic: first detail line that looks like a name (not a VS/KS, not description-like)
  // is the counterpart name. In some transactions the name comes before the account.
  if (details.length > 0 && !counterpartName) {
    counterpartName = details.shift()!;
  }

  return {
    datePosted,
    dateExecuted,
    type,
    transactionCode,
    counterpartName,
    counterpartAccount,
    amount: amountInfo.amount,
    fee: amountInfo.fee,
    vs,
    ks,
    ss,
    details,
  };
}

export function parseTxt(content: string): Transaction[] {
  const allLines = content.split(/\r?\n/);

  // Skip header lines (first 6 lines are column headers)
  // Find the first date line to determine where data starts
  let dataStart = 0;
  for (let i = 0; i < allLines.length; i++) {
    if (isDate(allLines[i].trim()) && i + 1 < allLines.length && isDate(allLines[i + 1].trim())) {
      dataStart = i;
      break;
    }
  }

  const dataLines = allLines.slice(dataStart);
  const blocks = splitIntoBlocks(dataLines);
  return blocks.map(block => parseBlock(block));
}
