// Модульные проверки клиента, валидации и контроллера без браузера.
import assert from "node:assert/strict";

import { ApiError, createApiClient } from "../src/api-client.js";
import { createTaskApi } from "../src/task-api.js";
import { validateTaskDraft } from "../src/form-validation.js";
import { createAppController, messageForError } from "../src/app-controller.js";

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

function jsonResponse(payload, { status = 200, contentType = "application/json" } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (name) => (name.toLowerCase() === "content-type" ? contentType : null),
    },
    json: async () => (typeof payload === "string" ? JSON.parse(payload) : payload),
  };
}

function empty204() {
  return {
    status: 204,
    ok: true,
    headers: { get: () => null },
    json: async () => {
      throw new SyntaxError("empty");
    },
  };
}

function recordingFetch(handler) {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url, init });

    return handler(url, init, calls.length);
  };

  fetchFn.calls = calls;

  return fetchFn;
}

const task = (over = {}) => ({
  id: 4,
  title: "Подготовить модель задач",
  completed: false,
  priority: "high",
  categoryId: 2,
  ...over,
});

const collection = (data) => ({ data, meta: { total: data.length, filters: {} } });
const categories = [
  { id: 1, name: "Учёба" },
  { id: 2, name: "Проект" },
  { id: 3, name: "Организация" },
];

async function catchApi(promise) {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof ApiError, error.message);

    return error;
  }

  throw new Error("ожидался отказ");
}

await check("GET с телом отклоняется до сети", async () => {
  const fetchFn = recordingFetch(() => jsonResponse({}));
  const client = createApiClient({ baseUrl: BASE, fetchFn });

  await assert.rejects(() => client.requestJson("/tasks", { body: {} }), TypeError);
  assert.equal(fetchFn.calls.length, 0);
});

await check("Недопустимый метод отклоняется", async () => {
  const client = createApiClient({ baseUrl: BASE, fetchFn: async () => jsonResponse({}) });

  await assert.rejects(() => client.requestJson("/tasks", { method: "PUT" }), TypeError);
});

await check("POST сериализует JSON и ставит Content-Type", async () => {
  const fetchFn = recordingFetch(() => jsonResponse({ data: task({ id: 35 }) }, { status: 201 }));
  const client = createApiClient({ baseUrl: BASE, fetchFn });

  await client.requestJson("/tasks", {
    method: "POST",
    body: { title: "Изучить fetch", priority: "high", categoryId: 2 },
  });

  const { init } = fetchFn.calls[0];

  assert.equal(init.method, "POST");
  assert.equal(init.headers["Content-Type"], "application/json");
  assert.equal(init.headers.Accept, "application/json");
  assert.deepEqual(JSON.parse(init.body), {
    title: "Изучить fetch",
    priority: "high",
    categoryId: 2,
  });
});

await check("PATCH и DELETE используют указанные методы", async () => {
  const fetchFn = recordingFetch((url, init) =>
    init.method === "DELETE" ? empty204() : jsonResponse({ data: task({ completed: true }) })
  );
  const client = createApiClient({ baseUrl: BASE, fetchFn });

  await client.requestJson("/tasks/4", { method: "PATCH", body: { completed: true } });
  await client.requestJson("/tasks/4", { method: "DELETE" });

  assert.equal(fetchFn.calls[0].init.method, "PATCH");
  assert.equal(fetchFn.calls[1].init.method, "DELETE");
  assert.equal(fetchFn.calls[1].init.body, undefined);
});

await check("DELETE: успешный 204 возвращает null", async () => {
  const client = createApiClient({ baseUrl: BASE, fetchFn: async () => empty204() });

  assert.equal(await client.requestJson("/tasks/4", { method: "DELETE" }), null);
});

await check("HTTP-ошибка мутации сохраняет kind http", async () => {
  const client = createApiClient({
    baseUrl: BASE,
    fetchFn: async () =>
      jsonResponse(
        { error: { code: "VALIDATION_ERROR", message: "Данные задачи не прошли проверку." } },
        { status: 400 }
      ),
  });
  const error = await catchApi(client.requestJson("/tasks", { method: "POST", body: {} }));

  assert.equal(error.kind, "http");
  assert.equal(error.status, 400);
  assert.equal(error.code, "VALIDATION_ERROR");
});

