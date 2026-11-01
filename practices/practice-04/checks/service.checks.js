// Готовый проверочный сценарий функций ПР2, перенесённый в практическую работу № 3.
// Файл сравнивает фактические результаты функций с ожиданиями и не содержит их реализации.
// Удалять проверки или заменять вызовы функций заранее записанными результатами нельзя.
// Дополнять файл собственными случаями разрешается.

import assert from "node:assert/strict";

import {
  createTask,
  findTaskById,
  getPendingTasks,
  getTaskTitles,
  getTaskStats,
  addTask,
  setTaskCompleted,
  renameTask,
  removeTask,
} from "../src/task-service.js";

let passedCount = 0;
const failedNames = [];

function check(name, body) {
  try {
    body();
    passedCount += 1;
    console.log(`OK   ${name}`);
  } catch (error) {
    failedNames.push(name);
    console.log(`FAIL ${name}`);
    console.log(`     ${String(error && error.message).split("\n")[0]}`);
  }
}

/** Свежая копия общего набора для каждой проверки. */
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

function snapshot(tasks) {
  return JSON.stringify(tasks);
}

function assertFailure(result) {
  assert.equal(result.ok, false, "ожидался отказ операции");
  assert.equal(typeof result.error, "string", "ожидалось текстовое описание причины");
  assert.ok(result.error.length > 0, "сообщение об ошибке не должно быть пустым");
  assert.equal("tasks" in result, false, "при отказе массив задач не возвращается");
}

console.log("Проверки функций ПР2 внутри ПР3\n");

// --- createTask ---------------------------------------------------------------

check("createTask: успешное создание задачи", () => {
  const result = createTask(20, "Новая задача", "high");

  assert.equal(result.ok, true);
  assert.deepEqual(result.task, {
    id: 20,
    title: "Новая задача",
    completed: false,
    priority: "high",
  });
});

check("createTask: приоритет по умолчанию", () => {
  assert.equal(createTask(20, "Без приоритета").task.priority, "medium");
  assert.equal(createTask(20, "Без приоритета", undefined).task.priority, "medium");
});

check("createTask: нормализация названия", () => {
  const result = createTask(20, "  Проверить  данные  ");

  assert.equal(result.ok, true);
  assert.equal(result.task.title, "Проверить  данные");
});

check("createTask: граничная длина названия 1 и 100", () => {
  assert.equal(createTask(20, "А").ok, true);
  assert.equal(createTask(20, "Б".repeat(100)).ok, true);
  assert.equal(createTask(20, "Б".repeat(100)).task.title.length, 100);
});

check("createTask: пустое название, пробелы и длина 101", () => {
  for (const title of ["", "   ", "В".repeat(101), `  ${"Г".repeat(101)}  `]) {
    assert.equal(createTask(20, title).ok, false, `название ${JSON.stringify(title)}`);
  }
});

check("createTask: название не является строкой", () => {
  for (const title of [42, null, undefined, true, {}, []]) {
    const result = createTask(20, title);

    assert.equal(result.ok, false, `название ${String(title)}`);
    assert.equal(typeof result.error, "string");
  }
});

check("createTask: недопустимый идентификатор", () => {
  for (const id of [0, -1, 1.5, "4", NaN, Infinity, -Infinity, null, undefined, true]) {
    assert.equal(createTask(id, "Название").ok, false, `id ${String(id)}`);
  }
});

check("createTask: границы безопасного целого числа", () => {
  assert.equal(createTask(Number.MAX_SAFE_INTEGER, "Название").ok, true);
  assert.equal(createTask(Number.MAX_SAFE_INTEGER + 1, "Название").ok, false);
});

check("createTask: недопустимый приоритет", () => {
  for (const priority of ["urgent", "HIGH", " high ", "", null, 1, true, {}]) {
    assert.equal(createTask(20, "Название", priority).ok, false, `приоритет ${String(priority)}`);
  }
});

check("createTask: одинаковые аргументы дают разные объекты", () => {
  const first = createTask(20, "Название", "low");
  const second = createTask(20, "Название", "low");

  assert.deepEqual(first.task, second.task);
  assert.notEqual(first.task, second.task);
});

// --- Чтение списка ------------------------------------------------------------

check("findTaskById: поиск существующей задачи", () => {
  const tasks = demo();
  const found = findTaskById(tasks, 4);

  assert.equal(found, tasks[1], "возвращается найденный объект, а не его копия");
  assert.equal(found.title, "Подготовить модель задач");
});

check("findTaskById: отсутствие совпадения", () => {
  const tasks = demo();

  assert.equal(findTaskById(tasks, 777), undefined);
  assert.equal(findTaskById(tasks, "4"), undefined);
  assert.equal(findTaskById([], 4), undefined);
});

