import assert from "node:assert/strict";

import { startApiServer } from "../api/server.mjs";
import { ApiError, createApiClient } from "../src/api-client.js";
import { createTaskApi } from "../src/task-api.js";
import { getVariantFilters, variantNumber } from "../src/variant.js";

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

async function catchApi(promise) {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof ApiError, error.message);

    return error;
  }

  throw new Error("ожидался отказ");
}

const { server, baseUrl } = await startApiServer(0);
const api = createTaskApi(createApiClient({ baseUrl, timeoutMs: 1500 }));
const ids = (items) => items.map((item) => item.id);

await check("Исходный набор читается через предметный API", async () => {
  const { tasks, meta } = await api.getTasks();

  assert.equal(meta.total, 12);
  assert.deepEqual(ids(tasks), [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34]);
});

await check("Категории загружаются параллельно с задачами", async () => {
  const { tasks, categories } = await api.loadInitialData({ categoryId: 2 });

  assert.deepEqual(ids(tasks), [4, 16, 22, 25, 28, 34]);
  assert.equal(categories.length, 3);
});

await check("Создание назначает id 35 и completed false", async () => {
  const created = await api.createTask({
    title: "Изучить fetch",
    priority: "high",
    categoryId: 2,
  });

  assert.equal(created.id, 35);
  assert.equal(created.completed, false);
  assert.equal(created.title, "Изучить fetch");
});

await check("PATCH сохраняет completed при смене названия", async () => {
  const updated = await api.updateTask(16, { title: "Проверить ответы REST API" });

  assert.equal(updated.completed, true);
  assert.equal(updated.title, "Проверить ответы REST API");
  assert.equal(updated.priority, "high");
});

await check("setTaskCompleted переключает статус", async () => {
  const done = await api.setTaskCompleted(4, true);

  assert.equal(done.completed, true);
});

await check("deleteTask удаляет запись", async () => {
  assert.equal(await api.deleteTask(22), null);

  const error = await catchApi(api.getTaskById(22));

  assert.equal(error.status, 404);
});

await check("Фильтр после мутаций отражает серверное состояние", async () => {
  const { tasks } = await api.getTasks({ categoryId: 2, completed: false });

  assert.ok(ids(tasks).includes(35));
  assert.equal(ids(tasks).includes(4), false);
  assert.equal(ids(tasks).includes(22), false);
});

await check("Сервер отклоняет невалидное создание", async () => {
  const error = await catchApi(api.createTask({ title: "", priority: "high", categoryId: 2 }));

  assert.equal(error.kind, "http");
  assert.equal(error.status, 400);
  assert.equal(error.code, "VALIDATION_ERROR");
});

await check("Вариант 6: categoryId=2", async () => {
  assert.equal(variantNumber, 6);
  assert.deepEqual(getVariantFilters(), { categoryId: 2 });

  await api.resetDemoData();

  const { tasks, meta } = await api.getTasks(getVariantFilters());

  assert.deepEqual(ids(tasks), [4, 16, 22, 25, 28, 34]);
  assert.equal(meta.total, 6);
});

await check("resetDemoData возвращает 12 задач", async () => {
  const result = await api.resetDemoData();

  assert.equal(result.total, 12);

  const { meta } = await api.getTasks();

  assert.equal(meta.total, 12);
});

await check("Тайм-аут debug/delay даёт timeout", async () => {
  const client = createApiClient({ baseUrl, timeoutMs: 20 });
  const error = await catchApi(client.requestJson("/debug/delay", { query: { ms: 150 } }));

  assert.equal(error.kind, "timeout");
});

await check("Внешняя отмена даёт aborted", async () => {
  const controller = new AbortController();
  const pending = api.getTasks({}, { signal: controller.signal, });

  controller.abort();

  const error = await catchApi(pending);

  assert.equal(error.kind, "aborted");
});

await check("CORS preflight разрешает PATCH и DELETE", async () => {
  const response = await fetch(`${baseUrl}/tasks/4`, {
    method: "OPTIONS",
    headers: {
      Origin: "http://127.0.0.1:5506",
      "Access-Control-Request-Method": "PATCH",
    },
  });

  assert.equal(response.status, 204);
  assert.ok(response.headers.get("access-control-allow-methods").includes("PATCH"));
  assert.ok(response.headers.get("access-control-allow-methods").includes("DELETE"));
});

await check("Повторное создание после reset снова даёт id 35", async () => {
  await api.resetDemoData();

  const created = await api.createTask({ title: "Повтор", priority: "low", categoryId: 1 });

  assert.equal(created.id, 35);
});

server.close();

console.log("");
console.log(`Итог интеграции: успешно ${passed}, ошибок ${failed}.`);

if (failed > 0) {
  process.exitCode = 1;
}
