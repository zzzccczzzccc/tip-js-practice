// Проверки новых модулей ПР4: updateTask, чистая валидация черновика и локальное хранение.
// Запуск: node checks/modules.checks.js

import assert from "node:assert/strict";

import { updateTask } from "../src/task-service.js";
import { validateTaskDraft } from "../src/form-validation.js";
import {
  STORAGE_VERSION,
  isValidTaskList,
  loadTasks,
  removeSavedTasks,
  saveTasks,
} from "../src/task-storage.js";

let total = 0;
let failed = 0;

function check(name, run) {
  total += 1;

  try {
    run();
    console.log(`OK   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}`);
    console.log(`     ${error.message.split("\n")[0]}`);
  }
}

/** Контрольный набор создаётся заново для каждого сценария. */
function demo() {
  return [
    { id: 1, title: "Изучить функции", completed: true, priority: "medium" },
    { id: 4, title: "Подготовить модель задач", completed: false, priority: "high" },
    { id: 7, title: "Проверить методы массивов", completed: false, priority: "low" },
    { id: 10, title: "Оформить README", completed: true, priority: "medium" },
  ];
}

function ids(tasks) {
  return tasks.map((task) => task.id);
}

function assertFailure(result, hint) {
  assert.equal(result.ok, false, hint);
  assert.equal(typeof result.error, "string");
  assert.ok(result.error.length > 0, "сообщение об ошибке не должно быть пустым");
  assert.equal("tasks" in result, false, "при отказе новый список не возвращается");
}

/** Простейшая имитация Web Storage: позволяет проверить модуль без браузера. */
function createMemoryStorage(initialEntries = {}) {
  const entries = new Map(Object.entries(initialEntries));

  return {
    calls: [],
    getItem(key) {
      this.calls.push(["getItem", key]);

      return entries.has(key) ? entries.get(key) : null;
    },
    setItem(key, value) {
      this.calls.push(["setItem", key]);
      entries.set(key, String(value));
    },
    removeItem(key) {
      this.calls.push(["removeItem", key]);
      entries.delete(key);
    },
    read(key) {
      return entries.has(key) ? entries.get(key) : null;
    },
    get size() {
      return entries.size;
    },
  };
}

function createBrokenStorage(message) {
  return {
    getItem() {
      throw new Error(message);
    },
    setItem() {
      throw new Error(message);
    },
    removeItem() {
      throw new Error(message);
    },
  };
}

const KEY = "tip-js-practice-04:checks:modules";

// --- updateTask ---

check("updateTask: изменяет название и приоритет выбранной задачи", () => {
  const result = updateTask(demo(), 4, "Подготовить форму задач", "low");

  assert.equal(result.ok, true);
  assert.deepEqual(ids(result.tasks), [1, 4, 7, 10]);
  assert.deepEqual(result.tasks[1], {
    id: 4,
    title: "Подготовить форму задач",
    completed: false,
    priority: "low",
  });
});

check("updateTask: нормализует название и сохраняет id и completed", () => {
  const result = updateTask(demo(), 10, "   Оформить отчёт ПР4   ", "high");

  assert.equal(result.ok, true);
  assert.deepEqual(result.tasks[3], {
    id: 10,
    title: "Оформить отчёт ПР4",
    completed: true,
    priority: "high",
  });
});

check("updateTask: отклоняет некорректные данные без частичного результата", () => {
  assertFailure(updateTask(demo(), 4, "   ", "low"), "пробелы не являются названием");
  assertFailure(updateTask(demo(), 4, "x".repeat(101), "low"), "длина названия ограничена");
  assertFailure(updateTask(demo(), 4, "Корректное название", "urgent"), "приоритет недопустим");
  assertFailure(updateTask(demo(), 4, 42, "low"), "название должно быть строкой");
  assertFailure(updateTask(demo(), 0, "Название", "low"), "id должен быть положительным");
  assertFailure(updateTask(demo(), 4.5, "Название", "low"), "id должен быть целым");
  assertFailure(updateTask(demo(), "4", "Название", "low"), "строка не является id");
  assertFailure(updateTask(demo(), 99, "Название", "low"), "задачи 99 нет в наборе");
});