check("getPendingTasks: невыполненные задачи общего набора", () => {
  const tasks = demo();
  const pending = getPendingTasks(tasks);

  assert.deepEqual(ids(pending), [4, 7]);
  assert.notEqual(pending, tasks);
});

check("getPendingTasks: пустой результат", () => {
  assert.deepEqual(getPendingTasks([]), []);

  const allDone = demo().map((task) => ({ ...task, completed: true }));

  assert.deepEqual(getPendingTasks(allDone), []);
  assert.notEqual(getPendingTasks(allDone), allDone);
});

check("getPendingTasks: все записи невыполнены", () => {
  const nothingDone = demo().map((task) => ({ ...task, completed: false }));
  const pending = getPendingTasks(nothingDone);

  assert.deepEqual(ids(pending), [1, 4, 7, 10]);
  assert.notEqual(pending, nothingDone);
});

check("getTaskTitles: названия общего набора", () => {
  assert.deepEqual(getTaskTitles(demo()), [
    "Изучить функции",
    "Подготовить модель задач",
    "Проверить методы массивов",
    "Оформить README",
  ]);
});

check("getTaskTitles: пустой список", () => {
  assert.deepEqual(getTaskTitles([]), []);
});

check("getTaskStats: сводка общего набора", () => {
  assert.deepEqual(getTaskStats(demo()), {
    total: 4,
    completed: 2,
    pending: 2,
    progress: 50,
  });
});

check("getTaskStats: пустой список", () => {
  assert.deepEqual(getTaskStats([]), {
    total: 0,
    completed: 0,
    pending: 0,
    progress: 0,
  });
});

check("getTaskStats: прогресс 0 и 100", () => {
  const nothingDone = demo().map((task) => ({ ...task, completed: false }));
  const allDone = demo().map((task) => ({ ...task, completed: true }));

  assert.equal(getTaskStats(nothingDone).progress, 0);
  assert.equal(getTaskStats(allDone).progress, 100);
});

check("getTaskStats: прогресс возвращается без округления", () => {
  const threeTasks = [
    { id: 1, title: "Первая", completed: true, priority: "low" },
    { id: 2, title: "Вторая", completed: false, priority: "low" },
    { id: 3, title: "Третья", completed: false, priority: "low" },
  ];
  const stats = getTaskStats(threeTasks);

  assert.equal(typeof stats.progress, "number");
  assert.equal(stats.progress, (1 / 3) * 100);
  assert.equal(stats.progress.toFixed(1), "33.3");
});

check("Чтение не изменяет исходный массив и записи", () => {
  const tasks = demo();
  const before = snapshot(tasks);

  findTaskById(tasks, 4);
  getPendingTasks(tasks);
  getTaskTitles(tasks);
  getTaskStats(tasks);

  assert.equal(snapshot(tasks), before);
  assert.equal(tasks.length, 4);
});

// --- Изменение данных ---------------------------------------------------------

check("addTask: добавление в конец нового массива", () => {
  const tasks = demo();
  const before = snapshot(tasks);
  const result = addTask(tasks, 20, "Добавить проверку", "high");

  assert.equal(result.ok, true);
  assert.deepEqual(ids(result.tasks), [1, 4, 7, 10, 20]);
  assert.deepEqual(result.tasks[4], {
    id: 20,
    title: "Добавить проверку",
    completed: false,
    priority: "high",
  });
  assert.notEqual(result.tasks, tasks);
  assert.equal(snapshot(tasks), before);
  assert.equal(tasks.length, 4);
});

check("addTask: добавление в пустой список", () => {
  const tasks = [];
  const result = addTask(tasks, 20, "Первая задача");

  assert.equal(result.ok, true);
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].priority, "medium");
  assert.equal(tasks.length, 0);
});

check("addTask: отказ при повторяющемся идентификаторе", () => {
  const tasks = demo();
  const before = snapshot(tasks);

  assertFailure(addTask(tasks, 4, "Повтор идентификатора"));
  assert.equal(snapshot(tasks), before);
});

check("addTask: отказ при некорректных полях задачи", () => {
  const tasks = demo();
  const before = snapshot(tasks);

  assertFailure(addTask(tasks, 20, ""));
  assertFailure(addTask(tasks, 20, 42));
  assertFailure(addTask(tasks, 20, "Название", "urgent"));
  assertFailure(addTask(tasks, "20", "Название"));
  assert.equal(snapshot(tasks), before);
});

