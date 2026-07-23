# Wellmix API — источник подбора насосов (reference)

Источник типа **API** для шага «Подбор»: по параметрам расчёта (Q, H, мощность)
возвращает конкретные насосы с ценой, наличием по складам, характеристиками и
графиками. Первоисточник — документация клиента (Google Doc,
`docs.google.com/document/d/1MET1CqS12MC09oaYZTr7Btm9L9_GUi4neJp58bY27lg`).

- **База:** `https://wellmix-pump.ru/api/`
- **Авторизация:** параметр `token` (query). Пример в доке:
  `ddcf984ad57512fa61fb4cac451a7844` — хранить как секрет источника (Settings/реестр
  источников), не в коде.
- **Метод:** GET.

## Эндпоинт 1 — справочники: `GET /api/parameters/get/`

Параметры запроса: `token` (обязателен).
Ответ: `status` (success|error), `request_id`, `data[]` — коды параметров и их
значения, напр. `TG → [{id:123, name:"DN 80"}, …]` (серии, типоразмеры DN и т.п.).
Используется, чтобы узнать доступные `series` и словари перед подбором.

## Эндпоинт 2 — подбор насосов: `GET /api/performance/get/`

Параметры запроса:

| Параметр | Тип | Обяз. | Смысл |
|---|---|---|---|
| `token` | string | да | api token |
| `series` | string\|array | да | серия(и) насосов, напр. `313` или `[152,125,174]` |
| `efficiency` | number | да | **производительность = расход Q** (м³/ч), напр. `10.5` |
| `pressure` | number | да | **напор H** (м), напр. `4.8` |
| `number_of_pumps` | number | нет | параллельно работающих, 1–8 |
| `static_height_pressure` | number | нет | статическая высота напора |
| `power_phases` | number | нет | число фаз питания |
| `power_from` / `power_to` | number | нет | диапазон мощности (кВт) |
| `npsh` | number | нет | NPSH |
| `mounting_length_from` / `_to` | number | нет | монтажная длина |

Ответ: `status`, `request_id`, `data` → **`pumps[]`**. Каждый насос:

- **Коммерция:** `id`, `name` (напр. «CV 10-2 (IE3)»), `article`, `quantity`,
  **`price`** (напр. 56909.00), **`available`** (Y|N),
  **`warehouses[]`** { `id`, `name` (напр. «Томск»), `availability` (кол-во),
  `transits[]` { `date`, `amount` } }.
- **Характеристики:** `type` (напр. «Вертикальный многоступенчатый in-line»),
  `expenditure` (расход, м³/ч), `nominal_pressure` / `maximum_pressure` (напор),
  `power` (кВт), `kpd` (КПД), `npsh`, `energy_efficiency_class`,
  `shaft_rotation_speed`, `number_of_poles`, `voltage`, `rated_current`,
  `nozzle_on_the_suction_side` / `_pressure_side` (DN), `mounting_length`, `weight`,
  `maximum_operating_pressure`, `number_of_phases`, `frequency_of_the_supply_network`,
  материалы (`body_material`, `material_of_the_impeller`, `shaft_material`),
  `connection_standard`, температуры, `description`/`materials`/`size` (html),
  `picture[]`/`size_picture[]`/`documents[]` (src на wellmix-pump.ru).
- **Графики (массивы точек [x,y]):** `pump_characteristics`, `pump_performance`,
  `intersection_point` (точка пересечения Q/H), `graph_kpd`, `graph_npsh`,
  `graph_power`. При `number_of_pumps>1` или сериях WRS/WRE графики — вложенными массивами.

## Как ложится на подбор

Шаг «Подбор» рассчитал рабочую точку Q/H (+ мощность из шага «Расчёт»):
`efficiency=Q`, `pressure=H`, опц. `power_from/to`, `number_of_pumps` из схемы
резервирования → API отдаёт варианты насосов с **ценой** и **наличием по складам**
(закрывает и подбор, и часть ценообразования — реальный прайс, а не оценка).

## Открытые вопросы

- **`series` обязателен** — надо решить, откуда берём серию: из `parameters/get`
  (весь список) или подбор по всем сериям? Уточнить у клиента/по API.
- Токен — рабочий или пример? Хранить как секрет источника.
- Соответствие серий Wellmix нашим классам насоса (END_SUCTION/MULTISTAGE/IN_LINE).
