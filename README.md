# artefactby-ozon-seller-api

Неофициальный типизированный клиент [Ozon Seller API](https://docs.ozon.ru/api/seller/)
для TypeScript и JavaScript.

[README in English](./README.en.md)

```ts
import { OzonClient } from 'artefactby-ozon-seller-api';

const client = new OzonClient({
  clientId: process.env.OZON_CLIENT_ID!,
  apiKey: process.env.OZON_API_KEY!,
});

// `items` типизирован из литерала пути — без generics и приведения типов
const { items } = await client.request('/v5/product/info/prices', {
  cursor: '',
  limit: 100,
  filter: { visibility: 'ALL' },
});
```

- **Покрыт весь API, а не выборка методов.** Типы сгенерированы из официальной
  OpenAPI-спеки (версия API 2.1): 458 операций, 2083 схемы. Любой путь спеки
  вызывается одинаково, тело запроса и ответ выводятся из литерала пути.
- **Ноль зависимостей в рантайме.** Только нативный `fetch`. Node.js >= 18, CJS и ESM.
- **Встроенный rate limiter со знанием лимитов Ozon** — 50 rps на Client-Id плюс
  пометодные лимиты из спеки — отдельным сабпатом: не подключили — не платите ничего.
- **Осторожные ретраи.** Почти все операции Ozon — POST, поэтому повторяются только
  запросы, отклонённые с 429 или «Circle is open»: их API гарантированно не обработал.
  «Повторить на всякий случай» клиент не умеет намеренно.

Статус: 0.x — публичный API может меняться между минорными версиями. Пакет не
аффилирован с Ozon.

## Установка

```bash
npm install artefactby-ozon-seller-api
```

Один экземпляр клиента привязан к одному Client-Id. Пакет никогда не читает ключи из
окружения сам — передавайте их явно в конструктор.

## Ограничение частоты запросов

Ozon отвечает 429 с `Retry-After` при превышении лимита и блокирует метод на несколько
минут («Circle is open») при шквале запросов. Клиент сам выдерживает `Retry-After` и
повторяет отклонённый запрос до `maxRetries` раз (по умолчанию 2). Чтобы не упираться
в лимиты вовсе, подключите встроенный лимитер — он выстраивает вызовы заранее:

```ts
import { OzonClient } from 'artefactby-ozon-seller-api';
import { TokenBucketLimiter } from 'artefactby-ozon-seller-api/limiter';

const client = new OzonClient({
  clientId,
  apiKey,
  limiter: new TokenBucketLimiter({
    // Дефолты — ровно то, что документирует Ozon: 50 rps глобально плюс
    // пометодные лимиты из спеки (например, /v2/products/stocks — 80 в минуту).
    // Сюда можно добавить лимиты, измеренные вами самостоятельно:
    perPath: { '/v3/product/list': { limit: 20, intervalMs: 1_000 } },
    maxSize: 5_000, // отклонять вызовы, когда очередь глубже
    waitTimeoutMs: 30_000, // отклонять вызовы, ждущие дольше
    hooks: {
      onEnqueue: ({ size }) => metrics.gauge('ozon.queue', size),
      onRateLimited: ({ path, until }) => log.warn({ path, until }, 'ozon 429'),
      onCircuitOpen: ({ path, until }) => log.error({ path, until }, 'circle is open'),
    },
  }),
});
```

Вызовы обслуживаются по приоритету (`priority` в опциях вызова, выше — раньше), внутри
приоритета — по очереди. Путь, упёршийся в собственный лимит, не блокирует остальные.
Backpressure приходит типизированной ошибкой `OzonQueueError` с `reason`:
`queue-full`, `wait-timeout` или `aborted`.

Лимитер работает в пределах одного процесса. Несколько процессов с одним Client-Id
получат каждый свой бюджет — для общего лимита реализуйте интерфейс `OzonRateLimiter`
поверх разделяемого хранилища:

```ts
import type { OzonRateLimiter } from 'artefactby-ozon-seller-api';

const redisLimiter: OzonRateLimiter = {
  async acquire({ path, priority, signal }) {
    /* дождаться слота в Redis */
  },
  notify({ path, status, retryAfterMs, circuitOpen }) {
    /* записать backoff, чтобы его увидели все инстансы */
  },
};
```

## Обработка ошибок

Не-2xx ответ — это `OzonApiError`; транспортные сбои (DNS, TLS, обрыв) пролетают как
есть, их пакет не заворачивает.

```ts
import { isOzonApiError } from 'artefactby-ozon-seller-api';

try {
  await client.request('/v1/product/import/prices', { prices });
} catch (error) {
  if (isOzonApiError(error)) {
    error.status; // HTTP-статус, например 429
    error.code; // код ошибки Ozon, если был в ответе
    error.retryAfterMs; // разобранный Retry-After, если был
    error.body; // тело ответа (объект или сырой текст)
  }
  throw error;
}
```

## Опции

```ts
const client = new OzonClient({
  clientId,
  apiKey,
  baseUrl: 'https://api-seller.ozon.ru', // по умолчанию
  fetch: customFetch, // по умолчанию — глобальный fetch
  headers: { 'User-Agent': 'my-app/1.0' }, // добавляются к каждому запросу
  timeoutMs: 30_000, // выключен по умолчанию
});

await client.request('/v1/actions', undefined, {
  signal: controller.signal,
  timeoutMs: 5_000, // важнее клиентского; 0 отключает
  headers: { 'X-Request-Id': id },
  priority: 10, // для лимитера: выше — раньше
});
```

Инжектируемый `fetch` — это шов для тестов: подставьте свою реализацию для записи и
воспроизведения трафика. Собственных моков пакет не содержит.

## Запросы мимо типов

`request()` покрывает JSON-операции. Для остального есть `requestRaw()` — он возвращает
нетронутый `Response` и не бросает на не-2xx статусе:

```ts
// PDF с этикетками отправлений
const response = await client.requestRaw('/v2/posting/fbs/package-label', {
  posting_number: ['0001-1'],
});
const pdf = await response.blob();

// Единственный путь спеки с параметром в URL требует явного метода:
// подставленный guid уже не совпадает с литералом из спеки
const label = await client.requestRaw(`/v1/cargoes-label/file/${guid}`, undefined, {
  method: 'GET',
});
```

`multipart/form-data` (передайте `FormData`), бинарные тела и `ReadableStream`
уходят как есть; всё остальное сериализуется в JSON. Стрим не ретраится никогда —
его потребляет первая же попытка отправки.

## Пагинация — на вашей стороне

Пакет сознательно заканчивается на границе транспорта: один вызов — один логический
запрос к API. Циклы пагинации, сборка датасетов, нарезка на батчи — это ваш код,
которому типизированное ядро оставляет совсем немного работы:

```ts
const items = [];
let cursor = '';
do {
  const page = await client.request('/v5/product/info/prices', {
    cursor,
    limit: 1000,
    filter: { visibility: 'ALL' },
  });
  items.push(...(page.items ?? []));
  cursor = page.cursor ?? '';
} while (cursor !== '');
```

## Известные ограничения

- Типы ровно настолько точны, насколько точна спека Ozon. Там, где она расходится с
  реальностью, выручает `requestRaw()`.
- Спека обновляется в пакете вручную — новые методы API могут появляться с задержкой.
- Декларации типов корневого входа весят около 3 МБ (это вся спека): первый проход
  тайпчекера их заметит. Сабпат `/limiter` от этого свободен.
- Встроенный лимитер не разделяет бюджет между процессами (см. выше).

## Лицензия

[MIT](./LICENSE)