await check("createTask возвращает созданную задачу", async () => {
  const created = task({ id: 35, title: "Изучить fetch" });
  const api = createTaskApi(
    createApiClient({
      baseUrl: BASE,
      fetchFn: async () => jsonResponse({ data: created }, { status: 201 }),
    })
  );

  assert.deepEqual(await api.createTask({ title: "Изучить fetch", priority: "high", categoryId: 2 }), created);
});

await check("updateTask и setTaskCompleted идут PATCH", async () => {
  const fetchFn = recordingFetch(() => jsonResponse({ data: task({ completed: true }) }));
  const api = createTaskApi(createApiClient({ baseUrl: BASE, fetchFn }));

  await api.updateTask(4, { title: "Новое название" });
  await api.setTaskCompleted(4, true);

  assert.equal(fetchFn.calls[0].init.method, "PATCH");
  assert.match(fetchFn.calls[0].url, /\/tasks\/4$/);
  assert.deepEqual(JSON.parse(fetchFn.calls[1].init.body), { completed: true });
});

await check("deleteTask ожидает строго null", async () => {
  const ok = createTaskApi(createApiClient({ baseUrl: BASE, fetchFn: async () => empty204() }));

  assert.equal(await ok.deleteTask(4), null);

  const unexpected = createTaskApi(
    createApiClient({ baseUrl: BASE, fetchFn: async () => jsonResponse({ data: task() }) })
  );
  const error = await catchApi(unexpected.deleteTask(4));

  assert.equal(error.kind, "invalid-response");
});

await check("resetDemoData вызывает POST /debug/reset", async () => {
  const fetchFn = recordingFetch(() => jsonResponse({ data: { reset: true, total: 12 } }));
  const api = createTaskApi(createApiClient({ baseUrl: BASE, fetchFn }));

  assert.deepEqual(await api.resetDemoData(), { reset: true, total: 12 });
  assert.equal(fetchFn.calls[0].init.method, "POST");
  assert.match(fetchFn.calls[0].url, /\/debug\/reset$/);
});

await check("Методы предметного API проверяют id до запроса", async () => {
  const fetchFn = recordingFetch(() => empty204());
  const api = createTaskApi(createApiClient({ baseUrl: BASE, fetchFn }));

  await assert.rejects(() => api.deleteTask(0), TypeError);
  await assert.rejects(() => api.updateTask("4", {}), TypeError);
  await assert.rejects(() => api.setTaskCompleted(4, "true"), TypeError);
  assert.equal(fetchFn.calls.length, 0);
});

await check("validateTaskDraft нормализует название и categoryId", () => {
  const result = validateTaskDraft(
    { title: "  Изучить fetch  ", priority: "high", categoryId: "2" },
    categories
  );

  assert.equal(result.valid, true);
  assert.deepEqual(result.value, { title: "Изучить fetch", priority: "high", categoryId: 2 });
});

await check("validateTaskDraft отклоняет пробелы, чужой приоритет и неизвестную категорию", () => {
  const spaces = validateTaskDraft({ title: "   ", priority: "high", categoryId: 2 }, categories);
  const priority = validateTaskDraft({ title: "Задача", priority: "urgent", categoryId: 2 }, categories);
  const category = validateTaskDraft({ title: "Задача", priority: "low", categoryId: 9 }, categories);

  assert.equal(spaces.valid, false);
  assert.ok(spaces.errors.title);
  assert.ok(priority.errors.priority);
  assert.ok(category.errors.categoryId);
});

await check("validateTaskDraft не изменяет входные объекты", () => {
  const draft = { title: "  A  ", priority: "low", categoryId: 1 };
  const cats = categories.map((item) => ({ ...item }));

  Object.freeze(draft);
  cats.forEach((item) => Object.freeze(item));
  Object.freeze(cats);

  const result = validateTaskDraft(draft, cats);

  assert.equal(result.valid, true);
  assert.equal(draft.title, "  A  ");
});

