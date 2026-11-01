// Учебное изменяемое HTTP API практической работы № 6.
// Это готовая инфраструктура: данные хранятся в памяти и восстанавливаются после перезапуска.

import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

import { DELAY_MAX_MS, PRIORITIES, Q_MAX_LENGTH, categories, tasks } from "./data.js";

const DEFAULT_PORT = 5505;
const HOST = "127.0.0.1";
const BASE_PATH = "/api";

const TASK_FILTERS = ["completed", "priority", "categoryId", "q"];
const ALLOWED_METHODS = ["GET", "POST", "PATCH", "DELETE", "OPTIONS"];
const TITLE_MAX_LENGTH = 100;

let store = tasks.map((task) => ({ ...task }));
let nextId = Math.max(...store.map((task) => task.id)) + 1;

function resetStore() {
  store = tasks.map((task) => ({ ...task }));
  nextId = Math.max(...store.map((task) => task.id)) + 1;
}

const CORS_HEADERS = {
  // Заголовки отправляются для будущего браузерного клиента ПР6.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Accept, Content-Type",
  "Access-Control-Max-Age": "600",
};

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);

  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    ...CORS_HEADERS,
  });
  response.end(body);
}

function sendError(response, status, code, message, details) {
  const error = { code, message };

  if (details !== undefined) {
    error.details = details;
  }

  sendJson(response, status, { error });
}

function sendCollection(response, data, filters) {
  sendJson(response, 200, { data, meta: { total: data.length, filters } });
}

/** Разбирает и проверяет query-параметры списка задач. */
function parseTaskFilters(searchParams) {
  const names = [...searchParams.keys()];

  for (const name of names) {
    if (!TASK_FILTERS.includes(name)) {
      return {
        ok: false,
        message: `Неизвестный параметр запроса: ${name}.`,
        details: { parameter: name, allowed: TASK_FILTERS },
      };
    }

    if (searchParams.getAll(name).length > 1) {
      return {
        ok: false,
        message: `Параметр ${name} указан более одного раза.`,
        details: { parameter: name },
      };
    }
  }

  const filters = { completed: null, priority: null, categoryId: null, q: "" };

  if (searchParams.has("completed")) {
    const raw = searchParams.get("completed");

    if (raw !== "true" && raw !== "false") {
      return {
        ok: false,
        message: "Параметр completed принимает только значения true и false.",
        details: { parameter: "completed", value: raw },
      };
    }

    filters.completed = raw === "true";
  }

  if (searchParams.has("priority")) {
    const raw = searchParams.get("priority");

    if (!PRIORITIES.includes(raw)) {
      return {
        ok: false,
        message: `Параметр priority принимает только значения: ${PRIORITIES.join(", ")}.`,
        details: { parameter: "priority", value: raw },
      };
    }

    filters.priority = raw;
  }

  if (searchParams.has("categoryId")) {
    const raw = searchParams.get("categoryId");
    const value = Number(raw);

    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value <= 0) {
      return {
        ok: false,
        message: "Параметр categoryId должен быть положительным целым числом.",
        details: { parameter: "categoryId", value: raw },
      };
    }

    filters.categoryId = value;
  }

  if (searchParams.has("q")) {
    const raw = searchParams.get("q");

    if (raw.length > Q_MAX_LENGTH) {
      return {
        ok: false,
        message: `Параметр q не должен быть длиннее ${Q_MAX_LENGTH} символов.`,
        details: { parameter: "q", length: raw.length },
      };
    }

    filters.q = raw;
  }

  return { ok: true, filters };
}

function selectTasks(filters) {
  const needle = filters.q.trim().toLowerCase();

  return store.filter((task) => {
    if (filters.completed !== null && task.completed !== filters.completed) {
      return false;
    }

    if (filters.priority !== null && task.priority !== filters.priority) {
      return false;
    }

    if (filters.categoryId !== null && task.categoryId !== filters.categoryId) {
      return false;
    }

    if (needle !== "" && !task.title.toLowerCase().includes(needle)) {
      return false;
    }

    return true;
  });
}

