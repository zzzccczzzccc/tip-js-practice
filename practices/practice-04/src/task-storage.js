// Локальное хранение списка задач. Модуль работает с переданным объектом storage,
// поэтому его можно проверить без браузера. Исключения хранилища наружу не выбрасываются.

export const STORAGE_VERSION = 1;

const PRIORITIES = ["low", "medium", "high"];
const TITLE_MAX_LENGTH = 100;

function isValidTask(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const { id, title, completed, priority } = value;

  if (!Number.isSafeInteger(id) || id <= 0) {
    return false;
  }

  if (typeof title !== "string") {
    return false;
  }

  const trimmed = title.trim();

  if (trimmed.length < 1 || trimmed.length > TITLE_MAX_LENGTH || trimmed !== title) {
    return false;
  }

  return typeof completed === "boolean" && PRIORITIES.includes(priority);
}

/** Проверка: массив задач с уникальными id. */
export function isValidTaskList(value) {
  if (!Array.isArray(value)) {
    return false;
  }

  const seen = new Set();

  for (const task of value) {
    if (!isValidTask(task)) {
      return false;
    }

    if (seen.has(task.id)) {
      return false;
    }

    seen.add(task.id);
  }

  return true;
}

function copyTasks(tasks) {
  return tasks.map((task) => ({ ...task }));
}

/**
 * Загружает список задач. Не бросает исключения наружу.
 * source: "storage" — данные прочитаны, "initial" — ключа нет, "fallback" — данные непригодны.
 */
export function loadTasks(storage, key, fallbackTasks) {
  let raw;

  try {
    raw = storage.getItem(key);
  } catch (error) {
    return {
      ok: false,
      source: "fallback",
      error: `Хранилище недоступно: ${error.message}.`,
      tasks: copyTasks(fallbackTasks),
    };
  }

  if (raw === null || raw === undefined) {
    return { ok: true, source: "initial", tasks: copyTasks(fallbackTasks) };
  }

  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      source: "fallback",
      error: "Сохранённые данные повреждены: не удалось разобрать JSON.",
      tasks: copyTasks(fallbackTasks),
    };
  }

  if (
    parsed === null ||
    typeof parsed !== "object" ||
    parsed.version !== STORAGE_VERSION ||
    !isValidTaskList(parsed.tasks)
  ) {
    return {
      ok: false,
      source: "fallback",
      error: "Сохранённые данные не соответствуют формату списка задач.",
      tasks: copyTasks(fallbackTasks),
    };
  }

  return { ok: true, source: "storage", tasks: copyTasks(parsed.tasks) };
}

export function saveTasks(storage, key, tasks) {
  if (!isValidTaskList(tasks)) {
    return { ok: false, error: "Сохранять можно только корректный список задач." };
  }

  try {
    storage.setItem(key, JSON.stringify({ version: STORAGE_VERSION, tasks }));
  } catch (error) {
    return { ok: false, error: `Не удалось сохранить данные: ${error.message}.` };
  }

  return { ok: true };
}

/** Удаляет ровно один ключ. localStorage.clear() не используется. */
export function removeSavedTasks(storage, key) {
  try {
    storage.removeItem(key);
  } catch (error) {
    return { ok: false, error: `Не удалось удалить данные: ${error.message}.` };
  }

  return { ok: true };
}
