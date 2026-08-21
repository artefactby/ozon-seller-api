# Changelog

Все значимые изменения этого проекта документируются в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/),
версии следуют [Semantic Versioning](https://semver.org/lang/ru/).

## [0.6.0] - 2026-08-21

Синхронизация снимка OpenAPI Seller API с обновлениями Ozon от 14–19 августа 2026.
Пути: 463 → 463 (+0 / −0); схемы: 2136 → 2136 (+0 / −0); новые поля в существующих схемах: 0.
Рантайм клиента не менялся (`http-methods` без изменений).

### Changed

- В `/v2/posting/fbs/act/get-container-labels` уточнено описание `id`: идентификатор перевозки из `/v1/carriage/create`.
- В `/v1/carriage/create` обновлено описание метода.
- В `/v3/chat/list` (и связанных схемах чатов) обновлено описание `chat_type`.
- В `/v3/product/info/list` поле `availabilities[].availability` типизировано как enum
  `HIDDEN` | `AVAILABLE` | `UNAVAILABLE` (раньше — `string`).
- В описании `/v4/product/info/stocks` уточнена формулировка про схемы и ссылку на analytics/stocks.

### Breaking

- В `ChatInfoChatTypeEnum` добавлены значения:
  `SELLER_PERSONAL_MANAGER_UNITY_CRM`, `SELLER_BUSINESS_DEVELOPMENT_GROUP`.
- В `GetProductInfoListResponseAvailability.availability` тип сужен с `string`
  до `"HIDDEN" | "AVAILABLE" | "UNAVAILABLE"`.
- В `reportCreateCompanyPostingsReportRequestFilter` поле `delivery_schema` стало обязательным.

### Notes

- Миграция: при создании отчёта по отправлениям всегда передавать `filter.delivery_schema`
  (например `["fbo"]` или `["fbs"]`). Для `availability` опираться на новые значения enum,
  а не на произвольные строки (в примерах Ozon вместо `in_stock` — `AVAILABLE`).
- Сверка с анонсом Ozon за 14–19 августа 2026 проведена: пункты анонса отражены;
  методы courier-contact уже в 0.5.0. Изменения `availability` и `delivery_schema`
  в анонсе не упоминались — пришли со снимком спецификации.

## [0.5.0] - 2026-08-14

Синхронизация снимка OpenAPI Seller API с обновлениями Ozon от 13–14 августа 2026.
Пути: 458 → 463 (+5 / −0); схемы: 2112 → 2136 (+24 / −0); новые поля в существующих схемах: 6.
Рантайм клиента не менялся (`http-methods` без изменений).

### Added

- `POST /v1/carriage/courier-contact/set` и `POST /v1/carriage/courier-contact/get` —
  контактные данные продавца для курьера.
- Бета-методы сертификатов:
  `POST /v2/product/certification/options`,
  `POST /v2/product/certification/params`,
  `POST /v2/product/certificate/create`.
- В `/v1/analytics/stocks`: запрос — `placement_zone`, `unmarked_stocks_only`;
  ответ — `items.waiting_docs_to_export_stock_count`, `items.placement_zone`.
- В ответе `/v2/delivery/checkout`: `splits.commissions`.
- В bind/unbind сертификата: параметр `skus`.
- В `/v1/product/certificate/products/list`: параметры `last_id`, `limit`;
  в ответе — `result.items.sku`.

### Changed

- `/v1/product/certificate/create` помечен `@deprecated` (отключение 31 августа 2026).
- В bind/unbind: `product_id` помечен `@deprecated`.
- В products/list: `page` и `page_size` помечены `@deprecated`.
- В `/v1/analytics/stocks` обновлены описания и enum `item_tags`
  (в запросе добавлен `MARKABLE`, в ответе — `MARKABLE` и `UNSPECIFIED`).

### Breaking

- В запросах bind/unbind `product_id` больше не всегда required: схема — `oneOf`
  (`product_id` | `skus`); в типах `product_id` стал optional.
- В запросе products/list `page`/`page_size` больше не всегда required: схема — `oneOf`
  (`page`+`page_size` | `limit`); в типах эти поля стали optional.
- Расширены enum `item_tags` в запросе и ответе `/v1/analytics/stocks`
  (новые значения в подписи типа).

### Notes

- Миграция по анонсу Ozon: для bind/unbind предпочитать `skus`; для products/list —
  `last_id`/`limit`; вместо `/v1/product/certificate/create` — v2 options/params/create
  до 31 августа 2026.
- Сверка с анонсом Ozon за 13–14 августа 2026 проведена: все пункты отражены в снимке.

## [0.4.0] - 2026-08-11

Синхронизация снимка OpenAPI Seller API с обновлениями Ozon от 11 августа 2026.
Пути: 459 → 458 (+4 / −5); схемы: 2089 → 2112 (+28 / −5). Рантайм клиента не менялся (`http-methods` без изменений).

### Added

- Бета-методы работы с актами FBO:
  `POST /v1/supply-order/act/summary/get`,
  `POST /v1/supply-order/act/product/get`,
  `POST /v1/supply-order/act/accept`,
  `POST /v1/supply-order/act/accept/status`
  и связанные схемы запросов/ответов.

### Changed

- В ответе `/v2/returns/rfbs/get` поле `returns.return_method_description` помечено как `@deprecated`.

### Removed

- Из снимка удалены методы (и request-схемы):
  `/v2/returns/rfbs/reject`,
  `/v2/returns/rfbs/compensate`,
  `/v2/returns/rfbs/verify`,
  `/v2/returns/rfbs/receive-return`,
  `/v2/returns/rfbs/return-money`.

### Breaking

- Вызовы удалённых `/v2/returns/rfbs/*` больше не типизируются через `request()`: типы путей и схем убраны из сгенерированной карты.

### Notes

- Миграция по анонсу Ozon: вместо удалённых методов использовать `/v1/returns/rfbs/action/set`.
- В анонсе также указано обновление `v2/delivery/checkout` (предварительная стоимость услуг) — в этом снимке OpenAPI изменений нет.
- В ветку также вошёл `npm audit fix` по транзитивным devDependencies: `@redocly/openapi-core` 1.34.17 → 1.34.19, `js-yaml` 4.2.0 → 4.3.1, `brace-expansion` 2.1.2 → 2.1.4, `nanoid` 3.3.16 → 3.3.18. На рантайм пакета не влияет.

## [0.3.0] - 2026-08-07

Синхронизация снимка OpenAPI Seller API с обновлениями Ozon по состоянию на 7 августа 2026. Сверка с анонсом Ozon не проводилась.
Число путей и схем не изменилось. Рантайм клиента не менялся (`http-methods` без изменений).

### Breaking

- `deletion_sku_mode` стал обязательным в `v1DraftCrossdockCreateRequest`, `v1DraftDirectCreateRequest` и `v1DraftMultiClusterCreateRequest`.
- В комментариях к сгенерированным типам для `deletion_sku_mode` больше не указан `@default PARTIAL`, поэтому на неявное значение по умолчанию полагаться нельзя.

### Notes

- Миграция: все вызовы создания черновиков поставок должны явно задавать `deletion_sku_mode` со значением `PARTIAL` или `FULL`.
- В диффе также уточнено текстовое описание `deletion_sku_mode`; допустимые значения enum не изменились.

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