function parseId(raw) {
  if (!/^\d+$/.test(raw)) {
    return null;
  }

  const value = Number(raw);

  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function handleDebug(request, response, segments, searchParams) {
  const [, name] = segments;

  if (name === "error") {
    sendError(
      response,
      503,
      "SERVICE_UNAVAILABLE",
      "Учебный сервис временно недоступен.",
      { retryAfterMs: 1000 }
    );

    return true;
  }

  if (name === "invalid-json") {
    // Статус успешный, Content-Type заявлен как JSON, но тело повреждено намеренно.
    const body = '{"data": [{"id": 1,';

    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": Buffer.byteLength(body),
      ...CORS_HEADERS,
    });
    response.end(body);

    return true;
  }

  if (name === "text") {
    const body = "Это обычный текст, а не JSON.";

    response.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Length": Buffer.byteLength(body),
      ...CORS_HEADERS,
    });
    response.end(body);

    return true;
  }

  if (name === "delay") {
    const raw = searchParams.get("ms") ?? "0";
    const ms = Number(raw);

    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(ms) || ms < 0 || ms > DELAY_MAX_MS) {
      sendError(
        response,
        400,
        "INVALID_QUERY",
        `Параметр ms должен быть целым числом от 0 до ${DELAY_MAX_MS}.`,
        { parameter: "ms", value: raw }
      );

      return true;
    }

    const timer = setTimeout(() => {
      sendJson(response, 200, { data: { delayedMs: ms } });
    }, ms);

    // Если клиент отменил запрос, отложенный ответ отправлять уже некуда.
    request.once("aborted", () => clearTimeout(timer));

    return true;
  }

  return false;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function parseJsonBody(raw, contentType) {
  if (raw === "") {
    return { ok: false, status: 400, code: "INVALID_BODY", message: "Тело запроса не должно быть пустым." };
  }

  if (!String(contentType ?? "").includes("application/json")) {
    return {
      ok: false,
      status: 415,
      code: "UNSUPPORTED_MEDIA_TYPE",
      message: "Ожидался Content-Type: application/json.",
    };
  }

  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, status: 400, code: "INVALID_JSON", message: "Тело запроса не является корректным JSON." };
  }
}

