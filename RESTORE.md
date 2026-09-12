# EXACT V26 Liga — odtwórz na nowej karcie

Repo: **https://github.com/Kubimar81/exact-v26-1109**
Lustrzane: https://github.com/Kubimar81/exact-v26-0909

Wersja: **12.09.2026** · sitko kuponu 2×2 · 1:0 / 0:1 · silnik HOLD.

## Co powiedzieć na nowej karcie

```
Przywróć program. Na bazie pliku z GitHuba. Kubimar81/exact-v26-1109
V26 Liga 12.09.2026. Standard: 1B OUT, pulpit bez listy dnia,
Archiwum 2 h po HIT/MISS, sitko kuponu 2×2 (CORE 1:0/0:1 + BTTS NIE albo U2.5).
Silnik K0–K18 HOLD.
```

Albo krótko:

```
Przywróć program z GitHuba Kubimar81/exact-v26-1109 — V26 Liga standard 12.09.2026
```

## Ten standard

| | |
|---|---|
| Selekcja | 12.09 · sitko kuponu 2×2 · CORE 1:0/0:1 · BTTS NIE albo U2.5 · 1B OUT |
| Pulpit | bez listy dnia, bez szablonów meczów — kartę dodajesz sam |
| Archiwum | 2 h po HIT/MISS, plik zostaje, da się otworzyć / wyciągnąć |
| Silnik | K0–K18 HOLD — nie patchować z Tabeli 23 ani Archiwum |

## Test zapisu

Po wypchnięciu GitHub musi mieć:

- `src/routes/selekcja.tsx` → `Po K18 — sitko kuponu 2×2` · `BTTS NIE` · `1b OUT`
- `STANDARD_SELEKCJI.md` → `najlepsze mecze pod 1:0 / 0:1`
- `src/lib/v26/archive-ttl.ts` → `ARCHIVE_AFTER_WNIOSEK_MS = 2 * 60 * 60 * 1000`
- `src/routes/index.tsx` → `Lista dnia nie jest w programie`
- `src/routes/dzis.tsx` → `redirect({ to: "/" })`
