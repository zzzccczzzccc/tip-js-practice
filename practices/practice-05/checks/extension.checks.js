// Проверки дополнительного задания: частичный результат через Promise.allSettled.
// Запуск: node checks/extension.checks.js

import assert from "node:assert/strict";

import { ApiError, createApiClient } from "../src/api-client.js";
import { loadDataSettled } from "../src/partial-load.js";

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

const tasksPayload = {
  data: [{ id: 4, title: "Подготовить модель задач", completed: false, priority: "high", categoryId: 2 }],
  meta: { total: 1, filters: {} },
};

const categoriesPayload = {
  data: [{ id: 2, name: "Проект" }],
  meta: { total: 1 },
};

function jsonResponse(payload, { status = 200 } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => "application/json" },
    json: async () => payload,
  };
}

function httpError(status, code, message) {
  return jsonResponse({ error: { code, message } }, { status });
}

const { createTaskApi } = await import("../src/task-api.js");

function apiWith(fetchFn) {
  return createTaskApi(createApiClient({ baseUrl: BASE, fetchFn }));
}

await check("loadDataSettled: оба запроса успешны", async () => {
  const result = await loadDataSettled(
    apiWith(async (url) =>
      url.includes("/categories") ? jsonResponse(categoriesPayload) : jsonResponse(tasksPayload)
    )
  );

  assert.equal(result.ok, true);
  assert.equal(result.partial, false);
  assert.deepEqual(result.tasks.map((task) => task.id), [4]);
  assert.deepEqual(result.categories, [{ id: 2, name: "Проект" }]);
  assert.deepEqual(result.errors, []);
});

await check("loadDataSettled: ошибка задач при доступных категориях", async () => {
  const result = await loadDataSettled(
    apiWith(async (url) =>
      url.includes("/categories")
        ? jsonResponse(categoriesPayload)
        : httpError(503, "SERVICE_UNAVAILABLE", "Задачи недоступны.")
    )
  );

  assert.equal(result.ok, false);
  assert.equal(result.partial, true);
  assert.equal(result.tasks, null);
  assert.deepEqual(result.categories, [{ id: 2, name: "Проект" }]);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].resource, "tasks");
  assert.equal(result.errors[0].kind, "http");
  assert.equal(result.errors[0].status, 503);
});

await check("loadDataSettled: ошибка категорий при доступных задачах", async () => {
  const result = await loadDataSettled(
    apiWith(async (url) =>
      url.includes("/categories")
        ? httpError(500, "INTERNAL_ERROR", "Категории недоступны.")
        : jsonResponse(tasksPayload)
    )
  );

  assert.equal(result.ok, false);
  assert.equal(result.partial, true);
  assert.deepEqual(result.tasks.map((task) => task.id), [4]);
  assert.equal(result.categories, null);
  assert.equal(result.errors[0].resource, "categories");
  assert.equal(result.errors[0].kind, "http");
});

await check("loadDataSettled: ошибка обоих запросов", async () => {
  const result = await loadDataSettled(
    apiWith(async () => {
      throw new TypeError("fetch failed");
    })
  );

  assert.equal(result.ok, false);
  assert.equal(result.partial, false);
  assert.equal(result.tasks, null);
  assert.equal(result.categories, null);
  assert.equal(result.errors.length, 2);
  assert.ok(result.errors.every((item) => item.kind === "network"));
  assert.ok(result.errors[0] instanceof Object);
  assert.equal(typeof result.errors[0].message, "string");
  assert.ok(!(result instanceof ApiError));
});

console.log("");
console.log(`Итог расширения: успешно ${passed}, ошибок ${failed}.`);

if (failed > 0) {
  process.exitCode = 1;
}
