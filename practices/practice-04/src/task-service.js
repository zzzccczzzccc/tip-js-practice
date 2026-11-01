// Прикладные функции работы с задачами.
// Модуль не выводит сообщения, не знает о DOM и не хранит собственный список задач:
// каждая функция работает только с переданными аргументами.

const PRIORITIES = ["low", "medium", "high"];
const TITLE_MIN_LENGTH = 1;
const TITLE_MAX_LENGTH = 100;

/** Возвращает описание ошибки идентификатора или пустую строку. */
function getIdError(id) {
  if (!Number.isSafeInteger(id) || id <= 0) {
    return "Идентификатор должен быть положительным целым числом.";
  }

  return "";
}

/** Проверяет и нормализует название задачи. */
function normalizeTitle(title) {
  if (typeof title !== "string") {
    return { ok: false, error: "Название должно быть строкой." };
  }

  const value = title.trim();

  if (value.length < TITLE_MIN_LENGTH || value.length > TITLE_MAX_LENGTH) {
    return {
      ok: false,
      error: `Название должно содержать от ${TITLE_MIN_LENGTH} до ${TITLE_MAX_LENGTH} символов.`,
    };
  }

  return { ok: true, title: value };
}

/** Возвращает описание ошибки приоритета или пустую строку. */
function getPriorityError(priority) {
  if (!PRIORITIES.includes(priority)) {
    return `Приоритет должен быть одним из значений: ${PRIORITIES.join(", ")}.`;
  }

  return "";
}

export function createTask(id, title, priority = "medium") {
  const idError = getIdError(id);

  if (idError !== "") {
    return { ok: false, error: idError };
  }

  const normalized = normalizeTitle(title);

  if (!normalized.ok) {
    return { ok: false, error: normalized.error };
  }

  const priorityError = getPriorityError(priority);

  if (priorityError !== "") {
    return { ok: false, error: priorityError };
  }

  return {
    ok: true,
    task: {
      id,
      title: normalized.title,
      completed: false,
      priority,
    },
  };
}

export function findTaskById(tasks, id) {
  return tasks.find((task) => task.id === id);
}

export function getPendingTasks(tasks) {
  return tasks.filter((task) => task.completed === false);
}

export function getTaskTitles(tasks) {
  return tasks.map((task) => task.title);
}

export function getTaskStats(tasks) {
  const total = tasks.length;
  const completed = tasks.filter((task) => task.completed === true).length;
  const pending = total - completed;
  const progress = total > 0 ? (completed / total) * 100 : 0;

  return { total, completed, pending, progress };
}

export function addTask(tasks, id, title, priority = "medium") {
  const created = createTask(id, title, priority);

  if (!created.ok) {
    return { ok: false, error: created.error };
  }

  if (findTaskById(tasks, id) !== undefined) {
    return { ok: false, error: `Задача с идентификатором ${id} уже существует.` };
  }

  return { ok: true, tasks: [...tasks, created.task] };
}

export function setTaskCompleted(tasks, id, completed) {
  const idError = getIdError(id);

  if (idError !== "") {
    return { ok: false, error: idError };
  }

  if (typeof completed !== "boolean") {
    return { ok: false, error: "Признак выполнения должен быть логическим значением." };
  }

  if (findTaskById(tasks, id) === undefined) {
    return { ok: false, error: `Задача с идентификатором ${id} не найдена.` };
  }

  return {
    ok: true,
    tasks: tasks.map((task) => (task.id === id ? { ...task, completed } : task)),
  };
}

export function renameTask(tasks, id, title) {
  const idError = getIdError(id);

  if (idError !== "") {
    return { ok: false, error: idError };
  }

  const normalized = normalizeTitle(title);

  if (!normalized.ok) {
    return { ok: false, error: normalized.error };
  }

  if (findTaskById(tasks, id) === undefined) {
    return { ok: false, error: `Задача с идентификатором ${id} не найдена.` };
  }

  return {
    ok: true,
    tasks: tasks.map((task) => (task.id === id ? { ...task, title: normalized.title } : task)),
  };
}

export function updateTask(tasks, id, title, priority) {
  const idError = getIdError(id);

  if (idError !== "") {
    return { ok: false, error: idError };
  }

  const normalized = normalizeTitle(title);

  if (!normalized.ok) {
    return { ok: false, error: normalized.error };
  }

  const priorityError = getPriorityError(priority);

  if (priorityError !== "") {
    return { ok: false, error: priorityError };
  }

  if (findTaskById(tasks, id) === undefined) {
    return { ok: false, error: `Задача с идентификатором ${id} не найдена.` };
  }

  return {
    ok: true,
    tasks: tasks.map((task) =>
      task.id === id ? { ...task, title: normalized.title, priority } : task
    ),
  };
}

export function removeTask(tasks, id) {
  const idError = getIdError(id);

  if (idError !== "") {
    return { ok: false, error: idError };
  }

  if (findTaskById(tasks, id) === undefined) {
    return { ok: false, error: `Задача с идентификатором ${id} не найдена.` };
  }

  return { ok: true, tasks: tasks.filter((task) => task.id !== id) };
}
