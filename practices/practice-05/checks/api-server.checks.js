// Проверки готового учебного API. Набор подтверждает контракт сервера и проходит
// без изменения файлов api/. Сервер поднимается на свободном временном порту.
// Запуск: node checks/api-server.checks.js

import assert from "node:assert/strict";

import { startApiServer } from "../api/server.mjs";

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

const { server, baseUrl } = await startApiServer(0);

/** Выполняет запрос и возвращает статус, заголовки и сырое тело. */
async function get(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();

  return {
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    allow: response.headers.get("allow"),
    cors: response.headers.get("access-control-allow-origin"),
    text,
    json: () => JSON.parse(text),
  };
}

const ids = (items) => items.map((item) => item.id);

await check("GET /health возвращает состояние сервиса", async () => {
  const response = await get("/health");

  assert.equal(response.status, 200);
  assert.ok(response.contentType.includes("application/json"));

  const payload = response.json();

  assert.equal(payload.data.status, "ok");
  assert.equal(payload.data.tasks, 12);
  assert.equal(payload.data.categories, 3);
});

await check("GET /tasks возвращает все 12 задач и согласованную meta", async () => {
  const payload = (await get("/tasks")).json();

  assert.deepEqual(ids(payload.data), [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34]);
  assert.equal(payload.meta.total, payload.data.length);
  assert.deepEqual(payload.meta.filters, {
    completed: null,
    priority: null,
    categoryId: null,
    q: "",
  });

  for (const task of payload.data) {
    assert.deepEqual(Object.keys(task).sort(), [
      "categoryId",
      "completed",
      "id",
      "priority",
      "title",
    ]);
  }
});

await check("GET /tasks?completed=false отбирает невыполненные задачи", async () => {
  const payload = (await get("/tasks?completed=false")).json();

  assert.deepEqual(ids(payload.data), [4, 7, 13, 19, 22, 28, 34]);
  assert.equal(payload.meta.total, 7);
  assert.equal(payload.meta.filters.completed, false);
});

await check("GET /tasks?priority=high отбирает задачи высокого приоритета", async () => {
  const payload = (await get("/tasks?priority=high")).json();

  assert.deepEqual(ids(payload.data), [4, 13, 16, 25, 34]);
  assert.equal(payload.meta.total, 5);
});

await check("GET /tasks?categoryId=2 отбирает задачи категории", async () => {
  const payload = (await get("/tasks?categoryId=2")).json();

  assert.deepEqual(ids(payload.data), [4, 16, 22, 25, 28, 34]);
  assert.equal(payload.meta.filters.categoryId, 2);
});

await check("GET /tasks?q=... ищет по названию без учёта регистра", async () => {
  const lower = (await get(`/tasks?q=${encodeURIComponent("провер")}`)).json();

  assert.deepEqual(ids(lower.data), [7, 16]);

  const upper = (await get(`/tasks?q=${encodeURIComponent("ПРОВЕР")}`)).json();

  assert.deepEqual(ids(upper.data), [7, 16]);

  const spaced = (await get(`/tasks?q=${encodeURIComponent("контракт API")}`)).json();

  assert.deepEqual(ids(spaced.data), [28]);
  assert.equal(spaced.meta.filters.q, "контракт API");
});

await check("GET /tasks применяет два фильтра одновременно", async () => {
  const payload = (await get("/tasks?completed=false&priority=high")).json();

  assert.deepEqual(ids(payload.data), [4, 13, 34]);
  assert.deepEqual(payload.meta.filters, {
    completed: false,
    priority: "high",
    categoryId: null,
    q: "",
  });
});

await check("GET /tasks применяет три фильтра одновременно", async () => {
  const payload = (await get("/tasks?completed=false&priority=high&categoryId=2")).json();

  assert.deepEqual(ids(payload.data), [4, 34]);
  assert.equal(payload.meta.total, 2);
});

await check("GET /tasks отклоняет неверное значение фильтра", async () => {
  for (const query of ["?completed=maybe", "?priority=urgent", "?categoryId=0", "?categoryId=x"]) {
    const response = await get(`/tasks${query}`);

    assert.equal(response.status, 400, `запрос ${query} должен быть отклонён`);
    assert.equal(response.json().error.code, "INVALID_QUERY");
  }
});

await check("GET /tasks отклоняет повторение одного параметра", async () => {
  const response = await get("/tasks?priority=high&priority=low");

  assert.equal(response.status, 400);

  const error = response.json().error;

  assert.equal(error.code, "INVALID_QUERY");
  assert.equal(error.details.parameter, "priority");
});