check("updateTask: не изменяет исходный массив и его объекты", () => {
  const tasks = demo();

  Object.freeze(tasks);
  tasks.forEach((task) => Object.freeze(task));

  const result = updateTask(tasks, 7, "Новое название", "high");

  assert.equal(result.ok, true);
  assert.notEqual(result.tasks, tasks);
  assert.notEqual(result.tasks[2], tasks[2]);
  assert.equal(tasks[2].title, "Проверить методы массивов");
  assert.equal(tasks[2].priority, "low");
  assert.equal(result.tasks[0], tasks[0], "незатронутые объекты переиспользуются");
});

// --- validateTaskDraft ---

check("validateTaskDraft: принимает корректный черновик создания", () => {
  const result = validateTaskDraft(
    { id: "20", title: "Изучить localStorage", priority: "high" },
    demo()
  );

  assert.deepEqual(result, {
    ok: true,
    value: { id: 20, title: "Изучить localStorage", priority: "high" },
  });
});

check("validateTaskDraft: нормализует название до проверки длины", () => {
  const ok = validateTaskDraft({ id: "20", title: "  Новая задача  ", priority: "low" }, demo());

  assert.equal(ok.ok, true);
  assert.equal(ok.value.title, "Новая задача");

  const spaces = validateTaskDraft({ id: "20", title: "     ", priority: "low" }, demo());

  assert.equal(spaces.ok, false);
  assert.deepEqual(Object.keys(spaces.errors), ["title"]);
});

check("validateTaskDraft: отклоняет пустой и нечисловой идентификатор", () => {
  for (const id of ["", "   ", "abc", "4.5", "-3", "0", "1e400"]) {
    const result = validateTaskDraft({ id, title: "Название", priority: "low" }, demo());

    assert.equal(result.ok, false, `значение ${JSON.stringify(id)} не является id`);
    assert.deepEqual(Object.keys(result.errors), ["id"]);
    assert.ok(result.errors.id.length > 0);
  }
});

check("validateTaskDraft: отклоняет занятый идентификатор", () => {
  const result = validateTaskDraft({ id: "4", title: "Другая задача", priority: "low" }, demo());

  assert.equal(result.ok, false);
  assert.deepEqual(Object.keys(result.errors), ["id"]);
  assert.equal("value" in result, false);
});

check("validateTaskDraft: в режиме редактирования использует editingId", () => {
  const own = validateTaskDraft(
    { id: "999", title: "Переименованная задача", priority: "high" },
    demo(),
    4
  );

  assert.deepEqual(own, {
    ok: true,
    value: { id: 4, title: "Переименованная задача", priority: "high" },
  });

  const missing = validateTaskDraft({ id: "4", title: "Название", priority: "high" }, demo(), 99);

  assert.equal(missing.ok, false);
  assert.deepEqual(Object.keys(missing.errors), ["id"]);

  const broken = validateTaskDraft({ id: "4", title: "Название", priority: "high" }, demo(), 0);

  assert.equal(broken.ok, false);
  assert.deepEqual(Object.keys(broken.errors), ["id"]);
});

check("validateTaskDraft: отклоняет нестроковое и слишком длинное название", () => {
  const long = validateTaskDraft({ id: "20", title: "x".repeat(101), priority: "low" }, demo());

  assert.equal(long.ok, false);
  assert.deepEqual(Object.keys(long.errors), ["title"]);

  const notString = validateTaskDraft({ id: "20", title: null, priority: "low" }, demo());

  assert.equal(notString.ok, false);
  assert.deepEqual(Object.keys(notString.errors), ["title"]);

  const border = validateTaskDraft({ id: "20", title: "x".repeat(100), priority: "low" }, demo());

  assert.equal(border.ok, true);
});

check("validateTaskDraft: отклоняет недопустимый приоритет", () => {
  for (const priority of ["", "urgent", "LOW", null, undefined, 1]) {
    const result = validateTaskDraft({ id: "20", title: "Название", priority }, demo());

    assert.equal(result.ok, false, `приоритет ${JSON.stringify(priority)} недопустим`);
    assert.deepEqual(Object.keys(result.errors), ["priority"]);
  }
});

check("validateTaskDraft: возвращает все независимые ошибки сразу", () => {
  const result = validateTaskDraft({ id: "", title: "  ", priority: "urgent" }, demo());

  assert.equal(result.ok, false);
  assert.deepEqual(Object.keys(result.errors).sort(), ["id", "priority", "title"]);

  for (const text of Object.values(result.errors)) {
    assert.equal(typeof text, "string");
    assert.ok(text.length > 0);
  }
});