function createView() {
  const calls = [];
  const view = {
    calls,
    setTasks: (...args) => calls.push(["setTasks", args]),
    setListState: (...args) => calls.push(["setListState", args]),
    setFilters: (...args) => calls.push(["setFilters", args]),
    setCategories: (...args) => calls.push(["setCategories", args]),
    setMutationPending: (value) => calls.push(["setMutationPending", value]),
    notify: (...args) => calls.push(["notify", args]),
    showFormErrors: (errors) => calls.push(["showFormErrors", errors]),
    setFormMode: (task) => calls.push(["setFormMode", task]),
    setRequestDuration: (ms) => calls.push(["setRequestDuration", ms]),
  };

  return view;
}

function fakeApi(overrides = {}) {
  return {
    loadInitialData: async () => ({
      tasks: [task()],
      categories,
      meta: { total: 1, filters: {} },
    }),
    getTasks: async () => ({ tasks: [task()], meta: { total: 1, filters: {} } }),
    createTask: async (draft) => task({ id: 35, ...draft }),
    updateTask: async (id, changes) => task({ id, ...changes }),
    setTaskCompleted: async (id, completed) => task({ id, completed }),
    deleteTask: async () => null,
    resetDemoData: async () => ({ reset: true, total: 12 }),
    ...overrides,
  };
}

await check("Контроллер: start загружает задачи и категории параллельным контрактом", async () => {
  const view = createView();
  const controller = createAppController({ api: fakeApi(), view });

  await controller.start({});

  assert.ok(view.calls.some((call) => call[0] === "setCategories"));
  assert.ok(view.calls.some((call) => call[0] === "setTasks"));
  assert.ok(view.calls.some((call) => call[0] === "setListState" && call[1][0] === "ready"));
});

await check("Контроллер: пустой список даёт состояние empty, а не error", async () => {
  const view = createView();
  const controller = createAppController({
    api: fakeApi({
      loadInitialData: async () => ({ tasks: [], categories, meta: { total: 0, filters: {} } }),
    }),
    view,
  });

  await controller.start({ completed: true, priority: "low" });

  const states = view.calls.filter((call) => call[0] === "setListState").map((call) => call[1][0]);

  assert.ok(states.includes("empty"));
  assert.equal(states.includes("error"), false);
});

await check("Контроллер: ошибка загрузки даёт error и понятное сообщение", async () => {
  const view = createView();
  const controller = createAppController({
    api: fakeApi({
      loadInitialData: async () => {
        throw new ApiError("network", "fetch failed", { url: BASE });
      },
    }),
    view,
  });

  await controller.start({});

  const errorCall = view.calls.find((call) => call[0] === "setListState" && call[1][0] === "error");

  assert.ok(errorCall);
  assert.ok(errorCall[1][1].includes("API"));
});

await check("Контроллер: невалидная форма не вызывает API", async () => {
  let created = 0;
  const view = createView();
  const controller = createAppController({
    api: fakeApi({
      createTask: async () => {
        created += 1;

        return task({ id: 35 });
      },
    }),
    view,
  });

  await controller.start({});
  await controller.submit({ title: "  ", priority: "high", categoryId: 2 });

  assert.equal(created, 0);
  assert.ok(view.calls.some((call) => call[0] === "showFormErrors"));
});

await check("Контроллер: успешное создание вызывает мутацию и повторный GET", async () => {
  const order = [];
  const view = createView();
  const controller = createAppController({
    api: fakeApi({
      createTask: async () => {
        order.push("create");

        return task({ id: 35 });
      },
      getTasks: async () => {
        order.push("get");

        return { tasks: [task(), task({ id: 35 })], meta: { total: 2, filters: {} } };
      },
    }),
    view,
  });

  await controller.start({});
  await controller.submit({ title: "Изучить fetch", priority: "high", categoryId: 2 });

  assert.deepEqual(order, ["create", "get"]);
  assert.ok(view.calls.some((call) => call[0] === "setMutationPending" && call[1] === true));
  assert.ok(view.calls.some((call) => call[0] === "setMutationPending" && call[1] === false));
});

