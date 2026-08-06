# Changelog

Все значимые изменения этого проекта документируются в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/),
версии следуют [Semantic Versioning](https://semver.org/lang/ru/).

## [0.3.0] - 2026-08-06

Синхронизация снимка OpenAPI Seller API с обновлениями Ozon от 6 августа 2026.
Пути: 459 → 459; схемы: 2089 → 2089. Рантайм клиента не менялся (`http-methods` без изменений).

### Breaking

- `deletion_sku_mode` стал обязательным в `v1DraftCrossdockCreateRequest`, `v1DraftDirectCreateRequest` и `v1DraftMultiClusterCreateRequest`.
- Сгенерированные типы больше не помечают `PARTIAL` как значение по умолчанию для `deletion_sku_mode`; интеграциям нужно передавать это поле явно.

### Notes

- Сверка с анонсом Ozon не проводилась: локальные release notes, уведомление или другой анонс к этому снимку не были приложены.
- Миграция: все вызовы создания draft-поставок должны явно задавать `deletion_sku_mode` со значением `PARTIAL` или `FULL`.

## [0.2.1] - 2026-08-05

Синхронизация снимка OpenAPI Seller API с обновлениями Ozon от 4 августа 2026.
Число путей и схем не изменилось. Рантайм клиента не менялся (`http-methods` без изменений).

### Added

- Восемь типов пуш-уведомлений в enum `types` / `urls.types.type` / `types.type` для `/v1/notification/set`, `/v1/notification/update`, `/v1/notification/list`, `/v1/notification/push-type/list`:
  `TYPE_FBO_POSTING_NEW`, `TYPE_FBO_POSTING_CANCELLED`, `TYPE_FBO_POSTING_STATE_CHANGED`, `TYPE_FBO_POSTING_DELIVERY_DATE_CHANGED`, `TYPE_FBO_STOCKS_CHANGED`, `TYPE_ORDER_NEW`, `TYPE_ORDER_CANCELLED`, `TYPE_ORDER_STATE_CHANGED`.

### Changed

- Уточнены описания `types` (запрос) и `urls.types.type` / `types.type` (ответ) в методах notification выше.
- Уточнено описание `is_marketplace_buyout` в ответах FBS/FBO list/get (`/v4/posting/fbs/*`, `/v3/posting/fbs/*`, `/v3/posting/fbo/list`, `/v2/posting/fbo/*`): признак выкупа товара Ozon, без привязки только к ЕАЭС.
- Уточнено описание `/v1/finance/products/buyout`.

## [0.2.0] - 2026-08-01

Синхронизация снимка OpenAPI Seller API с обновлениями Ozon за 16–30 июля 2026.
Пути: 458 → 459; схемы: 2083 → 2089. Рантайм клиента не менялся (`http-methods` без изменений).

### Added

- `POST /v1/report/realization/posting/create` — бета-метод позаказного отчёта о реализации товаров.
- `result.additional_data` / `result.reports.additional_data` в ответах `/v1/report/info` и `/v1/report/list`.
- В `/v1/finance/accrual/by-day`: `accruals.container_fees` и значение `CONTAINER_FEES` в `accruals.accrued_category`.

### Changed

- Уточнены описания `date` и `last_id` (и связанных полей ответа) в `/v1/finance/accrual/by-day`.
- Уточнено описание `message` в теле ошибки 400 для `/v1/finance/realization/posting` (в том числе отсылка к новому методу отчёта).

### Notes

Из опубликованного changelog Ozon за этот период в снимке спеки **не отразились** (или уже были раньше):

- `integration_type_flow` / `sorting_center` для FBS list/get/unfulfilled — уже присутствовали в предыдущих типах;
- описание realtime для `/v1/analytics/stocks` (с 17 августа 2026), `PRODUCT_IS_ARCHIVED` для `/v2/products/stocks`, правки `/v1/product/unarchive` — в этом снимке OpenAPI нет.

## [0.1.1] - 2026-07-25

### Fixed

- Резолв типов вложенного пути `/limiter` при `moduleResolution: node` / `node10` через `typesVersions` (рантайм не затрагивался).
- Дедупликация `.d.mts`: декларации больше не дублируют многомегабайтный сгенерированный typeship.

### Changed

- В дефолты лимитера добавлены все пометодные лимиты, явно указанные в спецификации.
- Лицензия: GPL-3.0 → MIT.
- README на русском; добавлен английский `README.en.md`.

## [0.1.0] - 2026-07-25

Первый публичный релиз.

### Added

- Типизированный `OzonClient.request()` / `requestRaw()` по снимку OpenAPI Seller API.
- Ошибки `OzonApiError`, повторы только на 429 и «Circle is open».
- Встроенный лимитер как отдельный экспорт `artefactby-ozon-seller-api/limiter`.
- Граница пакета зафиксирована как transport-only: один вызов — один логический запрос API.
