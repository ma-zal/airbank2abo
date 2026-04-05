# airbank2abo

Konvertor bankovniho vypisu AirBank do formatu ABO/GPC pro import do Money S3.

## Instalace

```bash
npm install
npm run build
```

## Pouziti

```bash
node dist/index.js <vstupni-soubor.txt> --opening-balance <halere> [volby]
```

### Volby

| Volba | Popis |
|-------|-------|
| `--opening-balance <n>` | Pocatecni zustatek v halerich (povinne, napr. 19934836 pro 199348.36 CZK). |
| `--filter <M-YYYY>` | Filtr na konkretni mesic (napr. `4-2025`). Bez filtru se pouziji vsechny transakce. |
| `--output <soubor.gpc>` | Zapise ABO/GPC vystup do souboru. Bez teto volby se vypise na stdout (UTF-8). |
| `--json` | Misto ABO vypise naparsovane transakce jako JSON (pro kontrolu/ladeni). |
| `--no-av` | Vynecha rozsirene AV zaznamy (078/079) ve vystupu. |
| `--internal-format` | Permutovane cisla uctu pro starsi ovladace Money S3. |
| `--help` | Zobrazi napovedu. |

### Priklady

```bash
# Vygenerovat GPC soubor pro Money S3 (vsechny mesice)
node dist/index.js "Vypis...txt" --opening-balance 19934836 --output vypis.gpc

# Jen duben 2025
node dist/index.js "Vypis...txt" --opening-balance 19934836 --filter 4-2025 --output vypis-04.gpc

# Zobrazit naparsovane transakce jako JSON
node dist/index.js "Vypis...txt" --opening-balance 19934836 --json

# Starsi ovladac Money S3 (permutovane ucty)
node dist/index.js "Vypis...txt" --opening-balance 19934836 --internal-format --output vypis.gpc
```

## Vstupni format

Vstupem je TXT soubor ziskany copy-paste z PDF vypisu AirBank. Aplikace ocekava strukturu:
- Hlavicka (nazvy sloupcu, automaticky preskocena)
- Transakce: datum zauctovani, datum provedeni, typ, kod transakce, protistrana, castka

## Vystupni format (ABO/GPC)

- Kodovani: Windows-1250
- Konce radku: CRLF
- Delka radku: 128 znaku
- Zaznamy: 074 (hlavicka), 075 (transakce), 078/079 (rozsirene popisy)
- Pripona: `.gpc`

Cislo uctu a nazev jsou hardcoded v `src/index.ts`. Zustatky, obraty, obdobi a cislo vypisu se pocitaji z (filtrovanych) transakci.

## Testy

```bash
npm test
```