await check("Контроллер: toggle и delete идут через API, затем GET", async () => {
  const order = [];
  const view = createView();
  const controller = createAppController({
    api: fakeApi({
      setTaskCompleted: async () => {
        order.push("toggle");

        return task({ completed: true });
      },
      deleteTask: async () => {
        order.push("delete");

        return null;
      },
      getTasks: async () => {
        order.push("get");

        return { tasks: [task()], meta: { total: 1, filters: {} } };
      },
    }),
    view,
  });

  await controller.start({});
  await controller.toggleTask(4);
  await controller.deleteTask(4);

  assert.deepEqual(order, ["toggle", "get", "delete", "get"]);
});

await check("Контроллер: ошибка мутации разблокирует кнопки в finally", async () => {
  const view = createView();
  const controller = createAppController({
    api: fakeApi({
      deleteTask: async () => {
        throw new ApiError("http", "не найдена", { status: 404, code: "TASK_NOT_FOUND" });
      },
    }),
    view,
  });

  await controller.start({});
  await controller.deleteTask(4);

  const pending = view.calls.filter((call) => call[0] === "setMutationPending").map((call) => call[1]);

  assert.deepEqual(pending.slice(-2), [true, false]);
  assert.ok(view.calls.some((call) => call[0] === "notify" && call[1][1] === "error"));
});

await check("Контроллер: устаревший ответ игнорируется по номеру загрузки", async () => {
  let releaseSlow;
  const view = createView();
  const controller = createAppController({
    api: fakeApi({
      loadInitialData: async () => ({ tasks: [task()], categories, meta: { total: 1, filters: {} } }),
      getTasks: async (filters, options) => {
        if (filters.priority === "low") {
          await new Promise((resolve) => {
            releaseSlow = resolve;
            options?.signal?.addEventListener("abort", () => resolve());
          });

          return { tasks: [task({ id: 7, priority: "low" })], meta: { total: 1, filters } };
        }

        return { tasks: [task({ id: 4 })], meta: { total: 1, filters } };
      },
    }),
    view,
  });

  await controller.start({});
  const first = controller.applyFilters({ priority: "low" });
  const second = controller.applyFilters({ priority: "high" });

  await second;
  releaseSlow?.();
  await first;

  const lastTasks = [...view.calls].reverse().find((call) => call[0] === "setTasks");

  assert.deepEqual(
    lastTasks[1][0].map((item) => item.id),
    [4]
  );
});

await check("Контроллер: отмена не показывается как ошибка пользователя", async () => {
  const view = createView();
  const controller = createAppController({
    api: fakeApi({
      getTasks: async (_filters, options) => {
        options.signal.throwIfAborted();

        return { tasks: [task()], meta: { total: 1, filters: {} } };
      },
    }),
    view,
  });

  await controller.start({});
  const pending = controller.applyFilters({ q: "a" });

  controller.destroy();
  await pending;

  assert.equal(
    view.calls.some((call) => call[0] === "setListState" && call[1][0] === "error"),
    false
  );
});

await check("messageForError различает виды ApiError", () => {
  assert.equal(messageForError(new ApiError("aborted", "x")), "");
  assert.ok(messageForError(new ApiError("timeout", "x")).includes("время"));
  assert.ok(messageForError(new ApiError("network", "x")).includes("API"));
  assert.equal(messageForError(new ApiError("http", "Задача не найдена.")), "Задача не найдена.");
});

await check("refresh после ошибки категорий снова вызывает loadInitialData", async () => {
  let loads = 0;
  const view = createView();
  const controller = createAppController({
    api: fakeApi({
      loadInitialData: async () => {
        loads += 1;

        if (loads === 1) {
          throw new ApiError("network", "offline");
        }

        return { tasks: [task()], categories, meta: { total: 1, filters: {} } };
      },
    }),
    view,
  });

  await controller.start({});
  await controller.refresh();

  assert.equal(loads, 2);
  assert.ok(view.calls.some((call) => call[0] === "setCategories"));
});

