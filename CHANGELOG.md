# Changelog

Все значимые изменения этого проекта документируются в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/),
версии следуют [Semantic Versioning](https://semver.org/lang/ru/).

## [0.21.0] - 2026-11-10

Синхронизация снимка OpenAPI Seller API с обновлениями Ozon от 10 ноября 2026.

Пути: 484 → 484 (+0 / −0). Схемы: 2319 → 2319 (+0 / −0).
Рантайм клиента не менялся (`http-methods` без изменений).

### Added

- В ответ `/v1/finance/accrual/by-day` добавлен необязательный `quantity`
  (`int32`, количество товара):
  - `accruals.item_fees.fees.quantity` — у элемента начисления по товару;
  - `accruals.posting.products.quantity` — у товара в отправлении.
    В обновлении Ozon поле названо `accruals.posting_products.quantity`.

### Changed

- Перенос методов из бета-раздела в основной отражён только в описаниях:
  убраны ссылки на обсуждения в сообществе разработчиков. У методов
  транспортных грузомест также убрана ссылка «Подробнее о работе с
  транспортными грузоместами». Пути, запросы и ответы не менялись.
  - `/v2/cargoes/get`, `/v2/cargoes/delete`, `/v2/cargoes/delete/status`,
    `/v1/cargoes/transport/activate`, `/v1/cargoes/transport/activate/status`,
    `/v1/cargoes/transport/create`, `/v1/cargoes/transport/create/status`,
    `/v1/cargoes/transport/bind`, `/v1/cargoes/transport/bind/status`,
    `/v1/cargoes/supplies/get`,
    `/v1/cargoes/label/transport-by-order/create`,
    `/v1/cargoes/label/transport-by-order/status`,
    `/v1/cargoes/label/transport/create`,
    `/v1/cargoes/label/transport/status`;
  - `/v1/notification/set`, `/v1/notification/update`,
    `/v1/notification/delete`, `/v1/notification/check`,
    `/v1/notification/enable`, `/v1/notification/list`,
    `/v1/notification/push-type/list`;
  - `/v1/supply-order/act/summary/get`, `/v1/supply-order/act/product/get`,
    `/v1/supply-order/act/accept`, `/v1/supply-order/act/accept/status`;
  - `/v1/report/realization/posting/create` — текст отчёта сохранён.
- У `/v1/product/info/stocks-by-warehouse/fbo` в заголовке и в описании
  ответа 200 «стоках» заменено на «остатках». Ссылка на обсуждение убрана.
- У `/v1/supply-order/cancel` и `/v1/supply-order/cancel/status` убрано
  пустое описание (`description: null`). В обновлении Ozon этих методов нет.

## [0.20.0] - 2026-11-06

Синхронизация снимка OpenAPI Seller API с обновлениями Ozon от 5 и 6 ноября
2026.

Пути: 482 → 484 (+2 / −0). Схемы: 2307 → 2319 (+12 / −0).
Рантайм клиента не менялся (`http-methods` без изменений).

### Added

- `POST /v1/order/code/get` — код выдачи заказа для покупателя. Запрос:
  `order_number`. Ответ: `code`, `valid_until`. Код используется, чтобы
  сформировать QR.
- `POST /v1/return/box/get-by-barcode` — информация о возвратной коробке по
  штрихкоду с этикетки (бета). Запрос: `barcode` (`lozon_id`). Ответ:
  `box_id`, `box_barcode`, `label_barcode`, `cargo_box_id`, `supply_id`,
  `state`, `type`, `return_type`, `warehouse`, `destination_warehouse`,
  `dimensions`, `weight`, `volume_in_litres`, `utilization_reason`,
  `updated_at`.
- В `buyer` запроса `/v2/order/create` добавлен необязательный `email`.

## [0.19.2] - 2026-11-03

Синхронизация снимка OpenAPI Seller API с обновлениями Ozon от 22 и 28 октября
и 2 ноября 2026.

### Changed

- В примерах ответов хост `ir-3.ozone.ru` заменён на `ir.ozone.ru`:
  `picture` у `/v1/description-category/attribute/values`, `primary_image` и
  `images` у `/v4/product/info/attributes`, `file_url` у
  `/v1/posting/fbs/package-label/get`, `file` у `/v1/report/info` и
  `/v1/report/list`.

## [0.19.1] - 2026-10-24

Синхронизация снимка OpenAPI Seller API с обновлениями Ozon от 22 октября 2026.

### Changed

- В описаниях `prices.price` (`/v1/product/import/prices`) и
  `products.action_price` (`/v1/actions/products/update`) указано, что
  предельная цена, изменённая любым из этих методов, обновляется в карточке
  товара.
- `npm audit fix` (devDependencies).

## [0.19.0] - 2026-10-22

Синхронизация снимка OpenAPI Seller API с обновлениями Ozon от 16 и 22 октября
2026.

### Added

- В элемент `articles` ответа `/v1/return/giveout/info` добавлены `barcodes`
  (`type`: `BT_DATA_MATRIX`, `BT_SCAN_IT`, `BT_LOZON_ID`, `BT_BARCODE`;
  `value`) и `type` (`UNSPECIFIED`, `EXEMPLAR`, `POSTING`, `TRANSIT_BOX`).

### Changed

- В `/v2/actions/products/deactivate` порог `action_price` для акций
  «Эластичный бустинг» и «Максимальный бустинг» — больше или равна лимиту
  акции.
- В `action_price` запросов `/v1/seller-actions/products/add`,
  `/v1/actions/auto-add/products/update` и
  `/v2/actions/auto-add/products/update` нецелое число округляется вверх.
- В описании `/v1/analytics/data` раздел кабинета переименован в
  «Аналитика → Продажи моих товаров».
- Пример `GET /v1/cargoes-label/file/{file_guid}` убран из README и
  комментариев `requestRaw()`.

### Removed

- `GET /v1/cargoes-label/file/{file_guid}`. Путей с шаблоном в типах больше нет.

### Breaking

- Путь больше не описан спецификацией. Замена — `POST /v1/cargoes-label/get`:
  передать `operation_id` из `/v1/cargoes-label/create` и при `status: SUCCESS`
  взять `result.file_url`. Поле `result.file_guid` deprecated.

## [0.18.0] - 2026-10-16

Синхронизация снимка OpenAPI Seller API с обновлениями Ozon от 15 октября 2026.

### Added

- В ответ `/v1/returns/list` добавлен `courier_delivery`: `failed_attempts`,
  `total_attempts`.
- В ответ `/v1/warehouse/fbs/return-mile/check` добавлены
  `is_courier_return_mile_available` и `is_dropoff_return_mile_available`.
- В запросы `/v1/warehouse/fbs/create` и `/v1/warehouse/fbs/first-mile/update`
  добавлен необязательный `courier_return_warehouse_info`: `comment`,
  `courier_return_warehouse_id`, `is_courier_return_warehouse_match`.

### Changed

- Помечены deprecated, отключение 2 ноября 2026. В предупреждении про новые
  этикетки FBS с 5 октября формулировка «будет возвращать» заменена на
  «возвращает».
  - `/v2/posting/fbs/package-label` → `/v3/posting/fbs/package-label/create` и
    `/v2/posting/fbs/package-label/get`.
  - `/v1/posting/fbs/package-label/create` и
    `/v2/posting/fbs/package-label/create` →
    `/v3/posting/fbs/package-label/create`.
  - `/v1/posting/fbs/package-label/get` → `/v2/posting/fbs/package-label/get`.

## [0.17.0] - 2026-10-13

Синхронизация снимка OpenAPI Seller API с обновлениями Ozon от 13 октября 2026.

### Added

- В элемент `result` ответа `/v2/posting/fbs/act/get-postings` добавлены
  `is_blr_traceable` и `scanit`.

## [0.16.0] - 2026-10-12

Синхронизация снимка OpenAPI Seller API с обновлениями Ozon от 9 октября 2026.

### Added

- `POST /v1/supply-order/shipment-plan-compliance/get` — выполнение плана
  отгрузок (бета). Ответ: `compliance_rate_percent`, `interval_days`,
  `min_compliance_percent`, `rate_details`, `restrictions` (статусы
  `DISABLED` / `ENABLED`).
- В ответы `/v2/product/certification/options` и
  `/v2/product/certification/params` добавлено `variants` (`name`, `value`).
  Для `CERTIFICATE_COUNTRY` значение `NotEAEU` разрешает любой код страны в
  `params.certificate_country`.
- В ответ `/v2/product/certificate/create` добавлено `number_mask` при
  `params.name = NUMBER`.

### Changed

- `/v2/product/certification/options`, `/v2/product/certification/params` и
  `/v2/product/certificate/create` выведены из беты.
- В запросах `/v2/product/certification/params` и
  `/v2/product/certificate/create`: суммарный размер `params.files` до 10 МБ;
  `params.certificate_country` — код страны в верхнем регистре;
  `params.expired_date.date` не раньше `params.issue_date` и не передаётся при
  `infinite`.

### Breaking

- `params.accordance_type` в `/v2/product/certification/params` и
  `/v2/product/certificate/create` больше не принимает
  `TECHNICAL_REGULATIONS_RF`, `TECHNICAL_REGULATIONS_CU` и `GOST`. Остались
  `UNKNOWN`, `EAEU`, `NATIONAL`, `CHEMICAL_PRODUCTS`, `SAFETY_DATA_SHEET`,
  `REJECTION_LETTER`.

## [0.15.0] - 2026-10-06

Синхронизация снимка OpenAPI Seller API с обновлениями Ozon от 5–6 октября 2026.

### Added

- `POST /v1/barcode/delete` — отвязать штрихкод от товара. Запрос: пары
  `barcode` и `sku`. Пустой `errors` — все штрихкоды отвязаны. Нельзя отвязать
  при остатках или если с их продажи прошло меньше 6 месяцев.

### Changed

- Создавать отгрузку `/v1/carriage/create` можно, если в ответе
  `/v2/carriage/delivery/list` у `methods.carriages.available_actions` есть
  `create`. Значения: `create`, `get_details`, `get_assembly_list`.
- В запрос `/v2/product/certification/params` добавлен пример тела.
- `npm audit fix` (devDependencies).

## [0.14.0] - 2026-09-28

Синхронизация снимка OpenAPI Seller API с обновлениями Ozon от 28 сентября 2026.

### Added

- `declared_price`: строка в запросе `/v1/product/import/prices`; `amount` и
  `currency` в ответах `/v5/product/info/prices` и `/v3/product/info/list`.

## [0.13.0] - 2026-09-25

Синхронизация снимка OpenAPI Seller API с обновлениями Ozon от 24–25 сентября
2026.

### Added

- `POST /v1/warehouse/rfbs/return-point/list` — пункты возврата склада rFBS
  (бета).
- `SHOWCASE_SELECT_ACTIVE` в `filter.visibility` запросов `/v3/product/list` и
  `/v4/product/info/attributes`.
- `total_items` в ответах `/v3/product/list`, `/v4/product/info/stocks` и
  `/v5/product/info/prices`.
- `return_point` в ответе `/v1/delivery-method/return/settings/get`.
- `return_point_id` в запросах `/v1/warehouse/erfbs/aggregator/create` и
  `/v1/warehouse/erfbs/aggregator/delivery-method/update`.

### Changed

- `total` в ответах `/v3/product/list`, `/v4/product/info/stocks` и
  `/v5/product/info/prices` помечен deprecated (отключение 23 ноября 2026).
- `/v3/posting/fbs/package-label/create` и
  `/v2/posting/fbs/package-label/get` выведены из беты.
- В описаниях `/v2/posting/fbs/package-label`,
  `/v1/posting/fbs/package-label/create`,
  `/v2/posting/fbs/package-label/create` и
  `/v1/posting/fbs/package-label/get`: с 5 октября 2026 методы возвращают новые
  этикетки FBS.
- `npm audit fix` (devDependencies).

## [0.12.0] - 2026-09-22

Синхронизация снимка OpenAPI Seller API с обновлениями Ozon от 22 сентября 2026.

### Added

- `POST /v1/actions/products/update`.
- `POST /v2/actions/candidates`, `/v2/actions/products`,
  `/v2/actions/products/deactivate`.
- `POST /v2/actions/auto-add/products/list`, `.../candidates`, `.../delete`,
  `.../update`.
- `POST /v3/posting/fbs/package-label/create` и
  `POST /v2/posting/fbs/package-label/get`.
- `scanit` в ответах `/v4/posting/fbs/list`,
  `/v4/posting/fbs/unfulfilled/list` и `/v3/posting/fbs/get`.

### Changed

- Помечены deprecated (отключение 13 октября 2026): `/v1/actions/candidates`,
  `/v1/actions/products`, `/v1/actions/products/activate`,
  `/v1/actions/products/deactivate` и четыре метода
  `/v1/actions/auto-add/products/*` (`list`, `candidates`, `delete`, `update`).
- В описаниях `/v2/posting/fbs/package-label`, `/v1` и `/v2`
  `package-label/create`, `/v1/posting/fbs/package-label/get` указано
  отключение 2 ноября 2026. Флаг `@deprecated` не выставлен.
- В `/v2/posting/fbs/get-by-barcode` штрихкод для `barcode` берётся из
  `barcodes` или `scanit`.

## [0.11.0] - 2026-09-18

Синхронизация снимка OpenAPI Seller API с обновлениями Ozon от 14–17 сентября
2026.

### Added

- `POST /v1/analytics/category/comparison` (бета).
- `POST /v1/analytics/local-sale/total`, `.../clusters-items/info`,
  `.../items-clusters/info` (бета).
- В ответ `/v2/draft/create/info` добавлены `limit` и `supply_id`.
- В `ErrorErrorMessageEnum` добавлены
  `LIMIT_EXCEEDED_ACCORDING_TO_SHIPMENT_DISCIPLINE` и
  `BACKUP_SUPPLY_ALREADY_USED`.
- В ответ `/v1/supply-order/content/update/status` добавлено `error_details`.
- В ответ `/v1/analytics/stocks` добавлены `inbound_replenishment`,
  `outbound_pending_delivery`, `outbound_returns_picking`,
  `outbound_returns_ready_to_ship`, `outbound_returns_return_to_seller`,
  `stock_not_being_sold`.

### Changed

- `/v1/analytics/data`: лимит 50 запросов в сутки без Premium Plus / Premium Pro.
- Обновлены описания ценовых параметров в `/v3/product/import`,
  `/v1/product/import-by-sku`, `/v3/product/info/list`,
  `/v1/product/import/prices`, `/v5/product/info/prices` и
  `/v1/product/prices/details`.
- Из описаний `integration_type_flow` у части схем отправлений убран пункт про
  `FBP`.

## [0.10.0] - 2026-09-11

Синхронизация снимка OpenAPI Seller API с обновлениями Ozon от 11 сентября 2026.

### Added

- `POST /v1/fbp/order/direct/tpl-dlv/edit` — обновление доставки сторонней
  транспортной компанией (бета).

### Changed

- В `/v1/product/import/prices` параметры `auto_action_enabled` и
  `manage_elastic_boosting_through_price` помечены deprecated.
- В `v3ImportProductsRequestItem` поле `geo_names` помечено deprecated.

## [0.9.1] - 2026-09-09

Синхронизация снимка OpenAPI Seller API с обновлениями Ozon по состоянию на
9 сентября 2026.

### Changed

- В описаниях загрузки изображений лимит 50 штук, включая `primary_image`
  (было 30).

## [0.9.0] - 2026-09-08

Синхронизация снимка OpenAPI Seller API с обновлениями Ozon от 7–8 сентября 2026.

### Added

- В ответ `/v1/product/prices/details` добавлено `prices.weight_index`.

### Changed

- В товаре запроса `/v1/seller-actions/products/add` добавлен `action_price`,
  схема стала `oneOf`.

### Removed

- `POST /v1/product/quant/info` и `POST /v1/product/quant/list`.

### Breaking

- Эти два пути больше не типизируются.
- Для `/v1/seller-actions/products/add` тело запроса нужно сверить с новой
  `oneOf`-схемой и полем `action_price`.

## [0.8.0] - 2026-09-03

Синхронизация снимка OpenAPI Seller API с обновлениями Ozon от 2–3 сентября 2026.

### Added

- `POST /v1/analytics/decommissioned-goods` — отчёт о списанных товарах (бета).
- `POST /v2/product/pictures/import`.

### Changed

- `POST /v1/product/pictures/import` deprecated, отключение 1 октября 2026.
  Замена — `/v2/product/pictures/import`.
- В `POST /v1/product/certificate/products/list` с 28 сентября 2026
  `page`/`page_size` заменяются на `last_id`/`limit`.

### Breaking

- `/v1/notification/list`: тело запроса обязательно
  (`availability_statuses`, `limit`, `offset`, `sort_dir`). Вызов без body не
  типизируется; минимум — `{}`.
- В ответе обязательны `availability_status_thresholds` и `total_count`. У
  элемента уведомления обязательны `availability_status`,
  `availability_status_date`, `disable_reason`, `problematic_type`,
  `reason_details`.

## [0.7.0] - 2026-09-01

Синхронизация снимка OpenAPI Seller API с обновлениями Ozon по состоянию на
1 сентября 2026.

### Added

- `POST /v1/description-category/dependent-attributes` — пары родительской и
  дочерней характеристик.
- `POST /v1/description-category/dependent-attributes/values` — значения
  дочерней характеристики.

### Changed

- `esbuild` закреплён на `0.27.2` (`npm audit fix`, GHSA-g7r4-m6w7-qqqr).
  Только dev toolchain.

## [0.6.1] - 2026-08-28

Синхронизация снимка OpenAPI Seller API с обновлениями Ozon по состоянию на
28 августа 2026.

### Changed

- В примерах ответов домен `ir-3.ozone.ru` заменён на `ir.ozone.ru`.

## [0.6.0] - 2026-08-21

Синхронизация снимка OpenAPI Seller API с обновлениями Ozon от 14–19 августа 2026.

### Changed

- Уточнены описания: `id` в `/v2/posting/fbs/act/get-container-labels`
  (идентификатор перевозки из `/v1/carriage/create`), метод
  `/v1/carriage/create`, `chat_type` в `/v3/chat/list`, формулировка схем в
  `/v4/product/info/stocks`.

### Breaking

- В `ChatInfoChatTypeEnum` добавлены `SELLER_PERSONAL_MANAGER_UNITY_CRM` и
  `SELLER_BUSINESS_DEVELOPMENT_GROUP`.
- `availability` в ответе `/v3/product/info/list` сужен до
  `"HIDDEN" | "AVAILABLE" | "UNAVAILABLE"`. В примерах Ozon вместо `in_stock`
  стоит `AVAILABLE`.
- `filter.delivery_schema` в запросе отчёта по отправлениям обязателен,
  например `["fbo"]` или `["fbs"]`.

## [0.5.0] - 2026-08-14

Синхронизация снимка OpenAPI Seller API с обновлениями Ozon от 13–14 августа 2026.

### Added

- `POST /v1/carriage/courier-contact/set` и
  `POST /v1/carriage/courier-contact/get`.
- Бета-методы сертификатов: `POST /v2/product/certification/options`,
  `POST /v2/product/certification/params`, `POST /v2/product/certificate/create`.
- В `/v1/analytics/stocks`: запрос — `placement_zone`, `unmarked_stocks_only`;
  ответ — `items.waiting_docs_to_export_stock_count`, `items.placement_zone`.
- В ответе `/v2/delivery/checkout` добавлено `splits.commissions`.
- В bind/unbind сертификата добавлен `skus`.
- В `/v1/product/certificate/products/list` добавлены `last_id` и `limit`; в
  ответе — `result.items.sku`.

### Changed

- `/v1/product/certificate/create` deprecated (отключение 31 августа 2026).
  Замена — v2 options / params / create.
- В bind/unbind `product_id` deprecated. Для привязки использовать `skus`.
- В списке товаров сертификата `page` и `page_size` deprecated. Для пагинации
  использовать `last_id` и `limit`.
- В enum `item_tags` метода `/v1/analytics/stocks` добавлены `MARKABLE` (запрос
  и ответ) и `UNSPECIFIED` (ответ).

### Breaking

- bind/unbind: `oneOf` (`product_id` | `skus`), `product_id` больше не required.
- Список товаров сертификата: `oneOf` (`page`+`page_size` | `limit`),
  `page` и `page_size` больше не required.
- Новые значения `item_tags` вошли в подпись типа `/v1/analytics/stocks`.

## [0.4.0] - 2026-08-11

Синхронизация снимка OpenAPI Seller API с обновлениями Ozon от 11 августа 2026.

### Added

- Бета-методы актов FBO: `POST /v1/supply-order/act/summary/get`,
  `.../product/get`, `.../accept`, `.../accept/status`.

### Changed

- В ответе `/v2/returns/rfbs/get` поле `returns.return_method_description`
  помечено deprecated.
- `npm audit fix` (devDependencies): `@redocly/openapi-core` 1.34.17 → 1.34.19,
  `js-yaml` 4.2.0 → 4.3.1, `brace-expansion` 2.1.2 → 2.1.4, `nanoid` 3.3.16 →
  3.3.18.

### Removed

- `/v2/returns/rfbs/reject`, `compensate`, `verify`, `receive-return`,
  `return-money`.

### Breaking

- Эти пути больше не типизируются. Замена — `/v1/returns/rfbs/action/set`.

## [0.3.0] - 2026-08-07

Синхронизация снимка OpenAPI Seller API с обновлениями Ozon по состоянию на
7 августа 2026.

### Breaking

- `deletion_sku_mode` обязателен в запросах создания черновиков поставок
  (crossdock, direct, multi-cluster). Значения: `PARTIAL` или `FULL`.
  Комментарий `@default PARTIAL` убран.

## [0.2.1] - 2026-08-05

Синхронизация снимка OpenAPI Seller API с обновлениями Ozon от 4 августа 2026.

### Added

- Восемь значений enum уведомлений для `/v1/notification/set`, `update`,
  `list`, `push-type/list`: `TYPE_FBO_POSTING_NEW`,
  `TYPE_FBO_POSTING_CANCELLED`, `TYPE_FBO_POSTING_STATE_CHANGED`,
  `TYPE_FBO_POSTING_DELIVERY_DATE_CHANGED`, `TYPE_FBO_STOCKS_CHANGED`,
  `TYPE_ORDER_NEW`, `TYPE_ORDER_CANCELLED`, `TYPE_ORDER_STATE_CHANGED`.

### Changed

- Уточнены описания этих enum и `is_marketplace_buyout` в ответах FBS/FBO
  list/get: выкуп товара Ozon, не только ЕАЭС.
- Уточнено описание `/v1/finance/products/buyout`.

## [0.2.0] - 2026-08-01

Синхронизация снимка OpenAPI Seller API с обновлениями Ozon за 16–30 июля 2026.

### Added

- `POST /v1/report/realization/posting/create` — позаказный отчёт о реализации
  (бета).
- `additional_data` в ответах `/v1/report/info` и `/v1/report/list`.
- В `/v1/finance/accrual/by-day` добавлены `accruals.container_fees` и значение
  `CONTAINER_FEES` в `accruals.accrued_category`.

### Changed

- Уточнены описания `date` и `last_id` в `/v1/finance/accrual/by-day`.
- Уточнено `message` ошибки 400 у `/v1/finance/realization/posting`.

## [0.1.1] - 2026-07-25

### Fixed

- Резолв типов `/limiter` при `moduleResolution: node` / `node10` через
  `typesVersions`.
- Декларации `.d.mts` больше не дублируют сгенерированный typeship.

### Changed

- В дефолты лимитера добавлены все пометодные лимиты из спецификации.
- Лицензия: GPL-3.0 → MIT.
- README на русском; добавлен `README.en.md`.

## [0.1.0] - 2026-07-25

Первый публичный релиз.

### Added

- Типизированный `OzonClient.request()` / `requestRaw()` по снимку OpenAPI
  Seller API.
- `OzonApiError`; повторы только на 429 и «Circle is open».
- Лимитер: `artefactby-ozon-seller-api/limiter`.
- Один вызов клиента — один запрос API.
