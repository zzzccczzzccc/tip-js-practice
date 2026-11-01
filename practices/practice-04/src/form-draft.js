// Расширение: черновик формы, вариант А: черновик незавершённой формы создания.
// Черновик хранится отдельным ключом и никогда не попадает в массив задач:
// это сырые строки полей, а не проверенная запись модели.

export const DRAFT_VERSION = 1;

const PRIORITIES = ["low", "medium", "high"];

function isValidDraft(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    PRIORITIES.includes(value.priority)
  );
}

/** Черновик считается пустым, если пользователь не ввёл ни id, ни название. */
export function isDraftEmpty(draft) {
  return draft.id.trim() === "" && draft.title.trim() === "";
}

export function loadDraft(storage, key) {
  let raw;

  try {
    raw = storage.getItem(key);
  } catch (error) {
    return { ok: false, source: "fallback", error: `Хранилище недоступно: ${error.message}.` };
  }

  if (raw === null || raw === undefined) {
    return { ok: true, source: "initial", draft: null };
  }

  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      source: "fallback",
      error: "Черновик формы повреждён: не удалось разобрать JSON.",
    };
  }

  if (
    parsed === null ||
    typeof parsed !== "object" ||
    parsed.version !== DRAFT_VERSION ||
    !isValidDraft(parsed.draft)
  ) {
    return {
      ok: false,
      source: "fallback",
      error: "Черновик формы не соответствует ожидаемой структуре.",
    };
  }

  return { ok: true, source: "storage", draft: { ...parsed.draft } };
}

export function saveDraft(storage, key, draft) {
  if (!isValidDraft(draft)) {
    return { ok: false, error: "Черновик содержит недопустимые значения полей." };
  }

  try {
    storage.setItem(key, JSON.stringify({ version: DRAFT_VERSION, draft }));
  } catch (error) {
    return { ok: false, error: `Не удалось сохранить черновик: ${error.message}.` };
  }

  return { ok: true };
}

export function removeDraft(storage, key) {
  try {
    storage.removeItem(key);
  } catch (error) {
    return { ok: false, error: `Не удалось удалить черновик: ${error.message}.` };
  }

  return { ok: true };
}
