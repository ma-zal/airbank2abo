# Parser TXT vypisu (`src/parseTxt.ts`)

## Vstupni format

TXT soubor vznikly copy-paste z PDF vypisu AirBank. Prvnich 6 radku je hlavicka (nazvy sloupcu), nasleduji bloky transakci.

## Algoritmus parsovani

### 1. Nalezeni zacatku dat

Preskoci hlavicku -- hleda prvni par po sobe jdoucich radku s datumy (DD.MM.YYYY).

### 2. Rozdeleni na bloky (`splitIntoBlocks`)

Kazda transakce zacina dvema po sobe jdoucimi radky s datumy (zauctovani + provedeni). Text mezi dvema takovymi pary tvori jeden blok.

### 3. Parsovani bloku (`parseBlock`)

Struktura bloku:
```
DD.MM.YYYY                          <- datum zauctovani
DD.MM.YYYY                          <- datum provedeni
Typ transakce                       <- "Odchozi uhrada" / "Prichozi uhrada" / "Trvaly prikaz"
<stredni radky>                     <- kod, ucet, VS/KS, detaily
<castka> <poplatek>                 <- posledni radek (nebo konec radku)
```

Stredni radky se zpracuji v poradi:
1. **Kod transakce** -- prvni radek zacinajici 9+ ciframi. Muze obsahovat i ucet na stejnem radku.
2. **Cislo uctu** -- match na `cislo / kod_banky` nebo `predcisli-cislo / kod_banky`
3. **VS/KS** -- match na `VS\d+` volitelne `/ KS\d+`
4. **Ostatni** -- prvni nerozpoznany radek = nazev protistrany, zbytek = detaily

### Klicove okrajove pripady

| Pripad | Priklad | Reseni |
|--------|---------|--------|
| Kod + ucet na jednom radku | `200100300403 502-88776654 / 0100` | Regex `TRANSACTION_CODE_RE` zachyti kod, zbytek se parsuje jako ucet |
| VS/KS + castka na jednom radku | `VS1234567890 / KS558 5 412,00 0,00` | `AMOUNT_RE` matchne castku na konci, `textBefore` se parsuje dal |
| Popis + castka na jednom radku | `Vklad podnikatele 50 000,00 0,00` | Stejny mechanismus jako VS/KS -- `textBefore` se prida k detailum |
| Ucet s predcislim | `2014-55443327 / 0100` | `ACCOUNT_RE` zachyti volitelne `predcisli-` |

### Regularne vyrazy

| Nazev | Pattern | Ucel |
|-------|---------|------|
| `DATE_RE` | `^\d{2}\.\d{2}\.\d{4}$` | Datum DD.MM.YYYY |
| `AMOUNT_RE` | `(-?\d{1,3}(?: \d{3})*,\d{2})\s+(\d{1,3}(?: \d{3})*,\d{2})$` | Castka + poplatek na konci radku. Striktni tisicove skupiny (1-3 cifry, pak vzdy 3) -- zabranuje slepeni KS cisla s castkou |
| `ACCOUNT_RE` | `^(\d{1,6}-)?(\d{1,10})\s*/\s*(\d{4})$` | Cislo uctu s volitelnym predcislim |
| `TRANSACTION_CODE_RE` | `^(\d{9,15})\s*(.*)$` | Kod transakce (9-15 cislic) + volitelny zbytek |
| `VS_KS_RE` | `VS(\d+)(?:\s*/\s*KS(\d+))?` | Variabilni a konstantni symbol |

## Vystupni typ `Transaction`

```typescript
{
  datePosted: string;           // "2025-04-03" (YYYY-MM-DD)
  dateExecuted: string;
  type: string;                 // "Odchozi uhrada" | "Prichozi uhrada" | "Trvaly prikaz"
  transactionCode: string;      // "200100300401"
  counterpartName: string;      // "Petr Svoboda"
  counterpartAccount: {
    prefix: string;             // "502" nebo ""
    number: string;             // "88776654"
    bankCode: string;           // "0100"
  };
  amount: number;               // halere, zaporne = debet
  fee: number;                  // halere
  vs: string;                   // variabilni symbol
  ks: string;                   // konstantni symbol
  ss: string;                   // specificky symbol (zatim vzdy prazdny)
  details: string[];            // doplnkove radky popisu
}
```
