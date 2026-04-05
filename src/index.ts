import * as fs from 'fs';
import { Command } from 'commander';
import { parseTxt, Transaction, StatementMetadata } from './parseTxt';
import { generateAbo, generateAboUtf8 } from './generateAbo';

// Only these need to be provided manually
const ACCOUNT_NUMBER = '2900123451';
const BANK_CODE = '5500';
const ACCOUNT_NAME = 'Podnikani';

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function buildMetadata(transactions: Transaction[], openingBalance: number): StatementMetadata {
  let totalDebit = 0;
  let totalCredit = 0;
  for (const tx of transactions) {
    if (tx.amount < 0) {
      totalDebit += Math.abs(tx.amount);
    } else {
      totalCredit += tx.amount;
    }
  }

  const dates = transactions.map(tx => tx.datePosted).sort();
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];

  const [firstY, firstM] = firstDate.split('-').map(Number);
  const [lastY, lastM] = lastDate.split('-').map(Number);

  const periodFrom = `${firstY}-${String(firstM).padStart(2, '0')}-01`;
  const lastDay = lastDayOfMonth(lastY, lastM);
  const periodTo = `${lastY}-${String(lastM).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const statementDate = periodTo;
  const statementNumber = lastM;
  const closingBalance = openingBalance + totalCredit - totalDebit;

  return {
    accountNumber: ACCOUNT_NUMBER,
    bankCode: BANK_CODE,
    accountName: ACCOUNT_NAME,
    openingBalance,
    closingBalance,
    totalCredit,
    totalDebit,
    statementNumber,
    statementDate,
    periodFrom,
    periodTo,
  };
}

const program = new Command();

program
  .name('airbank2abo')
  .description('AirBank bank statement to ABO/GPC converter for Money S3')
  .argument('<input>', 'Input TXT file (copy-paste from AirBank PDF)')
  .requiredOption('--opening-balance <halere>', 'Opening balance in halere (e.g. 19934836 for 199348.36 CZK)', parseInt)
  .option('--output <file>', 'Write output to file (default: stdout or .gpc)')
  .option('--json', 'Output parsed transactions as JSON')
  .option('--filter <M-YYYY>', 'Only include transactions from given month (e.g. 4-2025)')
  .option('--no-av', 'Skip 078/079 AV records')
  .option('--internal-format', 'Use permuted account numbers (for older Money S3 ABO drivers)')
  .action((inputFile: string, opts) => {
    if (isNaN(opts.openingBalance)) {
      console.error('Error: --opening-balance must be a number');
      process.exit(1);
    }

    const content = fs.readFileSync(inputFile, 'utf-8');
    let transactions = parseTxt(content);

    console.error(`Parsed ${transactions.length} transactions`);

    // Apply month filter
    if (opts.filter) {
      const filterMatch = opts.filter.match(/^(\d{1,2})-(\d{4})$/);
      if (!filterMatch) {
        console.error('Error: --filter must be in format M-YYYY (e.g. 3-2025)');
        process.exit(1);
      }
      const filterMonth = parseInt(filterMatch[1], 10);
      const filterYear = parseInt(filterMatch[2], 10);
      transactions = transactions.filter(tx => {
        const [y, m] = tx.datePosted.split('-').map(Number);
        return y === filterYear && m === filterMonth;
      });
      console.error(`Filtered to ${transactions.length} transactions for ${filterMonth}/${filterYear}`);
    }

    if (opts.json) {
      const output = JSON.stringify(transactions, null, 2);
      if (opts.output) {
        fs.writeFileSync(opts.output, output, 'utf-8');
        console.error(`JSON written to ${opts.output}`);
      } else {
        console.log(output);
      }
      return;
    }

    const meta = buildMetadata(transactions, opts.openingBalance);

    console.error(`Period: ${meta.periodFrom} — ${meta.periodTo}`);
    console.error(`Debits:  ${(meta.totalDebit / 100).toFixed(2)} CZK`);
    console.error(`Credits: ${(meta.totalCredit / 100).toFixed(2)} CZK`);
    console.error(`Opening: ${(meta.openingBalance / 100).toFixed(2)} CZK`);
    console.error(`Closing: ${(meta.closingBalance / 100).toFixed(2)} CZK (computed)`);
    console.error(`Statement #${meta.statementNumber}, date: ${meta.statementDate}`);

    const gpcOutputFile = opts.output || inputFile.replace(/\.txt$/i, '.gpc');
    const includeAv = opts.av !== false;
    const useInternalFormat = opts.internalFormat === true;

    if (opts.output || !process.stdout.isTTY) {
      const buffer = generateAbo(meta, transactions, { includeAv, useInternalFormat });
      fs.writeFileSync(gpcOutputFile, buffer);
      console.error(`ABO/GPC written to ${gpcOutputFile}`);
    } else {
      const output = generateAboUtf8(meta, transactions, { includeAv, useInternalFormat });
      console.log(output);
    }
  });

program.parse();