await check("GET /tasks отклоняет неизвестный параметр", async () => {
  const response = await get("/tasks?unknown=1");

  assert.equal(response.status, 400);

  const error = response.json().error;

  assert.equal(error.code, "INVALID_QUERY");
  assert.equal(error.details.parameter, "unknown");
  assert.deepEqual(error.details.allowed, ["completed", "priority", "categoryId", "q"]);
});

await check("GET /tasks/:id возвращает одну задачу", async () => {
  const response = await get("/tasks/25");

  assert.equal(response.status, 200);
  assert.deepEqual(response.json().data, {
    id: 25,
    title: "Настроить структуру проекта",
    completed: true,
    priority: "high",
    categoryId: 2,
  });
});

await check("GET /tasks/999 возвращает 404 TASK_NOT_FOUND", async () => {
  const response = await get("/tasks/999");

  assert.equal(response.status, 404);
  assert.ok(response.contentType.includes("application/json"));

  const error = response.json().error;

  assert.equal(error.code, "TASK_NOT_FOUND");
  assert.ok(error.message.length > 0);
  assert.deepEqual(error.details, { id: 999 });
});

await check("GET /tasks/abc возвращает 400 INVALID_ID", async () => {
  const response = await get("/tasks/abc");

  assert.equal(response.status, 400);
  assert.equal(response.json().error.code, "INVALID_ID");
});

await check("Маршруты категорий работают по тому же контракту", async () => {
  const all = await get("/categories");

  assert.equal(all.status, 200);

  const payload = all.json();

  assert.deepEqual(payload.data, [
    { id: 1, name: "Учёба" },
    { id: 2, name: "Проект" },
    { id: 3, name: "Организация" },
  ]);
  assert.equal(payload.meta.total, 3);

  const one = await get("/categories/2");

  assert.equal(one.status, 200);
  assert.deepEqual(one.json().data, { id: 2, name: "Проект" });

  const missing = await get("/categories/99");

  assert.equal(missing.status, 404);
  assert.equal(missing.json().error.code, "CATEGORY_NOT_FOUND");
});

await check("Ответы содержат заголовки CORS, а OPTIONS обрабатывается отдельно", async () => {
  const response = await get("/tasks");

  assert.equal(response.cors, "*");

  const preflight = await get("/tasks", { method: "OPTIONS" });

  assert.equal(preflight.status, 204);
  assert.equal(preflight.cors, "*");
  assert.equal(preflight.text, "");
});

await check("Неподдерживаемый метод и неизвестный путь обрабатываются", async () => {
  const post = await get("/tasks", { method: "POST" });

  assert.equal(post.status, 405);
  assert.equal(post.allow, "GET, OPTIONS");
  assert.equal(post.json().error.code, "METHOD_NOT_ALLOWED");

  const unknown = await get("/unknown");

  assert.equal(unknown.status, 404);
  assert.equal(unknown.json().error.code, "NOT_FOUND");

  const outside = await fetch(`${baseUrl.replace("/api", "")}/index.html`);

  assert.equal(outside.status, 404);
});

await check("Отладочные маршруты дают воспроизводимые ошибочные ответы", async () => {
  const serviceError = await get("/debug/error");

  assert.equal(serviceError.status, 503);
  assert.equal(serviceError.json().error.code, "SERVICE_UNAVAILABLE");

  const brokenJson = await get("/debug/invalid-json");

  assert.equal(brokenJson.status, 200);
  assert.ok(brokenJson.contentType.includes("application/json"));
  assert.throws(() => JSON.parse(brokenJson.text), SyntaxError);

  const text = await get("/debug/text");

  assert.equal(text.status, 200);
  assert.ok(text.contentType.includes("text/plain"));

  const started = Date.now();
  const delayed = await get("/debug/delay?ms=120");

  assert.equal(delayed.status, 200);
  assert.equal(delayed.json().data.delayedMs, 120);
  assert.ok(Date.now() - started >= 100, "ответ не должен приходить раньше задержки");

  const invalidDelay = await get("/debug/delay?ms=99999");

  assert.equal(invalidDelay.status, 400);
  assert.equal(invalidDelay.json().error.code, "INVALID_QUERY");
});

server.close();

console.log("");
console.log(`Итог API: успешно ${passed}, ошибок ${failed}.`);

if (failed > 0) {
  process.exitCode = 1;
}