check("validateTaskDraft: не изменяет черновик и список задач", () => {
  const tasks = demo();
  const draft = { id: "20", title: "  Изучить формы  ", priority: "high" };

  Object.freeze(tasks);
  tasks.forEach((task) => Object.freeze(task));
  Object.freeze(draft);

  const result = validateTaskDraft(draft, tasks);

  assert.equal(result.ok, true);
  assert.equal(draft.title, "  Изучить формы  ");
  assert.deepEqual(ids(tasks), [1, 4, 7, 10]);
});

// --- isValidTaskList ---

check("isValidTaskList: принимает корректный список и пустой массив", () => {
  assert.equal(isValidTaskList(demo()), true);
  assert.equal(isValidTaskList([]), true);
});

check("isValidTaskList: отклоняет значения, не являющиеся списком задач", () => {
  for (const value of [null, undefined, 0, "[]", {}, { tasks: [] }, [null], [[]], [1]]) {
    assert.equal(isValidTaskList(value), false, `значение ${JSON.stringify(value)} недопустимо`);
  }
});

check("isValidTaskList: отклоняет неполные записи и повторяющиеся id", () => {
  assert.equal(isValidTaskList([{ id: 1, title: "Задача", completed: true }]), false);
  assert.equal(
    isValidTaskList([{ id: 1, title: "Задача", completed: "true", priority: "low" }]),
    false
  );
  assert.equal(isValidTaskList([{ id: 1, title: " Задача", completed: true, priority: "low" }]), false);
  assert.equal(isValidTaskList([{ id: 0, title: "Задача", completed: true, priority: "low" }]), false);
  assert.equal(isValidTaskList([{ id: 1, title: "Задача", completed: true, priority: "urgent" }]), false);
  assert.equal(
    isValidTaskList([
      { id: 5, title: "Первая", completed: false, priority: "low" },
      { id: 5, title: "Вторая", completed: true, priority: "high" },
    ]),
    false
  );
});

// --- loadTasks ---

check("loadTasks: при отсутствии ключа возвращает источник initial", () => {
  const storage = createMemoryStorage();
  const result = loadTasks(storage, KEY, demo());

  assert.equal(result.ok, true);
  assert.equal(result.source, "initial");
  assert.deepEqual(ids(result.tasks), [1, 4, 7, 10]);
  assert.deepEqual(storage.calls, [["getItem", KEY]], "чтение выполняется один раз");
});

check("loadTasks: при корректной записи возвращает источник storage", () => {
  const saved = [{ id: 20, title: "Изучить localStorage", completed: false, priority: "high" }];
  const storage = createMemoryStorage({
    [KEY]: JSON.stringify({ version: STORAGE_VERSION, tasks: saved }),
  });

  const result = loadTasks(storage, KEY, demo());

  assert.equal(result.ok, true);
  assert.equal(result.source, "storage");
  assert.deepEqual(result.tasks, saved);
});

check("loadTasks: повреждённые данные приводят к источнику fallback", () => {
  const cases = [
    "{broken-json",
    "42",
    "null",
    JSON.stringify({ version: 2, tasks: [] }),
    JSON.stringify({ tasks: [] }),
    JSON.stringify({ version: STORAGE_VERSION, tasks: {} }),
    JSON.stringify({
      version: STORAGE_VERSION,
      tasks: [{ id: 1, title: "Задача", completed: true }],
    }),
    JSON.stringify({
      version: STORAGE_VERSION,
      tasks: [
        { id: 5, title: "Первая", completed: false, priority: "low" },
        { id: 5, title: "Вторая", completed: true, priority: "low" },
      ],
    }),
  ];

  for (const raw of cases) {
    const storage = createMemoryStorage({ [KEY]: raw });
    const result = loadTasks(storage, KEY, demo());

    assert.equal(result.ok, false, `данные ${raw} должны быть отклонены`);
    assert.equal(result.source, "fallback");
    assert.ok(result.error.length > 0);
    assert.deepEqual(ids(result.tasks), [1, 4, 7, 10]);
    assert.equal(storage.read(KEY), raw, "повреждённая запись не удаляется автоматически");
  }
});

