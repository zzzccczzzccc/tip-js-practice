// Чистая проверка черновика формы. Функция не читает DOM и не изменяет входные объекты.

const PRIORITIES = ["low", "medium", "high"];
const TITLE_MAX_LENGTH = 100;

export function validateTaskDraft(draft, categories) {
  const errors = {};

  if (draft === null || typeof draft !== "object" || Array.isArray(draft)) {
    return { valid: false, errors: { title: "Черновик должен быть объектом." }, value: null };
  }

  let title = "";

  if (typeof draft.title !== "string") {
    errors.title = "Название должно быть строкой.";
  } else {
    title = draft.title.trim();

    if (title.length < 1 || title.length > TITLE_MAX_LENGTH) {
      errors.title = "Название должно содержать от 1 до 100 символов.";
    }
  }

  if (!PRIORITIES.includes(draft.priority)) {
    errors.priority = `Выберите приоритет: ${PRIORITIES.join(", ")}.`;
  }

  const categoryId = Number(draft.categoryId);
  const list = Array.isArray(categories) ? categories : [];

  if (!Number.isSafeInteger(categoryId) || categoryId <= 0) {
    errors.categoryId = "Выберите категорию.";
  } else if (list.find((item) => item.id === categoryId) === undefined) {
    errors.categoryId = "Выбранная категория не найдена.";
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors, value: null };
  }

  return {
    valid: true,
    errors: {},
    value: { title, priority: draft.priority, categoryId },
  };
}