function validateDraft(body, { partial }) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, details: { body: "Тело должно быть объектом." } };
  }

  const details = {};
  const value = {};

  if (!partial) {
    if ("id" in body || "completed" in body) {
      return {
        ok: false,
        details: { extra: "Поля id и completed назначает сервер." },
      };
    }
  }

  if ("title" in body || !partial) {
    if (typeof body.title !== "string") {
      details.title = "Название должно быть строкой.";
    } else {
      const title = body.title.trim();

      if (title.length < 1 || title.length > TITLE_MAX_LENGTH) {
        details.title = "Название должно содержать от 1 до 100 символов.";
      } else {
        value.title = title;
      }
    }
  }

  if ("priority" in body || !partial) {
    if (!PRIORITIES.includes(body.priority)) {
      details.priority = `Приоритет должен быть одним из: ${PRIORITIES.join(", ")}.`;
    } else {
      value.priority = body.priority;
    }
  }

  if ("categoryId" in body || !partial) {
    if (!Number.isSafeInteger(body.categoryId) || body.categoryId <= 0) {
      details.categoryId = "categoryId должен быть положительным целым числом.";
    } else if (categories.find((item) => item.id === body.categoryId) === undefined) {
      details.categoryId = "Категория с таким идентификатором не найдена.";
    } else {
      value.categoryId = body.categoryId;
    }
  }

  if (partial && "completed" in body) {
    if (typeof body.completed !== "boolean") {
      details.completed = "Признак выполнения должен быть логическим значением.";
    } else {
      value.completed = body.completed;
    }
  }

  const allowed = partial ? ["title", "priority", "categoryId", "completed"] : ["title", "priority", "categoryId"];

  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) {
      details[key] = "Поле не допускается в этом запросе.";
    }
  }

  if (partial && Object.keys(value).length === 0 && Object.keys(details).length === 0) {
    details.body = "Не указано ни одно изменяемое поле.";
  }

  if (Object.keys(details).length > 0) {
    return { ok: false, details };
  }

  return { ok: true, value };
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${HOST}`);
  const method = request.method ?? "GET";

  if (method === "OPTIONS") {
    response.writeHead(204, CORS_HEADERS);
    response.end();

    return;
  }

  if (!ALLOWED_METHODS.includes(method)) {
    response.setHeader("Allow", ALLOWED_METHODS.join(", "));
    sendError(response, 405, "METHOD_NOT_ALLOWED", `Метод ${method} не поддерживается учебным API.`, {
      allowed: ALLOWED_METHODS,
    });

    return;
  }

  if (url.pathname !== BASE_PATH && !url.pathname.startsWith(`${BASE_PATH}/`)) {
    sendError(response, 404, "NOT_FOUND", `Маршрут ${url.pathname} не найден.`, {
      path: url.pathname,
    });

    return;
  }

  const segments = url.pathname
    .slice(BASE_PATH.length)
    .split("/")
    .filter((segment) => segment !== "");

  if (method === "GET" && (segments.length === 0 || segments[0] === "health")) {
    sendJson(response, 200, {
      data: {
        status: "ok",
        service: "practice-06-api",
        version: 1,
        tasks: store.length,
        categories: categories.length,
        time: new Date().toISOString(),
      },
    });

    return;
  }

  if (method === "POST" && segments[0] === "debug" && segments[1] === "reset") {
    resetStore();
    sendJson(response, 200, { data: { reset: true, total: store.length } });

    return;
  }

  if (method === "GET" && segments[0] === "debug") {
    if (handleDebug(request, response, segments, url.searchParams)) {
      return;
    }

    sendError(response, 404, "NOT_FOUND", `Отладочный маршрут ${url.pathname} не найден.`, {
      path: url.pathname,
    });

    return;
  }

  if (segments[0] === "tasks" && segments.length === 1 && method === "GET") {
    const parsed = parseTaskFilters(url.searchParams);

    if (!parsed.ok) {
      sendError(response, 400, "INVALID_QUERY", parsed.message, parsed.details);

      return;
    }

    sendCollection(response, selectTasks(parsed.filters), parsed.filters);

    return;
  }

  if (segments[0] === "tasks" && segments.length === 1 && method === "POST") {
    const parsed = parseJsonBody(await readBody(request), request.headers["content-type"]);

    if (!parsed.ok) {
      sendError(response, parsed.status, parsed.code, parsed.message);

      return;
    }

    const draft = validateDraft(parsed.value, { partial: false });

    if (!draft.ok) {
      sendError(response, 400, "VALIDATION_ERROR", "Данные задачи не прошли проверку.", draft.details);

      return;
    }

    const created = {
      id: nextId,
      title: draft.value.title,
      completed: false,
      priority: draft.value.priority,
      categoryId: draft.value.categoryId,
    };

    nextId += 1;
    store = [...store, created];
    response.setHeader("Location", `${BASE_PATH}/tasks/${created.id}`);
    sendJson(response, 201, { data: created });

    return;
  }

  if (segments[0] === "tasks" && segments.length === 2) {
    const id = parseId(segments[1]);

    if (id === null) {
      sendError(
        response,
        400,
        "INVALID_ID",
        "Идентификатор задачи должен быть положительным целым числом.",
        { id: segments[1] }
      );

      return;
    }

    const index = store.findIndex((item) => item.id === id);

    if (index === -1) {
      sendError(response, 404, "TASK_NOT_FOUND", `Задача с id ${id} не найдена.`, { id });

      return;
    }

    if (method === "GET") {
      sendJson(response, 200, { data: store[index] });

      return;
    }

    if (method === "PATCH") {
      const parsed = parseJsonBody(await readBody(request), request.headers["content-type"]);

      if (!parsed.ok) {
        sendError(response, parsed.status, parsed.code, parsed.message);

        return;
      }

      const draft = validateDraft(parsed.value, { partial: true });

      if (!draft.ok) {
        sendError(response, 400, "VALIDATION_ERROR", "Данные задачи не прошли проверку.", draft.details);

        return;
      }

      const updated = { ...store[index], ...draft.value };

      store = store.map((item, position) => (position === index ? updated : item));
      sendJson(response, 200, { data: updated });

      return;
    }

    if (method === "DELETE") {
      store = store.filter((item) => item.id !== id);
      response.writeHead(204, CORS_HEADERS);
      response.end();

      return;
    }
  }

  if (method === "GET" && segments[0] === "categories" && segments.length === 1) {
    if ([...url.searchParams.keys()].length > 0) {
      sendError(response, 400, "INVALID_QUERY", "Маршрут категорий не принимает параметры.", {
        parameters: [...url.searchParams.keys()],
      });

      return;
    }

    sendCollection(response, categories, {});

    return;
  }

  if (method === "GET" && segments[0] === "categories" && segments.length === 2) {
    const id = parseId(segments[1]);

    if (id === null) {
      sendError(
        response,
        400,
        "INVALID_ID",
        "Идентификатор категории должен быть положительным целым числом.",
        { id: segments[1] }
      );

      return;
    }

    const category = categories.find((item) => item.id === id);

    if (category === undefined) {
      sendError(response, 404, "CATEGORY_NOT_FOUND", `Категория с id ${id} не найдена.`, { id });

      return;
    }

    sendJson(response, 200, { data: category });

    return;
  }

  sendError(response, 404, "NOT_FOUND", `Маршрут ${url.pathname} не найден.`, {
    path: url.pathname,
  });
}

export function createApiServer() {
  return createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      sendError(response, 500, "INTERNAL_ERROR", "Внутренняя ошибка учебного API.", {
        reason: error.message,
      });
    });
  });
}

/** Запускает сервер и возвращает фактический адрес. Порт 0 означает любой свободный. */
export function startApiServer(port = DEFAULT_PORT) {
  const server = createApiServer();

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, HOST, () => {
      const address = server.address();

      resolve({ server, port: address.port, baseUrl: `http://${HOST}:${address.port}${BASE_PATH}` });
    });
  });
}

// Прямой запуск: node api/server.mjs [port]
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const requested = Number(process.argv[2] ?? DEFAULT_PORT);
  const port = Number.isSafeInteger(requested) && requested >= 0 ? requested : DEFAULT_PORT;

  startApiServer(port)
    .then(({ baseUrl }) => {
      console.log(baseUrl);
      console.log("Остановить сервер: Ctrl+C");
    })
    .catch((error) => {
      console.error(`Не удалось запустить API: ${error.message}`);
      process.exitCode = 1;
    });
}
