// Модульные проверки клиента без реальной сети: fetchFn подменяется заготовленной функцией.
// Запуск: node checks/api-client.checks.js

import assert from "node:assert/strict";

import { ApiError, buildUrl, createApiClient } from "../src/api-client.js";
import { createTaskApi } from "../src/task-api.js";

let passed = 0;
let failed = 0;

async function check(name, body) {
  try {
    await body();
    passed += 1;
    console.log(`OK   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}`);
    console.log(`     ${String(error.message).split("\n")[0]}`);
  }
}

const BASE = "http://127.0.0.1:5505/api";

/** Готовит ответ, похожий на Response, с управляемыми статусом, заголовками и телом. */
function jsonResponse(payload, { status = 200, contentType = "application/json; charset=utf-8" } = {}) {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);

  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => (name.toLowerCase() === "content-type" ? contentType : null) },
    json: async () => JSON.parse(body),
    text: async () => body,
  };
}

function emptyResponse(status = 204) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => null },
    json: async () => {
      throw new SyntaxError("Unexpected end of JSON input");
    },
  };
}

/** Записывает все вызовы и отдаёт заранее подготовленные ответы по очереди. */
function recordingFetch(responses) {
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  const calls = [];

  const fetchFn = async (url, init) => {
    calls.push({ url, init });

    const next = queue.length > 1 ? queue.shift() : queue[0];

    if (typeof next === "function") {
      return next(url, init);
    }

    return next;
  };

  fetchFn.calls = calls;

  return fetchFn;
}

/**
 * Имитирует запрос, который завершается только по сигналу.
 * Таймер нужен, чтобы цикл событий не опустел: AbortSignal.timeout не удерживает процесс Node.js.
 */
function pendingUntilAbort(name) {
  return (url, init) =>
    new Promise((resolve, reject) => {
      const keepAlive = setTimeout(() => reject(new Error("сигнал так и не сработал")), 2000);

      init.signal.addEventListener("abort", () => {
        clearTimeout(keepAlive);
        reject(abortError(name));
      });
    });
}

function abortError(name = "AbortError") {
  const error = new Error("The operation was aborted");

  error.name = name;

  return error;
}

const task = (overrides = {}) => ({
  id: 4,
  title: "Подготовить модель задач",
  completed: false,
  priority: "high",
  categoryId: 2,
  ...overrides,
});

const collection = (data, meta = {}) => ({
  data,
  meta: { total: data.length, filters: {}, ...meta },
});

/** Перехватывает ApiError и возвращает его для дальнейших утверждений. */
async function catchApiError(promise) {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof ApiError, `ожидался ApiError, получено ${error.name}: ${error.message}`);

    return error;
  }

  throw new assert.AssertionError({ message: "ожидался отказ, но операция завершилась успешно" });
}

// --- buildUrl ----------------------------------------------------------------

await check("buildUrl: разделитель не удваивается и не исчезает", () => {
  assert.equal(buildUrl(BASE, "/tasks"), "http://127.0.0.1:5505/api/tasks");
  assert.equal(buildUrl(`${BASE}/`, "/tasks"), "http://127.0.0.1:5505/api/tasks");
  assert.equal(buildUrl(`${BASE}//`, "tasks"), "http://127.0.0.1:5505/api/tasks");
  assert.equal(buildUrl(BASE, "tasks/25"), "http://127.0.0.1:5505/api/tasks/25");
  assert.equal(buildUrl("http://127.0.0.1:5505", "/api/tasks"), "http://127.0.0.1:5505/api/tasks");
});

await check("buildUrl: кодирует пробел, амперсанд и кириллицу", () => {
  const url = buildUrl(BASE, "/tasks", { q: "API & ошибки" });

  assert.equal(
    url,
    "http://127.0.0.1:5505/api/tasks?q=API+%26+%D0%BE%D1%88%D0%B8%D0%B1%D0%BA%D0%B8"
  );
  assert.equal(new URL(url).searchParams.get("q"), "API & ошибки");

  const slash = buildUrl(BASE, "/tasks", { q: "a/b?c=d#e" });

  assert.equal(new URL(slash).searchParams.get("q"), "a/b?c=d#e");
});

await check("buildUrl: сохраняет значения false и 0", () => {
  assert.equal(
    buildUrl(BASE, "/tasks", { completed: false }),
    "http://127.0.0.1:5505/api/tasks?completed=false"
  );
  assert.equal(
    buildUrl(BASE, "/debug/delay", { ms: 0 }),
    "http://127.0.0.1:5505/api/debug/delay?ms=0"
  );
});