check("setTaskCompleted: изменение статуса и возврат обратно", () => {
  const tasks = demo();
  const before = snapshot(tasks);

  const done = setTaskCompleted(tasks, 4, true);
  assert.equal(done.ok, true);
  assert.equal(findTaskById(done.tasks, 4).completed, true);
  assert.notEqual(done.tasks[1], tasks[1], "создаётся новый объект изменённой записи");
  assert.equal(done.tasks[0], tasks[0], "неизменённые записи можно использовать повторно");
  assert.deepEqual(ids(done.tasks), [1, 4, 7, 10]);

  const back = setTaskCompleted(done.tasks, 4, false);
  assert.equal(back.ok, true);
  assert.equal(findTaskById(back.tasks, 4).completed, false);
  assert.equal(findTaskById(done.tasks, 4).completed, true, "предыдущее состояние сохранено");

  assert.equal(snapshot(tasks), before);
});

check("setTaskCompleted: отказ при нелогическом значении", () => {
  const tasks = demo();
  const before = snapshot(tasks);

  for (const value of ["true", "false", 0, 1, null, undefined, {}]) {
    assertFailure(setTaskCompleted(tasks, 4, value));
  }

  assert.equal(snapshot(tasks), before);
});

check("renameTask: переименование с нормализацией названия", () => {
  const tasks = demo();
  const before = snapshot(tasks);
  const result = renameTask(tasks, 10, "   Подготовить инструкцию запуска   ");

  assert.equal(result.ok, true);

  const renamed = findTaskById(result.tasks, 10);

  assert.equal(renamed.title, "Подготовить инструкцию запуска");
  assert.equal(renamed.id, 10);
  assert.equal(renamed.completed, true);
  assert.equal(renamed.priority, "medium");
  assert.notEqual(renamed, tasks[3]);
  assert.equal(snapshot(tasks), before);
});

check("renameTask: отказ при некорректном названии", () => {
  const tasks = demo();
  const before = snapshot(tasks);

  assertFailure(renameTask(tasks, 10, ""));
  assertFailure(renameTask(tasks, 10, "   "));
  assertFailure(renameTask(tasks, 10, "Д".repeat(101)));
  assertFailure(renameTask(tasks, 10, 42));
  assertFailure(renameTask(tasks, 10, null));
  assert.equal(snapshot(tasks), before);
});

check("removeTask: удаление задачи по идентификатору", () => {
  const tasks = demo();
  const before = snapshot(tasks);
  const result = removeTask(tasks, 7);

  assert.equal(result.ok, true);
  assert.deepEqual(ids(result.tasks), [1, 4, 10]);
  assert.notEqual(result.tasks, tasks);
  assert.equal(snapshot(tasks), before);
});

check("removeTask: удаление единственной задачи", () => {
  const tasks = [{ id: 11, title: "Единственная", completed: false, priority: "low" }];
  const result = removeTask(tasks, 11);

  assert.equal(result.ok, true);
  assert.deepEqual(result.tasks, []);
  assert.equal(tasks.length, 1);
});

check("Операции изменения отклоняют отсутствующую задачу", () => {
  const tasks = demo();
  const before = snapshot(tasks);

  assertFailure(setTaskCompleted(tasks, 777, true));
  assertFailure(renameTask(tasks, 777, "Новое название"));
  assertFailure(removeTask(tasks, 777));
  assertFailure(removeTask([], 4));
  assert.equal(snapshot(tasks), before);
});

check("Операции изменения отклоняют некорректный идентификатор", () => {
  const tasks = demo();
  const before = snapshot(tasks);

  for (const id of ["4", 0, -1, 1.5, NaN, Infinity, null, undefined]) {
    assertFailure(addTask(tasks, id, "Название"));
    assertFailure(setTaskCompleted(tasks, id, true));
    assertFailure(renameTask(tasks, id, "Название"));
    assertFailure(removeTask(tasks, id));
  }

  assert.equal(snapshot(tasks), before);
});

check("Повторная установка текущего названия или статуса", () => {
  const tasks = demo();

  const sameStatus = setTaskCompleted(tasks, 1, true);
  assert.equal(sameStatus.ok, true);
  assert.notEqual(sameStatus.tasks, tasks);
  assert.notEqual(sameStatus.tasks[0], tasks[0]);
  assert.deepEqual(sameStatus.tasks[0], tasks[0]);

  const sameTitle = renameTask(tasks, 1, "Изучить функции");
  assert.equal(sameTitle.ok, true);
  assert.notEqual(sameTitle.tasks, tasks);
  assert.notEqual(sameTitle.tasks[0], tasks[0]);
  assert.deepEqual(sameTitle.tasks[0], tasks[0]);
});

// --- Итог ---------------------------------------------------------------------

const total = passedCount + failedNames.length;

console.log(`\nВсего: ${total}. Пройдено: ${passedCount}. Ошибок: ${failedNames.length}.`);

if (failedNames.length > 0) {
  console.log("Непройденные проверки:");

  for (const name of failedNames) {
    console.log(`  - ${name}`);
  }

  process.exitCode = 1;
}
