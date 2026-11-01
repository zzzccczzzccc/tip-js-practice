// Предметный клиент: знает маршруты задач и категорий и проверяет форму полученных данных.
// HTTP-детали (fetch, статусы, JSON) остаются в api-client.js.

import { ApiError } from "./api-client.js";

const ALLOWED_FILTERS = ["completed", "priority", "categoryId", "q"];
const PRIORITIES = ["low", "medium", "high"];
const TITLE_MAX_LENGTH = 100;

function invalid(message, details) {
  return new ApiError("invalid-response", message, { details });
}

/** Отбирает только допустимые фильтры. Строковое представление создаёт URLSearchParams. */
function normalizeFilters(filters) {
  if (filters === null || typeof filters !== "object" || Array.isArray(filters)) {
    throw new TypeError("filters должен быть обычным объектом.");
  }

  const query = {};

  for (const [name, value] of Object.entries(filters)) {
    if (!ALLOWED_FILTERS.includes(name)) {
      throw new TypeError(
        `Недопустимый фильтр: ${name}. Разрешены: ${ALLOWED_FILTERS.join(", ")}.`
      );
    }

    if (value === undefined || value === null || value === "") {
      continue;
    }

    if (name === "completed") {
      if (typeof value !== "boolean") {
        throw new TypeError("Фильтр completed должен быть логическим значением.");
      }
    } else if (name === "priority") {
      if (!PRIORITIES.includes(value)) {
        throw new TypeError(`Фильтр priority должен быть одним из: ${PRIORITIES.join(", ")}.`);
      }
    } else if (name === "categoryId") {
      if (!Number.isSafeInteger(value) || value <= 0) {
        throw new TypeError("Фильтр categoryId должен быть положительным целым числом.");
      }
    } else if (typeof value !== "string") {
      throw new TypeError("Фильтр q должен быть строкой.");
    } else if (value.length > TITLE_MAX_LENGTH) {
      throw new TypeError(`Фильтр q не должен быть длиннее ${TITLE_MAX_LENGTH} символов.`);
    }

    query[name] = value;
  }

  return query;
}

function assertTask(value, where) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw invalid(`${where}: задача должна быть объектом.`, { value });
  }

  const { id, title, completed, priority, categoryId } = value;

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw invalid(`${where}: поле id должно быть положительным целым числом.`, { id });
  }

  if (typeof title !== "string" || title.trim() === "" || title.trim().length > TITLE_MAX_LENGTH) {
    throw invalid(`${where}: поле title должно быть непустой строкой до ${TITLE_MAX_LENGTH} символов.`, {
      id,
      title,
    });
  }

  if (typeof completed !== "boolean") {
    throw invalid(`${where}: поле completed должно быть логическим значением.`, { id, completed });
  }

  if (!PRIORITIES.includes(priority)) {
    throw invalid(`${where}: поле priority должно быть одним из: ${PRIORITIES.join(", ")}.`, {
      id,
      priority,
    });
  }

  if (!Number.isSafeInteger(categoryId) || categoryId <= 0) {
    throw invalid(`${where}: поле categoryId должно быть положительным целым числом.`, {
      id,
      categoryId,
    });
  }

  return value;
}

function assertCategory(value, where) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw invalid(`${where}: категория должна быть объектом.`, { value });
  }

  if (!Number.isSafeInteger(value.id) || value.id <= 0) {
    throw invalid(`${where}: поле id должно быть положительным целым числом.`, { id: value.id });
  }

  if (typeof value.name !== "string" || value.name.trim() === "") {
    throw invalid(`${where}: поле name должно быть непустой строкой.`, { id: value.id });
  }

  return value;
}

function assertUniqueIds(items, where) {
  const seen = new Set();

  for (const item of items) {
    if (seen.has(item.id)) {
      throw invalid(`${where}: обнаружен повторяющийся id ${item.id}.`, { id: item.id });
    }

    seen.add(item.id);
  }
}

function assertCollection(payload, where) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw invalid(`${where}: ответ должен быть объектом с полем data.`, { payload });
  }

  if (!Array.isArray(payload.data)) {
    throw invalid(`${where}: поле data должно быть массивом.`, { data: payload.data });
  }

  return payload.data;
}

function assertMeta(payload, data, where) {
  const meta = payload.meta;

  if (meta === null || typeof meta !== "object" || Array.isArray(meta)) {
    throw invalid(`${where}: поле meta должно быть объектом.`, { meta });
  }

  if (meta.total !== data.length) {
    throw invalid(`${where}: meta.total (${meta.total}) не совпадает с длиной data (${data.length}).`, {
      total: meta.total,
      length: data.length,
    });
  }

  return meta;
}

export function createTaskApi(client) {
  if (client === null || typeof client !== "object" || typeof client.requestJson !== "function") {
    throw new TypeError("createTaskApi: ожидается клиент с методом requestJson.");
  }

  async function getTasks(filters = {}) {
    const query = normalizeFilters(filters);
    const payload = await client.requestJson("/tasks", { query });
    const data = assertCollection(payload, "GET /tasks");

    data.forEach((task) => assertTask(task, "GET /tasks"));
    assertUniqueIds(data, "GET /tasks");

    const meta = assertMeta(payload, data, "GET /tasks");

    return { tasks: data, meta };
  }

  async function getTaskById(id) {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new TypeError("getTaskById: id должен быть положительным целым числом.");
    }

    const payload = await client.requestJson(`/tasks/${id}`);

    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
      throw invalid("GET /tasks/:id: ответ должен быть объектом с полем data.", { payload });
    }

    const task = assertTask(payload.data, "GET /tasks/:id");

    if (task.id !== id) {
      throw invalid(`GET /tasks/:id: получена задача ${task.id} вместо ${id}.`, {
        requested: id,
        received: task.id,
      });
    }

    return task;
  }

  async function getCategories() {
    const payload = await client.requestJson("/categories");
    const data = assertCollection(payload, "GET /categories");

    data.forEach((category) => assertCategory(category, "GET /categories"));
    assertUniqueIds(data, "GET /categories");
    assertMeta(payload, data, "GET /categories");

    return data;
  }

  /** Независимые запросы начинаются до общего ожидания, поэтому выполняются одновременно. */
  async function loadInitialData(filters = {}) {
    const tasksPromise = getTasks(filters);
    const categoriesPromise = getCategories();

    const [tasksResult, categories] = await Promise.all([tasksPromise, categoriesPromise]);

    return { tasks: tasksResult.tasks, categories, meta: tasksResult.meta };
  }

  return { getTasks, getTaskById, getCategories, loadInitialData };
}