await check("buildUrl: пропускает undefined, null и пустую строку", () => {
  const url = buildUrl(BASE, "/tasks", {
    completed: false,
    priority: undefined,
    categoryId: null,
    q: "",
  });

  assert.equal(url, "http://127.0.0.1:5505/api/tasks?completed=false");
  assert.equal(buildUrl(BASE, "/tasks", {}), "http://127.0.0.1:5505/api/tasks");
});

await check("buildUrl: не изменяет переданный объект query", () => {
  const query = { completed: false, q: "провер" };
  const snapshot = JSON.stringify(query);

  buildUrl(BASE, "/tasks", query);

  assert.equal(JSON.stringify(query), snapshot);
  assert.deepEqual(Object.keys(query), ["completed", "q"]);
});

await check("buildUrl: отклоняет некорректные аргументы", () => {
  assert.throws(() => buildUrl("/api", "/tasks"), TypeError, "относительный baseUrl");
  assert.throws(() => buildUrl("ftp://example.com", "/tasks"), TypeError, "другая схема");
  assert.throws(() => buildUrl(`${BASE}?page=1`, "/tasks"), TypeError, "query внутри baseUrl");
  assert.throws(() => buildUrl(`${BASE}#top`, "/tasks"), TypeError, "hash внутри baseUrl");
  assert.throws(() => buildUrl("", "/tasks"), TypeError, "пустой baseUrl");
  assert.throws(() => buildUrl(BASE, ""), TypeError, "пустой путь");
  assert.throws(() => buildUrl(BASE, "/tasks", []), TypeError, "query не объект");
  assert.throws(() => buildUrl(BASE, "/tasks", null), TypeError, "query равен null");
});

// --- Конфигурация клиента ----------------------------------------------------

await check("createApiClient: проверяет конфигурацию при создании", () => {
  assert.throws(() => createApiClient(), TypeError, "конфигурация обязательна");
  assert.throws(() => createApiClient({ baseUrl: "" }), TypeError, "пустой baseUrl");
  assert.throws(() => createApiClient({ baseUrl: "/api" }), TypeError, "относительный baseUrl");
  assert.throws(() => createApiClient({ baseUrl: BASE, fetchFn: null }), TypeError, "fetchFn");
  assert.throws(() => createApiClient({ baseUrl: BASE, timeoutMs: 0 }), TypeError, "timeoutMs");

  const client = createApiClient({ baseUrl: BASE, fetchFn: async () => jsonResponse({}) });

  assert.equal(typeof client.requestJson, "function");
  assert.equal(client.baseUrl, BASE);
});

await check("requestJson: отправляет GET с заголовком Accept и сигналом", async () => {
  const fetchFn = recordingFetch(jsonResponse({ data: [] }));
  const client = createApiClient({ baseUrl: BASE, fetchFn });

  await client.requestJson("/tasks");

  assert.equal(fetchFn.calls.length, 1);

  const { url, init } = fetchFn.calls[0];

  assert.equal(url, "http://127.0.0.1:5505/api/tasks");
  assert.equal(init.method, "GET");
  assert.equal(init.headers.Accept, "application/json");
  assert.ok(init.signal instanceof AbortSignal, "сигнал передаётся самому fetch");
});

// --- Успешные ответы ---------------------------------------------------------

await check("requestJson: возвращает разобранный JSON", async () => {
  const payload = collection([task()]);
  const client = createApiClient({ baseUrl: BASE, fetchFn: recordingFetch(jsonResponse(payload)) });

  assert.deepEqual(await client.requestJson("/tasks"), payload);
});

await check("requestJson: для статуса 204 возвращает null без разбора тела", async () => {
  const client = createApiClient({ baseUrl: BASE, fetchFn: recordingFetch(emptyResponse(204)) });

  assert.equal(await client.requestJson("/tasks"), null);
});

await check("requestJson: передаёт query-параметры в URL", async () => {
  const fetchFn = recordingFetch(jsonResponse(collection([])));
  const client = createApiClient({ baseUrl: BASE, fetchFn });

  await client.requestJson("/tasks", { query: { completed: false, q: "провер" } });

  const url = new URL(fetchFn.calls[0].url);

  assert.equal(url.pathname, "/api/tasks");
  assert.equal(url.searchParams.get("completed"), "false");
  assert.equal(url.searchParams.get("q"), "провер");
});

