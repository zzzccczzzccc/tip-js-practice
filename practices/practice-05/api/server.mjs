// Учебное HTTP API практической работы № 5.
// Это готовая инфраструктура: код можно изучать, но изменять его в обязательной части не нужно.
// Реализация собственного сервера относится к ПР9–ПР10.

import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

import { DELAY_MAX_MS, PRIORITIES, Q_MAX_LENGTH, categories, tasks } from "./data.js";

const DEFAULT_PORT = 5505;
const HOST = "127.0.0.1";
const BASE_PATH = "/api";

const TASK_FILTERS = ["completed", "priority", "categoryId", "q"];

const CORS_HEADERS = {
  // Заголовки отправляются для будущего браузерного клиента ПР6.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
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

  return tasks.filter((task) => {
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

function handleRequest(request, response) {
  const url = new URL(request.url, `http://${HOST}`);

  if (request.method === "OPTIONS") {
    response.writeHead(204, CORS_HEADERS);
    response.end();

    return;
  }

  if (request.method !== "GET") {
    response.setHeader("Allow", "GET, OPTIONS");
    sendError(
      response,
      405,
      "METHOD_NOT_ALLOWED",
      `Метод ${request.method} не поддерживается учебным API.`,
      { allowed: ["GET", "OPTIONS"] }
    );

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

  if (segments.length === 0 || segments[0] === "health") {
    sendJson(response, 200, {
      data: {
        status: "ok",
        service: "practice-05-api",
        version: 1,
        tasks: tasks.length,
        categories: categories.length,
        time: new Date().toISOString(),
      },
    });

    return;
  }

  if (segments[0] === "debug") {
    if (handleDebug(request, response, segments, url.searchParams)) {
      return;
    }

    sendError(response, 404, "NOT_FOUND", `Отладочный маршрут ${url.pathname} не найден.`, {
      path: url.pathname,
    });

    return;
  }

  if (segments[0] === "tasks" && segments.length === 1) {
    const parsed = parseTaskFilters(url.searchParams);

    if (!parsed.ok) {
      sendError(response, 400, "INVALID_QUERY", parsed.message, parsed.details);

      return;
    }

    sendCollection(response, selectTasks(parsed.filters), parsed.filters);

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

    const task = tasks.find((item) => item.id === id);

    if (task === undefined) {
      sendError(response, 404, "TASK_NOT_FOUND", `Задача с id ${id} не найдена.`, { id });

      return;
    }

    sendJson(response, 200, { data: task });

    return;
  }

  if (segments[0] === "categories" && segments.length === 1) {
    if ([...url.searchParams.keys()].length > 0) {
      sendError(response, 400, "INVALID_QUERY", "Маршрут категорий не принимает параметры.", {
        parameters: [...url.searchParams.keys()],
      });

      return;
    }

    sendCollection(response, categories, {});

    return;
  }

  if (segments[0] === "categories" && segments.length === 2) {
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
    try {
      handleRequest(request, response);
    } catch (error) {
      sendError(response, 500, "INTERNAL_ERROR", "Внутренняя ошибка учебного API.", {
        reason: error.message,
      });
    }
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