check("loadTasks: исключение хранилища не выбрасывается наружу", () => {
  const result = loadTasks(createBrokenStorage("Доступ запрещён"), KEY, demo());

  assert.equal(result.ok, false);
  assert.equal(result.source, "fallback");
  assert.ok(result.error.includes("Доступ запрещён"));
  assert.deepEqual(ids(result.tasks), [1, 4, 7, 10]);
});

check("loadTasks: возвращает независимые копии задач", () => {
  const fallback = demo();
  const storage = createMemoryStorage();
  const fromInitial = loadTasks(storage, KEY, fallback);

  fromInitial.tasks[0].title = "Изменено после загрузки";
  fromInitial.tasks.push({ id: 99, title: "Лишняя", completed: false, priority: "low" });

  assert.equal(fallback[0].title, "Изучить функции");
  assert.deepEqual(ids(fallback), [1, 4, 7, 10]);

  const stored = createMemoryStorage({
    [KEY]: JSON.stringify({ version: STORAGE_VERSION, tasks: demo() }),
  });
  const first = loadTasks(stored, KEY, demo());

  first.tasks[0].completed = false;

  const second = loadTasks(stored, KEY, demo());

  assert.equal(second.tasks[0].completed, true, "изменение копии не влияет на запись");
});

// --- saveTasks ---

check("saveTasks: записывает оболочку версии 1", () => {
  const storage = createMemoryStorage();
  const tasks = demo();
  const result = saveTasks(storage, KEY, tasks);

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(JSON.parse(storage.read(KEY)), { version: 1, tasks });
  assert.deepEqual(storage.calls, [["setItem", KEY]]);
});

check("saveTasks: не записывает некорректный список", () => {
  const storage = createMemoryStorage();

  for (const value of [null, "tasks", [{ id: 1 }], [{ id: 1, title: "A", completed: 1, priority: "low" }]]) {
    const result = saveTasks(storage, KEY, value);

    assert.equal(result.ok, false, `значение ${JSON.stringify(value)} не должно записываться`);
    assert.ok(result.error.length > 0);
  }

  assert.equal(storage.size, 0, "ни одна попытка не создала запись");
  assert.deepEqual(storage.calls, []);
});

check("saveTasks: исключение setItem возвращается как ошибка", () => {
  const result = saveTasks(createBrokenStorage("Превышена квота"), KEY, demo());

  assert.equal(result.ok, false);
  assert.ok(result.error.includes("Превышена квота"));
});

// --- removeSavedTasks ---

check("removeSavedTasks: удаляет ровно один ключ", () => {
  const storage = createMemoryStorage({
    [KEY]: JSON.stringify({ version: STORAGE_VERSION, tasks: [] }),
    "tip-js-practice-04:demo": "рабочие данные",
    "другая-страница": "данные другой работы",
  });

  const result = removeSavedTasks(storage, KEY);

  assert.deepEqual(result, { ok: true });
  assert.equal(storage.read(KEY), null);
  assert.equal(storage.read("tip-js-practice-04:demo"), "рабочие данные");
  assert.equal(storage.read("другая-страница"), "данные другой работы");
  assert.deepEqual(storage.calls, [["removeItem", KEY]]);
});

check("removeSavedTasks: исключение removeItem возвращается как ошибка", () => {
  const result = removeSavedTasks(createBrokenStorage("Хранилище только для чтения"), KEY);

  assert.equal(result.ok, false);
  assert.ok(result.error.includes("Хранилище только для чтения"));
});

// --- Совместная работа модулей ---

check("Круг «изменить — сохранить — прочитать» сохраняет результат операции", () => {
  const storage = createMemoryStorage();
  const updated = updateTask(demo(), 4, "  Подготовить форму задач  ", "low");

  assert.equal(updated.ok, true);
  assert.deepEqual(saveTasks(storage, KEY, updated.tasks), { ok: true });

  const loaded = loadTasks(storage, KEY, demo());

  assert.equal(loaded.source, "storage");
  assert.deepEqual(loaded.tasks, updated.tasks);
  assert.deepEqual(loaded.tasks[1], {
    id: 4,
    title: "Подготовить форму задач",
    completed: false,
    priority: "low",
  });
});

console.log("");
console.log(`Проверок пройдено: ${total - failed}; не пройдено: ${failed}.`);

if (failed > 0) {
  process.exitCode = 1;
}