// --- Ошибки ------------------------------------------------------------------

await check("requestJson: HTTP-ошибка с телом error даёт kind http", async () => {
  const body = {
    error: { code: "TASK_NOT_FOUND", message: "Задача с id 999 не найдена.", details: { id: 999 } },
  };
  const client = createApiClient({
    baseUrl: BASE,
    fetchFn: recordingFetch(jsonResponse(body, { status: 404 })),
  });

  const error = await catchApiError(client.requestJson("/tasks/999"));

  assert.equal(error.kind, "http");
  assert.equal(error.status, 404);
  assert.equal(error.code, "TASK_NOT_FOUND");
  assert.deepEqual(error.details, { id: 999 });
  assert.equal(error.message, "Задача с id 999 не найдена.");
  assert.equal(error.url, "http://127.0.0.1:5505/api/tasks/999");
});

await check("requestJson: HTTP-ошибка без пригодного JSON сохраняет kind http и статус", async () => {
  const brokenJson = createApiClient({
    baseUrl: BASE,
    fetchFn: recordingFetch(jsonResponse("{не json", { status: 500 })),
  });
  const first = await catchApiError(brokenJson.requestJson("/tasks"));

  assert.equal(first.kind, "http");
  assert.equal(first.status, 500);
  assert.equal(first.code, undefined);
  assert.ok(first.message.includes("500"));

  const htmlBody = createApiClient({
    baseUrl: BASE,
    fetchFn: recordingFetch(
      jsonResponse("<html>503</html>", { status: 503, contentType: "text/html" })
    ),
  });
  const second = await catchApiError(htmlBody.requestJson("/tasks"));

  assert.equal(second.kind, "http");
  assert.equal(second.status, 503);
});

await check("requestJson: отказ fetch даёт kind network, а не http", async () => {
  const client = createApiClient({
    baseUrl: BASE,
    fetchFn: async () => {
      throw new TypeError("fetch failed");
    },
  });

  const error = await catchApiError(client.requestJson("/tasks"));

  assert.equal(error.kind, "network");
  assert.equal(error.status, undefined);
  assert.ok(error.cause instanceof TypeError);
  assert.equal(error.url, "http://127.0.0.1:5505/api/tasks");
});

await check("requestJson: неверный Content-Type даёт invalid-response", async () => {
  const text = createApiClient({
    baseUrl: BASE,
    fetchFn: recordingFetch(jsonResponse("просто текст", { contentType: "text/plain" })),
  });
  const first = await catchApiError(text.requestJson("/debug/text"));

  assert.equal(first.kind, "invalid-response");
  assert.equal(first.status, 200);

  const missing = createApiClient({
    baseUrl: BASE,
    fetchFn: recordingFetch({
      status: 200,
      ok: true,
      headers: { get: () => null },
      json: async () => ({ data: [] }),
    }),
  });
  const second = await catchApiError(missing.requestJson("/tasks"));

  assert.equal(second.kind, "invalid-response");
  assert.ok(second.message.includes("отсутствует"));
});

await check("requestJson: повреждённый JSON при статусе 200 даёт invalid-response", async () => {
  const client = createApiClient({
    baseUrl: BASE,
    fetchFn: recordingFetch(jsonResponse('{"data": [{"id": 1,')),
  });

  const error = await catchApiError(client.requestJson("/debug/invalid-json"));

  assert.equal(error.kind, "invalid-response");
  assert.equal(error.status, 200);
  assert.ok(error.cause instanceof SyntaxError);
});

await check("requestJson: значение, не являющееся Response, отклоняется", async () => {
  for (const value of [null, undefined, "ответ", 200, { data: [] }]) {
    const client = createApiClient({ baseUrl: BASE, fetchFn: async () => value });
    const error = await catchApiError(client.requestJson("/tasks"));

    assert.equal(error.kind, "invalid-response", `значение ${JSON.stringify(value)} не Response`);
  }
});

// --- Тайм-аут и отмена -------------------------------------------------------

await check("requestJson: истечение времени ожидания даёт kind timeout", async () => {
  const client = createApiClient({
    baseUrl: BASE,
    // fetchFn уважает сигнал и отклоняется при его срабатывании.
    fetchFn: pendingUntilAbort("TimeoutError"),
  });

  const error = await catchApiError(client.requestJson("/debug/delay", { timeoutMs: 15 }));

  assert.equal(error.kind, "timeout");
  assert.ok(error.message.length > 0);
  assert.equal(error.url, "http://127.0.0.1:5505/api/debug/delay");
});

