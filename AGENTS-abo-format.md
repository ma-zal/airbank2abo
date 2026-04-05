# ABO/GPC format (`src/generateAbo.ts`)

Format ABO (Automaticke Bankovni Operace), take znamy jako GPC, je cesky bankovni standard s pevnou delkou zaznamu. Kazdy radek ma presne 128 znaku, kodovani Windows-1250, konce radku CRLF.

## Typy zaznamu

### 074 -- Hlavicka vypisu

| Pozice | Delka | Obsah |
|--------|-------|-------|
| 1-3 | 3 | `074` |
| 4-19 | 16 | Cislo uctu (PPPPPPCCCCCCCCCC, nuly zleva) |
| 20-39 | 20 | Nazev uctu (mezery zprava) |
| 40-45 | 6 | Datum stareho zustatku (DDMMYY) |
| 46-59 | 14 | Stary zustatek v halerich (nuly zleva) |
| 60 | 1 | Znamenko `+` nebo `-` |
| 61-74 | 14 | Novy zustatek v halerich |
| 75 | 1 | Znamenko `+` nebo `-` |
| 76-89 | 14 | Obrat MD (debety) v halerich |
| 90 | 1 | `0` |
| 91-104 | 14 | Obrat DAL (kredity) v halerich |
| 105 | 1 | `0` |
| 106-108 | 3 | Cislo vypisu |
| 109-114 | 6 | Datum vypisu (DDMMYY) |
| 115-128 | 14 | Mezery (filler pro sjednoceni delky s 075) |

Poznamka: Kod banky vlastniho uctu neni soucasti standardniho ABO formatu. Nastavuje se v konfiguraci Money S3 (homebanking). Komercni banka ma nestandardni rozsireni (IBAN prefix na pozicich 115-122), ale Money S3 ho nevyuziva.

### 075 -- Transakce

| Pozice | Delka | Obsah |
|--------|-------|-------|
| 1-3 | 3 | `075` |
| 4-19 | 16 | Cislo naseho uctu |
| 20-35 | 16 | Cislo protiuctu |
| 36-48 | 13 | Cislo dokladu (kod transakce) |
| 49-60 | 12 | Castka v halerich (absolutni hodnota) |
| 61 | 1 | `1` = debet, `2` = kredit |
| 62-71 | 10 | Variabilni symbol (nuly zleva) |
| 72-73 | 2 | `00` (padding) |
| 74-77 | 4 | Kod banky protiuctu (5.-8. pozice zprava v 10-znakovem KS poli) |
| 78-81 | 4 | Konstantni symbol (1.-4. pozice zprava) |
| 82-91 | 10 | Specificky symbol |
| 92-97 | 6 | Datum zauctovani (DDMMYY) |
| 98-117 | 20 | Nazev protistrany (mezery zprava) |
| 118 | 1 | `0` (kod zmeny) |
| 119-122 | 4 | `1101` (CZK, platba) |
| 123-128 | 6 | `000000` (datum splatnosti) |

### 078 -- Rozsirene AV pole, cast 1

| Pozice | Delka | Obsah |
|--------|-------|-------|
| 1-3 | 3 | `078` |
| 4-73 | 70 | Text AV (nazev protistrany + detaily) |
| 74-128 | 55 | Mezery |

### 079 -- Rozsirene AV pole, cast 2

Stejna struktura jako 078. Generuje se pouze pokud text AV presahuje 70 znaku.

## Format cisla uctu (16 znaku)

### Standardni format (default)

```
PPPPPPCCCCCCCCCC
```
- P = predcisli (6 cislic, nuly zleva)
- C = cislo uctu (10 cislic, nuly zleva)

Priklady:
| Vstup | 16-znakovy format |
|-------|-------------------|
| `2900789018 / 5500` | `0000002900789018` |
| `502-88776654 / 0100` | `0005020088776654` |
| `2014-55443327 / 0100` | `0020140055443327` |

### Interni (permutovany) format (`--internal-format`)

Pouziva se starsimi ovladaci Money S3 a Ceskou sporitelnou. Permutace:

```
Standard: P0 P1 P2 P3 P4 P5 C0 C1 C2 C3 C4 C5 C6 C7 C8 C9
Interni:  C9 C7 C8 C5 C0 C1 C2 C3 C4 C6 P0 P1 P2 P3 P4 P5
```

Implementovano v `standardToInternal()` s permutacni tabulkou `[15,13,14,11,6,7,8,9,10,12,0,1,2,3,4,5]`.

Kod banky se do 16-znakoveho pole nevklada -- v zaznamu 075 je na pozicich 74-77 (v ramci 10-znakoveho KS pole).

## Castky

Vsechny castky jsou v **halerich** (setiny CZK), celociselne, doplnene nulami zleva. Napr. 199 348,36 CZK = `00000019934836`.

## Kodovani vystupu

- `generateAbo()` -- vraci `Buffer` v Windows-1250 (pro zapis do souboru)
- `generateAboUtf8()` -- vraci `string` v UTF-8 (pro debug vypis na stdout)
