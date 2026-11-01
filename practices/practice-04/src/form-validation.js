// Чистая валидация черновика формы.
// Не трогает DOM и хранилище, возвращает сразу все ошибки.

const ALLOWED_PRIORITIES = ["low", "medium", "high"];
const MIN_TITLE = 1;
const MAX_TITLE = 100;

/**
 * Проверяет значения полей формы.
 * @param {{ id: unknown, title: unknown, priority: unknown }} draft
 * @param {Array<{ id: number }>} tasks
 * @param {number|null} [editingId=null]
 */
export function validateTaskDraft(draft, tasks, editingId = null) {
  const errors = {};
  let resolvedId = null;

  // --- id ---
  if (editingId !== null) {
    if (!Number.isSafeInteger(editingId) || editingId <= 0) {
      errors.id = "Идентификатор редактируемой задачи некорректен.";
    } else if (!tasks.some((t) => t.id === editingId)) {
      errors.id = "Редактируемая задача не найдена.";
    } else {
      resolvedId = editingId;
    }
  } else {
    const raw = typeof draft.id === "string" ? draft.id.trim() : draft.id;

    if (raw === "" || raw == null) {
      errors.id = "Укажите идентификатор задачи.";
    } else {
      const num = Number(raw);
      if (!Number.isSafeInteger(num) || num <= 0) {
        errors.id = "Идентификатор должен быть положительным целым числом.";
      } else if (tasks.some((t) => t.id === num)) {
        errors.id = "Задача с таким идентификатором уже существует.";
      } else {
        resolvedId = num;
      }
    }
  }

  // --- title ---
  let cleanTitle = "";
  if (typeof draft.title !== "string") {
    errors.title = "Название должно быть строкой.";
  } else {
    cleanTitle = draft.title.trim();
    if (cleanTitle.length < MIN_TITLE) {
      errors.title = "Укажите название задачи.";
    } else if (cleanTitle.length > MAX_TITLE) {
      errors.title = `Название не должно превышать ${MAX_TITLE} символов.`;
    }
  }

  // --- priority ---
  if (!ALLOWED_PRIORITIES.includes(draft.priority)) {
    errors.priority = `Выберите приоритет: ${ALLOWED_PRIORITIES.join(", ")}.`;
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      id: resolvedId,
      title: cleanTitle,
      priority: draft.priority,
    },
  };
}