await check("requestJson: внешняя отмена даёт kind aborted, а не timeout", async () => {
  const client = createApiClient({
    baseUrl: BASE,
    fetchFn: pendingUntilAbort(),
  });

  const controller = new AbortController();
  const pending = client.requestJson("/debug/delay", {
    signal: controller.signal,
    timeoutMs: 1000,
  });

  controller.abort();

  const error = await catchApiError(pending);

  assert.equal(error.kind, "aborted");

  // Уже отменённый сигнал не должен приводить к обращению к сети.
  const fetchFn = recordingFetch(jsonResponse({ data: [] }));
  const second = createApiClient({ baseUrl: BASE, fetchFn });
  const already = await catchApiError(
    second.requestJson("/tasks", { signal: AbortSignal.abort() })
  );

  assert.equal(already.kind, "aborted");
  assert.equal(fetchFn.calls.length, 0, "запрос не отправляется");
});

// --- Предметный API ----------------------------------------------------------

await check("createTaskApi: проверяет клиент и нормализует фильтры", async () => {
  assert.throws(() => createTaskApi(null), TypeError);
  assert.throws(() => createTaskApi({}), TypeError);

  const fetchFn = recordingFetch(jsonResponse(collection([task()])));
  const api = createTaskApi(createApiClient({ baseUrl: BASE, fetchFn }));

  await api.getTasks({ completed: false, priority: "high", categoryId: 2, q: "" });

  const url = new URL(fetchFn.calls[0].url);

  assert.equal(url.searchParams.get("completed"), "false");
  assert.equal(url.searchParams.get("priority"), "high");
  assert.equal(url.searchParams.get("categoryId"), "2");
  assert.equal(url.searchParams.has("q"), false, "пустая строка не передаётся");
});

await check("createTaskApi: недопустимый фильтр отклоняется до запроса", async () => {
  const fetchFn = recordingFetch(jsonResponse(collection([])));
  const api = createTaskApi(createApiClient({ baseUrl: BASE, fetchFn }));

  const cases = [
    { unknown: 1 },
    { completed: "false" },
    { priority: "urgent" },
    { categoryId: 0 },
    { categoryId: 1.5 },
    { q: 42 },
    { q: "x".repeat(101) },
  ];

  for (const filters of cases) {
    await assert.rejects(
      () => api.getTasks(filters),
      TypeError,
      `фильтры ${JSON.stringify(filters)} недопустимы`
    );
  }

  await assert.rejects(() => api.getTasks([]), TypeError, "filters должен быть объектом");
  assert.equal(fetchFn.calls.length, 0, "ни один запрос не отправлен");
});

await check("getTasks: проверяет форму полученных задач", async () => {
  const broken = [
    collection([task({ id: 0 })]),
    collection([task({ id: "4" })]),
    collection([task({ title: "   " })]),
    collection([task({ title: "x".repeat(101) })]),
    collection([task({ completed: "false" })]),
    collection([task({ priority: "urgent" })]),
    collection([task({ categoryId: -1 })]),
    collection([null]),
    { data: "не массив", meta: { total: 0 } },
    { meta: { total: 0 } },
    null,
  ];

  for (const payload of broken) {
    const api = createTaskApi(
      createApiClient({ baseUrl: BASE, fetchFn: recordingFetch(jsonResponse(payload)) })
    );
    const error = await catchApiError(api.getTasks());

    assert.equal(error.kind, "invalid-response", `ответ ${JSON.stringify(payload)} непригоден`);
  }

  const valid = createTaskApi(
    createApiClient({ baseUrl: BASE, fetchFn: recordingFetch(jsonResponse(collection([task()]))) })
  );
  const result = await valid.getTasks();

  assert.deepEqual(result.tasks.map((item) => item.id), [4]);
  assert.equal(result.meta.total, 1);
});

await check("getTasks: повторяющиеся id и неверный meta.total отклоняются", async () => {
  const duplicates = createTaskApi(
    createApiClient({
      baseUrl: BASE,
      fetchFn: recordingFetch(jsonResponse(collection([task(), task()]))),
    })
  );
  const first = await catchApiError(duplicates.getTasks());

  assert.equal(first.kind, "invalid-response");
  assert.ok(first.message.includes("повторяющийся id"));

  const wrongTotal = createTaskApi(
    createApiClient({
      baseUrl: BASE,
      fetchFn: recordingFetch(jsonResponse({ data: [task()], meta: { total: 7 } })),
    })
  );
  const second = await catchApiError(wrongTotal.getTasks());

  assert.equal(second.kind, "invalid-response");
  assert.ok(second.message.includes("meta.total"));

  const noMeta = createTaskApi(
    createApiClient({ baseUrl: BASE, fetchFn: recordingFetch(jsonResponse({ data: [task()] })) })
  );
  const third = await catchApiError(noMeta.getTasks());

  assert.equal(third.kind, "invalid-response");
});

