# EXACT V26 Liga — odtwórz na nowej karcie

Repo: **https://github.com/Kubimar81/exact-v26-1109**
Lustrzane: https://github.com/Kubimar81/exact-v26-0909

Wersja: **11.09.2026 (wieczór)** · standard 11 września · silnik HOLD.

## Co powiedzieć na nowej karcie

```
Przywróć program. Na bazie pliku z GitHuba. Kubimar81/exact-v26-1109
V26 Liga 11.09.2026. Standard 11 września: 1B OUT, pulpit bez listy dnia,
Archiwum 2 h po HIT/MISS. Silnik K0–K18 HOLD.
```

Albo krótko:

```
Przywróć program z GitHuba Kubimar81/exact-v26-1109 — V26 Liga standard 11.09.2026
```

## Ten standard (nie mylić z 09.09 rano)

| | |
|---|---|
| Selekcja | 11.09 · 1B OUT · Conf nie tnie · sitko 1.40–1.75 |
| Pulpit | bez listy dnia, bez szablonów meczów — kartę dodajesz sam |
| Archiwum | 2 h po HIT/MISS, plik zostaje, da się otworzyć / wyciągnąć |
| Silnik | K0–K18 HOLD — nie patchować z Tabeli 23 ani Archiwum |

## Test zapisu

Po wypchnięciu GitHub musi mieć:

- `src/lib/v26/archive-ttl.ts` → `ARCHIVE_AFTER_WNIOSEK_MS = 2 * 60 * 60 * 1000`
- `src/routes/index.tsx` → `Lista dnia nie jest w programie`
- `src/routes/selekcja.tsx` → `1b OUT` / `11.09.2026`
- `src/routes/dzis.tsx` → `redirect({ to: "/" })`
