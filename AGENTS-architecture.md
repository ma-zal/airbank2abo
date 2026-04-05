# Architektura airbank2abo

Aplikace konvertuje bankovni vypis AirBank (copy-paste TXT z PDF) do formatu ABO/GPC pro import do Money S3.

## Datovy tok

```
TXT soubor (copy-paste z PDF)
        |
        v
   parseTxt.ts          -- parser, vystup: Transaction[]
        |
        v
   index.ts             -- filtr mesice, buildMetadata(), CLI
        |
        v
   generateAbo.ts       -- generuje 074/075/078/079 zaznamy
        |
        v
   .gpc soubor           -- Windows-1250, 128 znaku/radek, CRLF
```

## Moduly

### `src/parseTxt.ts`

Parser copy-paste TXT formatu z AirBank PDF vypisu. Viz [AGENTS-parser.md](AGENTS-parser.md).

Exportuje:
- `parseTxt(content: string): Transaction[]` -- hlavni vstupni bod
- Pomocne funkce: `parseDate`, `parseAmount`, `parseAccountString`, `extractAmountFromLine`
- Typy: `Transaction`, `AccountNumber`, `StatementMetadata`

### `src/generateAbo.ts`

Generator ABO/GPC formatu. Viz [AGENTS-abo-format.md](AGENTS-abo-format.md).

Exportuje:
- `generateAbo(meta, transactions, options): Buffer` -- vystup v Windows-1250
- `generateAboUtf8(meta, transactions, options): string` -- pro debug/stdout
- Pomocne funkce: `formatAccountNumber16`, `formatOwnAccount16`, `standardToInternal`, `formatDateDDMMYY`, `formatAmount`

Options:
- `includeAv` -- zahrnout 078/079 AV zaznamy (default: true)
- `useInternalFormat` -- permutovane cisla uctu pro starsi ovladace Money S3 (default: false)

### `src/index.ts`

CLI vstupni bod. Zpracuje argumenty, spusti parser, aplikuje filtr, dopocita metadata, vygeneruje vystup.

Hardcoded hodnoty (specificke pro tento ucet):
- `ACCOUNT_NUMBER = '2900123451'`
- `BANK_CODE = '5500'`
- `ACCOUNT_NAME = 'Podnikani'`

Povinny CLI vstup:
- `--opening-balance <halere>` -- pocatecni zustatek

Volitelne CLI parametry:
- `--filter <M-YYYY>` -- filtr na konkretni mesic (napr. `4-2025`)
- `--output <soubor.gpc>` -- vystupni soubor
- `--json` -- vystup jako JSON (debug)
- `--no-av` -- bez 078/079 zaznamu
- `--internal-format` -- permutovane cisla uctu (starsi ovladace)

Pocitane z (filtrovanych) transakci (`buildMetadata()`):
- `periodFrom/periodTo` -- 1. den mesice prvni transakce / posledni den mesice posledni transakce
- `statementDate` -- = periodTo
- `statementNumber` -- mesic z periodTo
- `totalDebit/totalCredit` -- soucet z transakci
- `closingBalance` -- openingBalance + credits - debits

Poradi zpracovani: parse -> filtr -> buildMetadata -> generate. Filtr se aplikuje pred vypoctem metadat, takze cislo vypisu, obdobi a zustatky odpovidaji filtrovane podmnozine.

## Formaty cisel uctu

Aplikace podporuje dva formaty cisel uctu v ABO vystupu:

- **Standardni** (default): `PPPPPPCCCCCCCCCC` -- novy ovladac Money S3
- **Interni/permutovany** (`--internal-format`): permutace pro starsi ovladace

Kod banky vlastniho uctu neni soucasti ABO formatu -- nastavuje se v konfiguraci Money S3.

## Testy

- `src/parseTxt.spec.ts` -- unit testy parseru + integracni testy na fixture i plny soubor
- `src/generateAbo.spec.ts` -- unit testy formatovacich funkci + integracni testy ABO vystupu (oba formaty)
- `tests/fixtures/sample.txt` -- 5 transakci pokryvajicich vsechny varianty

Spusteni: `npm test`