await check("getTaskById и getCategories используют свои маршруты и схемы", async () => {
  const taskFetch = recordingFetch(jsonResponse({ data: task({ id: 25 }) }));
  const taskApi = createTaskApi(createApiClient({ baseUrl: BASE, fetchFn: taskFetch }));

  assert.equal((await taskApi.getTaskById(25)).id, 25);
  assert.equal(taskFetch.calls[0].url, "http://127.0.0.1:5505/api/tasks/25");
  await assert.rejects(() => taskApi.getTaskById(0), TypeError);
  await assert.rejects(() => taskApi.getTaskById("25"), TypeError);

  const mismatched = createTaskApi(
    createApiClient({ baseUrl: BASE, fetchFn: recordingFetch(jsonResponse({ data: task({ id: 7 }) })) })
  );
  const mismatchError = await catchApiError(mismatched.getTaskById(25));

  assert.equal(mismatchError.kind, "invalid-response");

  const categoriesFetch = recordingFetch(
    jsonResponse(collection([{ id: 1, name: "Учёба" }, { id: 2, name: "Проект" }]))
  );
  const categoriesApi = createTaskApi(createApiClient({ baseUrl: BASE, fetchFn: categoriesFetch }));

  assert.deepEqual(await categoriesApi.getCategories(), [
    { id: 1, name: "Учёба" },
    { id: 2, name: "Проект" },
  ]);
  assert.equal(categoriesFetch.calls[0].url, "http://127.0.0.1:5505/api/categories");

  for (const payload of [
    collection([{ id: 1 }]),
    collection([{ id: 1, name: "  " }]),
    collection([{ id: 0, name: "Учёба" }]),
    collection([{ id: 1, name: "Учёба" }, { id: 1, name: "Проект" }]),
  ]) {
    const api = createTaskApi(
      createApiClient({ baseUrl: BASE, fetchFn: recordingFetch(jsonResponse(payload)) })
    );
    const error = await catchApiError(api.getCategories());

    assert.equal(error.kind, "invalid-response");
  }
});

await check("loadInitialData: независимые запросы начинаются до общего ожидания", async () => {
  const started = [];
  let releaseTasks;

  const fetchFn = async (url) => {
    started.push(new URL(url).pathname);

    if (url.includes("/tasks")) {
      // Ответ задач задерживается: категории всё равно должны быть запрошены сразу.
      await new Promise((resolve) => {
        releaseTasks = resolve;
      });

      return jsonResponse(collection([task()], { filters: {} }));
    }

    return jsonResponse(collection([{ id: 2, name: "Проект" }]));
  };

  const api = createTaskApi(createApiClient({ baseUrl: BASE, fetchFn }));
  const pending = api.loadInitialData({ categoryId: 2 });

  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.deepEqual(
    started.sort(),
    ["/api/categories", "/api/tasks"],
    "оба запроса начаты до общего await"
  );

  releaseTasks();

  const result = await pending;

  assert.deepEqual(result.tasks.map((item) => item.id), [4]);
  assert.deepEqual(result.categories, [{ id: 2, name: "Проект" }]);
  assert.equal(result.meta.total, 1);
});

await check("loadInitialData: отказ одного запроса отклоняет общий результат", async () => {
  const api = createTaskApi(
    createApiClient({
      baseUrl: BASE,
      fetchFn: async (url) => {
        if (url.includes("/categories")) {
          return jsonResponse(
            { error: { code: "SERVICE_UNAVAILABLE", message: "Сервис недоступен." } },
            { status: 503 }
          );
        }

        return jsonResponse(collection([task()]));
      },
    })
  );

  const error = await catchApiError(api.loadInitialData());

  assert.equal(error.kind, "http");
  assert.equal(error.status, 503);
  assert.equal(error.code, "SERVICE_UNAVAILABLE");
});

console.log("");
console.log(`Итог клиента: успешно ${passed}, ошибок ${failed}.`);

if (failed > 0) {
  process.exitCode = 1;
}