await check("GET без тела не добавляет Content-Type", async () => {
  const fetchFn = recordingFetch(() => jsonResponse(collection([task()])));
  const client = createApiClient({ baseUrl: BASE, fetchFn });

  await client.requestJson("/tasks");

  assert.equal(fetchFn.calls[0].init.headers["Content-Type"], undefined);
  assert.equal(fetchFn.calls[0].init.method, "GET");
});

await check("getTasks передаёт signal в общий клиент", async () => {
  const controller = new AbortController();
  const fetchFn = recordingFetch(() => jsonResponse(collection([task()])));
  const api = createTaskApi(createApiClient({ baseUrl: BASE, fetchFn }));

  await api.getTasks({ completed: false }, { signal: controller.signal });

  assert.ok(fetchFn.calls[0].init.signal instanceof AbortSignal);
  assert.equal(new URL(fetchFn.calls[0].url).searchParams.get("completed"), "false");
});

await check("createTask отклоняет ответ без объекта задачи", async () => {
  const api = createTaskApi(
    createApiClient({ baseUrl: BASE, fetchFn: async () => jsonResponse({ data: [] }, { status: 201 }) })
  );
  const error = await catchApi(api.createTask({ title: "A", priority: "low", categoryId: 1 }));

  assert.equal(error.kind, "invalid-response");
});

await check("beginEdit заполняет форму, cancelEdit возвращает создание", async () => {
  const view = createView();
  const controller = createAppController({ api: fakeApi(), view });

  await controller.start({});
  controller.beginEdit(4);

  const edit = view.calls.filter((call) => call[0] === "setFormMode").at(-1);

  assert.equal(edit[1].id, 4);

  controller.cancelEdit();

  assert.equal(view.calls.filter((call) => call[0] === "setFormMode").at(-1)[1], null);
  assert.equal(controller.getState().editingId, null);
});

await check("beginEdit для отсутствующей задачи не меняет режим ошибочно без уведомления", async () => {
  const view = createView();
  const controller = createAppController({ api: fakeApi(), view });

  await controller.start({});
  controller.beginEdit(99);

  assert.ok(view.calls.some((call) => call[0] === "notify" && call[1][1] === "error"));
  assert.equal(controller.getState().editingId, null);
});

await check("submit в режиме редактирования вызывает updateTask", async () => {
  const order = [];
  const view = createView();
  const controller = createAppController({
    api: fakeApi({
      updateTask: async (id, changes) => {
        order.push(["update", id, changes.title]);

        return task({ id, ...changes });
      },
      getTasks: async () => {
        order.push("get");

        return { tasks: [task({ title: "Новое" })], meta: { total: 1, filters: {} } };
      },
    }),
    view,
  });

  await controller.start({});
  controller.beginEdit(4);
  await controller.submit({ title: "Новое", priority: "high", categoryId: 2 });

  assert.equal(order[0][0], "update");
  assert.equal(order[0][1], 4);
  assert.equal(order[1], "get");
});

await check("resetData вызывает resetDemoData и повторную загрузку", async () => {
  const order = [];
  const view = createView();
  const controller = createAppController({
    api: fakeApi({
      resetDemoData: async () => {
        order.push("reset");

        return { reset: true, total: 12 };
      },
      getTasks: async () => {
        order.push("get");

        return { tasks: [task()], meta: { total: 1, filters: {} } };
      },
    }),
    view,
  });

  await controller.start({});
  await controller.resetData();

  assert.deepEqual(order, ["reset", "get"]);
});

await check("applyFilters сохраняет фильтры для последующего GET", async () => {
  const received = [];
  const view = createView();
  const controller = createAppController({
    api: fakeApi({
      getTasks: async (filters) => {
        received.push({ ...filters });

        return { tasks: [], meta: { total: 0, filters } };
      },
    }),
    view,
  });

  await controller.start({});
  await controller.applyFilters({ categoryId: 2, completed: false });

  assert.deepEqual(received.at(-1), { categoryId: 2, completed: false });
  assert.deepEqual(controller.getState().filters, { categoryId: 2, completed: false });
});

console.log("");
console.log(`Итог модулей: успешно ${passed}, ошибок ${failed}.`);

if (failed > 0) {
  process.exitCode = 1;
}
