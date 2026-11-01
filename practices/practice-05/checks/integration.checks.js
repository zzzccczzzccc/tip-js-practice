// Интеграционные проверки клиента с настоящим учебным API.
// Набор сам поднимает сервер на свободном порту: отдельно npm start не требуется.
// Запуск: node checks/integration.checks.js

import assert from "node:assert/strict";

import { startApiServer } from "../api/server.mjs";
import { ApiError, createApiClient } from "../src/api-client.js";
import { createTaskApi } from "../src/task-api.js";
import { variantFilters, variantNumber } from "../src/variant.js";

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

async function catchApiError(promise) {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof ApiError, `ожидался ApiError, получено ${error.name}: ${error.message}`);

    return error;
  }

  throw new assert.AssertionError({ message: "ожидался отказ, но операция завершилась успешно" });
}

const { server, baseUrl } = await startApiServer(0);
const client = createApiClient({ baseUrl, timeoutMs: 1500 });
const api = createTaskApi(client);
const ids = (items) => items.map((item) => item.id);

await check("GET /health через общий клиент возвращает JSON", async () => {
  const payload = await client.requestJson("/health");

  assert.equal(payload.data.status, "ok");
  assert.equal(payload.data.tasks, 12);
});

await check("getTasks без фильтров возвращает полный набор", async () => {
  const { tasks, meta } = await api.getTasks();

  assert.deepEqual(ids(tasks), [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34]);
  assert.equal(meta.total, 12);
});

await check("Контрольный фильтр completed=false и priority=high даёт [4, 13, 34]", async () => {
  const { tasks, meta } = await api.getTasks({ completed: false, priority: "high" });

  assert.deepEqual(ids(tasks), [4, 13, 34]);
  assert.equal(meta.total, 3);
  assert.equal(meta.filters.completed, false);
  assert.equal(meta.filters.priority, "high");
});

await check("getTaskById(25) возвращает существующую задачу", async () => {
  const task = await api.getTaskById(25);

  assert.equal(task.id, 25);
  assert.equal(task.title, "Настроить структуру проекта");
  assert.equal(task.completed, true);
  assert.equal(task.priority, "high");
  assert.equal(task.categoryId, 2);
});

await check("getTaskById(999) даёт HTTP-ошибку TASK_NOT_FOUND", async () => {
  const error = await catchApiError(api.getTaskById(999));

  assert.equal(error.kind, "http");
  assert.equal(error.status, 404);
  assert.equal(error.code, "TASK_NOT_FOUND");
  assert.deepEqual(error.details, { id: 999 });
});

await check("getCategories возвращает три категории", async () => {
  const categories = await api.getCategories();

  assert.deepEqual(
    categories.map((item) => `${item.id}:${item.name}`),
    ["1:Учёба", "2:Проект", "3:Организация"]
  );
});

await check("loadInitialData загружает задачи и категории вместе", async () => {
  const { tasks, categories, meta } = await api.loadInitialData({ completed: false, priority: "high" });

  assert.deepEqual(ids(tasks), [4, 13, 34]);
  assert.equal(categories.length, 3);
  assert.equal(meta.total, 3);
});

await check("Индивидуальный вариант задаётся только данными", async () => {
  assert.equal(variantNumber, 6);
  assert.deepEqual(variantFilters, { categoryId: 2 });

  const { tasks, meta } = await api.getTasks(variantFilters);

  assert.deepEqual(ids(tasks), [4, 16, 22, 25, 28, 34]);
  assert.equal(meta.total, 6);
  assert.equal(meta.filters.categoryId, 2);
});

await check("Неверный параметр запроса даёт HTTP 400 INVALID_QUERY", async () => {
  const error = await catchApiError(client.requestJson("/tasks", { query: { unknown: 1 } }));

  assert.equal(error.kind, "http");
  assert.equal(error.status, 400);
  assert.equal(error.code, "INVALID_QUERY");
});

await check("Отладочный 503 даёт kind http, а не network", async () => {
  const error = await catchApiError(client.requestJson("/debug/error"));

  assert.equal(error.kind, "http");
  assert.equal(error.status, 503);
  assert.equal(error.code, "SERVICE_UNAVAILABLE");
});

await check("Повреждённый JSON и текст вместо JSON дают invalid-response", async () => {
  const broken = await catchApiError(client.requestJson("/debug/invalid-json"));

  assert.equal(broken.kind, "invalid-response");
  assert.equal(broken.status, 200);

  const text = await catchApiError(client.requestJson("/debug/text"));

  assert.equal(text.kind, "invalid-response");
  assert.equal(text.status, 200);
});

await check("Тайм-аут и внешняя отмена различаются", async () => {
  const timeout = await catchApiError(
    client.requestJson("/debug/delay", { query: { ms: 150 }, timeoutMs: 20 })
  );

  assert.equal(timeout.kind, "timeout");

  const controller = new AbortController();
  const pending = client.requestJson("/debug/delay", {
    query: { ms: 150 },
    signal: controller.signal,
    timeoutMs: 1000,
  });

  controller.abort();

  const aborted = await catchApiError(pending);

  assert.equal(aborted.kind, "aborted");
});

await check("Остановленный сервер даёт сетевую ошибку, повторный запуск восстанавливает запросы", async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

  const network = await catchApiError(api.getTasks());

  assert.equal(network.kind, "network");
  assert.equal(network.status, undefined);

  const restarted = await startApiServer(0);
  const restored = createTaskApi(createApiClient({ baseUrl: restarted.baseUrl, timeoutMs: 1500 }));
  const { tasks } = await restored.getTasks({ categoryId: 2 });

  assert.deepEqual(ids(tasks), [4, 16, 22, 25, 28, 34]);

  await new Promise((resolve, reject) => {
    restarted.server.close((error) => (error ? reject(error) : resolve()));
  });
});

console.log("");
console.log(`Итог интеграции: успешно ${passed}, ошибок ${failed}.`);

if (failed > 0) {
  process.exitCode = 1;
}
