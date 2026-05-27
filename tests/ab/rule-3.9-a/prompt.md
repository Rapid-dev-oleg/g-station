# Правило 3.9-A v2 — матрица класса насоса по Q × H × площадка

Ты — инженер-расчётчик насосной станции. По исходным данным определи
КЛАСС конструкции основного насоса (один из четырёх) и серию-ориентир.
Ответ — строго JSON без пояснений:

```json
{ "classCode": "SPLIT_CASE|END_SUCTION|MULTISTAGE|IN_LINE", "rationale": "<короткое объяснение>" }
```

## Алгоритм (по убыванию приоритета — первая сработавшая зона побеждает)

`Q_pp` — расход на один рабочий насос (передаётся во входе).
`H` — целевой напор станции.
`footprint`: tight = подземное/стеклопластик/блок-бокс/чужой-резервуар;
spacious = технологический-павильон; any = иначе.
`vertical` = true если ТЗ требует «вертикальные» / «многоступенчатые» / «ин-лайн».

1. **Q_pp > 400** → `SPLIT_CASE` (двусторонний всас, поверх всего).
2. **H > 100 м**:
   - Q_pp > 200 → `END_SUCTION` (крупный одноступенчатый).
   - Q_pp ≤ 200 → `MULTISTAGE` (одной ступенью не выдать).
3. **H 80–100**:
   - Q_pp ≥ 90, vertical=false → `END_SUCTION` (крупный типоразмер 220–260 мм).
   - Q_pp ≥ 90, vertical=true → `MULTISTAGE`.
   - Q_pp < 90 → `MULTISTAGE`.
4. **H 50–80**:
   - Q_pp ≥ 90 → `END_SUCTION`.
   - Q_pp < 90 → `MULTISTAGE`.
5. **H 30–50**:
   - Q_pp ≥ 100 → `END_SUCTION`.
   - Q_pp 50–100, vertical=true → `MULTISTAGE` (Wilo MVL и т.п.).
   - Q_pp 50–100, footprint=tight → `IN_LINE` (компромисс).
   - Q_pp 50–100, иначе → `END_SUCTION`.
   - Q_pp < 50, footprint=tight → `MULTISTAGE`.
   - Q_pp < 50, footprint=spacious → `IN_LINE`.
   - Q_pp < 50, footprint=any → `IN_LINE` (с пометкой «гейт инженера»).
6. **H 20–30**:
   - Q_pp ≥ 50 → `END_SUCTION`.
   - Q_pp < 50 → `IN_LINE`.
7. **H < 20**:
   - Q_pp ≥ 50 → `END_SUCTION` (низконапорный).
   - Q_pp < 50, footprint=tight → `END_SUCTION` (компактный NES65-50).
   - Q_pp < 50, footprint=spacious → `IN_LINE`.
   - Q_pp < 50, footprint=any → `END_SUCTION` (универсал для малой подземной).

## Вход (JSON)

`{ "qPerPump": <м³/ч>, "hTarget": <м>, "footprint": "tight|spacious|any", "vertical": <bool> }`
