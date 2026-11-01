// Дополнительное задание, вариант А: частичный результат через Promise.allSettled.
// Основной loadInitialData не заменяется: здесь отказ одного запроса не отменяет результат другого.

import { ApiError } from "./api-client.js";

/** Приводит любую причину отказа к одинаковому описанию. */
function describeError(reason) {
  if (reason instanceof ApiError) {
    return {
      kind: reason.kind,
      status: reason.status ?? null,
      code: reason.code ?? null,
      message: reason.message,
    };
  }

  return {
    kind: "invalid-response",
    status: null,
    code: null,
    message: reason instanceof Error ? reason.message : String(reason),
  };
}

/**
 * Контракт результата:
 * {
 *   ok: boolean,          // оба запроса успешны
 *   partial: boolean,     // успешен ровно один запрос
 *   tasks: task[] | null,
 *   meta: object | null,
 *   categories: category[] | null,
 *   errors: Array<{ resource, kind, status, code, message }>
 * }
 */
export async function loadDataSettled(api, filters = {}) {
  if (api === null || typeof api !== "object" || typeof api.getTasks !== "function") {
    throw new TypeError("loadDataSettled: ожидается предметный API задач.");
  }

  const settled = await Promise.allSettled([api.getTasks(filters), api.getCategories()]);
  const [tasksResult, categoriesResult] = settled;

  const errors = [];
  let tasks = null;
  let meta = null;
  let categories = null;

  if (tasksResult.status === "fulfilled") {
    tasks = tasksResult.value.tasks;
    meta = tasksResult.value.meta;
  } else {
    errors.push({ resource: "tasks", ...describeError(tasksResult.reason) });
  }

  if (categoriesResult.status === "fulfilled") {
    categories = categoriesResult.value;
  } else {
    errors.push({ resource: "categories", ...describeError(categoriesResult.reason) });
  }

  return {
    ok: errors.length === 0,
    partial: errors.length === 1,
    tasks,
    meta,
    categories,
    errors,
  };
}
