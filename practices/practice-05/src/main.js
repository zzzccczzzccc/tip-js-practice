// Контрольный консольный сценарий ПР5.
// Адрес API берётся из переменной среды API_URL, иначе используется адрес по умолчанию.

import { ApiError, buildUrl, createApiClient } from "./api-client.js";
import { createTaskApi } from "./task-api.js";
import { loadDataSettled } from "./partial-load.js";
import { variantFilters, variantNumber } from "./variant.js";

const baseUrl = process.env.API_URL ?? "http://127.0.0.1:5505/api";
const client = createApiClient({ baseUrl, timeoutMs: 2000 });
const api = createTaskApi(client);

const ids = (items) => items.map((item) => item.id);

function describe(error) {
  if (!(error instanceof ApiError)) {
    return `неожидаемая ошибка ${error.name}: ${error.message}`;
  }

  const parts = [`kind=${error.kind}`];

  if (error.status !== undefined) {
    parts.push(`status=${error.status}`);
  }

  if (error.code !== undefined) {
    parts.push(`code=${error.code}`);
  }

  return `${parts.join(" ")} | ${error.message}`;
}

async function step(title, body) {
  console.log(`\n== ${title}`);

  try {
    await body();
  } catch (error) {
    console.log(`  необработанный отказ: ${describe(error)}`);
  }
}

async function run() {
  console.log(`Адрес API: ${baseUrl}`);

  await step("Начальная загрузка: задачи completed=false, priority=high и категории", async () => {
    const url = buildUrl(baseUrl, "/tasks", { completed: false, priority: "high" });

    console.log(`  URL задач: ${url}`);

    const { tasks, categories, meta } = await api.loadInitialData({
      completed: false,
      priority: "high",
    });

    console.log(`  задачи: ${JSON.stringify(ids(tasks))} | meta.total = ${meta.total}`);
    console.log(`  категории: ${categories.map((item) => `${item.id}:${item.name}`).join(", ")}`);
  });

  await step("Одна задача по идентификатору", async () => {
    const task = await api.getTaskById(25);

    console.log(`  задача 25: ${task.title} | priority=${task.priority} | completed=${task.completed}`);
  });

  await step("Обработанная ошибка: задача 999 отсутствует", async () => {
    try {
      await api.getTaskById(999);
      console.log("  ошибка не возникла, хотя ожидалась");
    } catch (error) {
      console.log(`  перехвачено: ${describe(error)}`);
      console.log(`  details: ${JSON.stringify(error.details)}`);
    }
  });

  await step("Ограничение времени ожидания", async () => {
    try {
      await client.requestJson("/debug/delay", { query: { ms: 150 }, timeoutMs: 20 });
      console.log("  ответ получен, хотя ожидался тайм-аут");
    } catch (error) {
      console.log(`  перехвачено: ${describe(error)}`);
    }
  });

  await step("Внешняя отмена запроса", async () => {
    const controller = new AbortController();
    const pending = client.requestJson("/debug/delay", {
      query: { ms: 150 },
      signal: controller.signal,
      timeoutMs: 1000,
    });

    controller.abort();

    try {
      await pending;
      console.log("  ответ получен, хотя ожидалась отмена");
    } catch (error) {
      console.log(`  перехвачено: ${describe(error)}`);
    }
  });

  await step(`Индивидуальный вариант ${variantNumber}`, async () => {
    const url = buildUrl(baseUrl, "/tasks", variantFilters);

    console.log(`  фильтры: ${JSON.stringify(variantFilters)}`);
    console.log(`  URL: ${url}`);

    const { tasks, meta } = await api.getTasks(variantFilters);

    console.log(`  id: ${JSON.stringify(ids(tasks))}`);
    console.log(`  meta.total = ${meta.total} | meta.filters = ${JSON.stringify(meta.filters)}`);
  });

  await step("Дополнительное задание: частичный результат", async () => {
    const result = await loadDataSettled(api, variantFilters);

    console.log(`  ok=${result.ok} partial=${result.partial} ошибок=${result.errors.length}`);
    console.log(
      `  задачи: ${result.tasks === null ? "нет" : JSON.stringify(ids(result.tasks))} | категории: ${
        result.categories === null ? "нет" : result.categories.length
      }`
    );
  });
}

run().catch((error) => {
  console.error(`Сценарий прерван: ${describe(error)}`);
  process.exitCode = 1;
});
