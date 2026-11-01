// Текущее состояние приложения, режим формы, события и координация модулей.
// Правила модели здесь не дублируются: используются функции сервиса, валидации и хранения.

import { demoTasks, variantTasks } from "./data.js";
import { addTask, findTaskById, removeTask, setTaskCompleted, updateTask } from "./task-service.js";
import { getVisibleTasks } from "./task-selectors.js";
import { renderEmptyState, renderSummary, renderTaskList } from "./task-view.js";
import { validateTaskDraft } from "./form-validation.js";
import { loadTasks, removeSavedTasks, saveTasks } from "./task-storage.js";
import { isDraftEmpty, loadDraft, removeDraft, saveDraft } from "./form-draft.js";

const listElement = document.querySelector("#task-list");
const summaryElement = document.querySelector("#task-summary");
const emptyElement = document.querySelector("#empty-message");
const messageElement = document.querySelector("#operation-message");
const storageMessageElement = document.querySelector("#storage-message");
const filtersElement = document.querySelector("#task-filters");
const resetButton = document.querySelector("#reset-storage");

const formElement = document.querySelector("#task-form");
const formTitleElement = document.querySelector("#form-title");
const submitButton = document.querySelector("#form-submit");
const cancelButton = document.querySelector("#form-cancel");
const idField = document.querySelector("#field-id");
const titleField = document.querySelector("#field-title");
const priorityField = document.querySelector("#field-priority");

const draftMessageElement = document.querySelector("#draft-message");
const draftClearButton = document.querySelector("#draft-clear");

const FIELDS = {
  id: idField,
  title: titleField,
  priority: priorityField,
};

const queryParams = new URLSearchParams(window.location.search);
const datasetName = queryParams.get("dataset") === "variant" ? "variant" : "demo";
const isCheckMode = queryParams.get("mode") === "check";

// Общий и индивидуальный наборы, а также автоматические проверки используют разные ключи,
// поэтому данные не смешиваются и проверки не удаляют рабочее состояние.
const storageKey = isCheckMode
  ? `tip-js-practice-04:checks:${datasetName}`
  : `tip-js-practice-04:${datasetName}`;
const draftStorageKey = `${storageKey}:draft`;

const initialTasks = datasetName === "variant" ? variantTasks : demoTasks;

let currentTasks = [];
let currentFilter = "all";
let editingId = null;

function showMessage(text) {
  messageElement.textContent = text;
}

function showStorageMessage(text) {
  storageMessageElement.textContent = text;
}

function readDraftFields() {
  return {
    id: idField.disabled ? "" : idField.value,
    title: titleField.value,
    priority: priorityField.value,
  };
}

// --- Дополнительное задание, вариант А: черновик формы ---

function showDraftMessage(text) {
  draftMessageElement.textContent = text;
  draftClearButton.hidden = text === "";
}

function persistDraft() {
  if (editingId !== null) {
    return;
  }

  const draft = readDraftFields();

  if (isDraftEmpty(draft)) {
    removeDraft(window.localStorage, draftStorageKey);
    showDraftMessage("");

    return;
  }

  const result = saveDraft(window.localStorage, draftStorageKey, draft);

  showDraftMessage(result.ok ? "Черновик формы сохранён." : result.error);
}

function dropDraft() {
  removeDraft(window.localStorage, draftStorageKey);
  showDraftMessage("");
}

function restoreDraft() {
  const result = loadDraft(window.localStorage, draftStorageKey);

  if (!result.ok) {
    dropDraft();
    showDraftMessage(`${result.error} Черновик удалён.`);

    return;
  }

  if (result.draft === null) {
    showDraftMessage("");

    return;
  }

  idField.value = result.draft.id;
  titleField.value = result.draft.title;
  priorityField.value = result.draft.priority;
  showDraftMessage("Восстановлен черновик незавершённой формы.");
}

// --- Форма ---

function clearFieldError(name) {
  const errorElement = formElement.querySelector(`[data-error-for="${name}"]`);

  if (errorElement !== null) {
    errorElement.textContent = "";
  }

  const field = FIELDS[name];

  if (field !== undefined) {
    // Прикладное сообщение снимается, иначе поле останется невалидным для браузера.
    field.setCustomValidity("");
    field.classList.remove("is-invalid");
  }
}

function clearFormErrors() {
  for (const name of Object.keys(FIELDS)) {
    clearFieldError(name);
  }
}

/** Связывает ошибки валидации с конкретными полями формы. */
function showFormErrors(errors) {
  clearFormErrors();

  for (const [name, text] of Object.entries(errors)) {
    const errorElement = formElement.querySelector(`[data-error-for="${name}"]`);

    if (errorElement !== null) {
      errorElement.textContent = text;
    }

    const field = FIELDS[name];

    if (field !== undefined) {
      field.setCustomValidity(text);
      field.classList.add("is-invalid");
    }
  }
}

/**
 * Режим формы — часть состояния интерфейса, а не модели задачи,
 * поэтому он не сохраняется в localStorage.
 */
function setFormMode(id) {
  if (id === null) {
    editingId = null;
    formElement.reset();
    clearFormErrors();
    idField.disabled = false;
    formTitleElement.textContent = "Добавление задачи";
    submitButton.textContent = "Добавить задачу";
    cancelButton.hidden = true;
    idField.focus();

    return;
  }

  const task = findTaskById(currentTasks, id);

  if (task === undefined) {
    showMessage(`Задача с идентификатором ${id} не найдена: режим формы не изменён.`);

    return;
  }

  editingId = task.id;
  clearFormErrors();
  idField.value = String(task.id);
  titleField.value = task.title;
  priorityField.value = task.priority;
  // Отключённое поле не попадает в FormData, поэтому id берётся из editingId.
  idField.disabled = true;
  formTitleElement.textContent = `Редактирование задачи № ${task.id}`;
  submitButton.textContent = "Сохранить изменения";
  cancelButton.hidden = false;
  titleField.focus();
}

// --- Хранение ---

function persistTasks(tasks) {
  const result = saveTasks(window.localStorage, storageKey, tasks);

  if (!result.ok) {
    showStorageMessage(
      `${result.error} Изменение осталось только в текущей вкладке и может быть потеряно после перезагрузки.`
    );

    return;
  }

  showStorageMessage(`Изменения сохранены в localStorage (ключ ${storageKey}).`);
}

function restoreTasks() {
  const result = loadTasks(window.localStorage, storageKey, initialTasks);

  currentTasks = result.tasks;

  if (result.source === "storage") {
    showStorageMessage(`Список восстановлен из localStorage (ключ ${storageKey}).`);

    return;
  }

  if (result.source === "initial") {
    showStorageMessage("Сохранённых данных нет: загружен исходный набор.");

    return;
  }

  showStorageMessage(`${result.error} Загружен исходный набор, запись не удалена.`);
}

// --- Отрисовка ---

/** renderApp только отображает состояние: чтения и записи хранилища здесь нет. */
function renderApp() {
  const visibleTasks = getVisibleTasks(currentTasks, currentFilter);

  renderTaskList(listElement, visibleTasks);
  renderSummary(summaryElement, currentTasks, visibleTasks.length);
  renderEmptyState(emptyElement, currentTasks.length, visibleTasks.length);

  for (const button of filtersElement.querySelectorAll("button[data-filter]")) {
    const isActive = button.dataset.filter === currentFilter;

    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }
}

/** Возвращает фокус на то же действие той же задачи, а при её исчезновении — на активный фильтр. */
function restoreTaskFocus(id, action) {
  const card = listElement.querySelector(`li[data-task-id="${id}"]`);
  const target = card === null ? null : card.querySelector(`button[data-action="${action}"]`);

  if (target !== null) {
    target.focus();

    return;
  }

  const activeFilter = filtersElement.querySelector("button.is-active");

  if (activeFilter !== null) {
    activeFilter.focus();
  }
}

// --- Обработчики ---

function handleFormSubmit(event) {
  event.preventDefault();

  const formData = new FormData(formElement);
  const draft = {
    id: formData.get("id") ?? "",
    title: formData.get("title") ?? "",
    priority: formData.get("priority") ?? "",
  };

  const validation = validateTaskDraft(draft, currentTasks, editingId);

  if (!validation.ok) {
    showFormErrors(validation.errors);
    showMessage("Данные формы не приняты: исправьте отмеченные поля.");

    return;
  }

  const { id, title, priority } = validation.value;
  const result =
    editingId === null
      ? addTask(currentTasks, id, title, priority)
      : updateTask(currentTasks, id, title, priority);

  if (!result.ok) {
    showFormErrors({ id: result.error });
    showMessage(`Операция отклонена: ${result.error}`);

    return;
  }

  const wasEditing = editingId !== null;

  currentTasks = result.tasks;
  setFormMode(null);
  dropDraft();
  renderApp();
  persistTasks(currentTasks);
  showMessage(
    wasEditing ? `Задача ${id} изменена.` : `Задача ${id} добавлена с приоритетом ${priority}.`
  );
}

function handleFormInput(event) {
  const name = event.target.name;

  if (typeof name === "string" && name !== "") {
    // Снимается ошибка только исправляемого поля: остальные сообщения остаются видимыми.
    clearFieldError(name);
  }

  persistDraft();
}

function handleFormCancel() {
  setFormMode(null);
  showMessage("Редактирование отменено.");
}

function handleFilterClick(event) {
  const button = event.target.closest("button[data-filter]");

  if (button === null || !filtersElement.contains(button)) {
    return;
  }

  // Фильтр меняет только отображение: модель и хранилище не затрагиваются.
  currentFilter = button.dataset.filter;
  renderApp();
}

function handleTaskListClick(event) {
  const button = event.target.closest("button[data-action]");

  if (button === null || !listElement.contains(button)) {
    return;
  }

  const card = button.closest("li[data-task-id]");

  if (card === null) {
    return;
  }

  const id = Number(card.dataset.taskId);

  if (!Number.isSafeInteger(id) || id <= 0) {
    showMessage("Не удалось определить идентификатор задачи.");

    return;
  }

  const action = button.dataset.action;

  if (action === "edit") {
    // Переход в режим редактирования не изменяет данные и не пишет в хранилище.
    setFormMode(id);
    showMessage(`Задача ${id} открыта для редактирования.`);

    return;
  }

  if (action === "toggle") {
    const task = findTaskById(currentTasks, id);

    if (task === undefined) {
      showMessage(`Задача с идентификатором ${id} не найдена.`);

      return;
    }

    const result = setTaskCompleted(currentTasks, id, !task.completed);

    if (!result.ok) {
      showMessage(`Операция отклонена: ${result.error}`);

      return;
    }

    currentTasks = result.tasks;
    renderApp();
    persistTasks(currentTasks);
    showMessage(`Статус задачи ${id}: ${!task.completed ? "выполнена" : "в работе"}.`);
    restoreTaskFocus(id, action);

    return;
  }

  if (action === "delete") {
    const result = removeTask(currentTasks, id);

    if (!result.ok) {
      showMessage(`Операция отклонена: ${result.error}`);

      return;
    }

    currentTasks = result.tasks;

    if (editingId === id) {
      setFormMode(null);
    }

    renderApp();
    persistTasks(currentTasks);
    showMessage(`Задача ${id} удалена.`);
    restoreTaskFocus(id, action);

    return;
  }

  showMessage(`Действие «${action}» не поддерживается.`);
}

function handleResetClick() {
  const result = removeSavedTasks(window.localStorage, storageKey);

  // Исходный набор не записывается обратно, иначе ключ появился бы сразу после удаления.
  currentTasks = initialTasks.map((task) => ({ ...task }));
  currentFilter = "all";
  setFormMode(null);
  dropDraft();
  renderApp();

  showMessage("Сохранённые данные сброшены, загружен исходный набор.");
  showStorageMessage(
    result.ok ? `Ключ ${storageKey} удалён.` : `${result.error} Ключ мог остаться в хранилище.`
  );
}

// Подписки создаются один раз и не зависят от отрисовки.
formElement.addEventListener("submit", handleFormSubmit);
formElement.addEventListener("input", handleFormInput);
cancelButton.addEventListener("click", handleFormCancel);
draftClearButton.addEventListener("click", dropDraft);
filtersElement.addEventListener("click", handleFilterClick);
listElement.addEventListener("click", handleTaskListClick);
resetButton.addEventListener("click", handleResetClick);

try {
  restoreTasks();
  setFormMode(null);
  restoreDraft();
  renderApp();
} catch (error) {
  showMessage(`Ошибка запуска: ${error.message}`);
}

// Точка входа для браузерных проверок и отладки в консоли.
window.practice04 = {
  storageKey,
  draftStorageKey,
  getState: () => ({
    tasks: currentTasks.map((task) => ({ ...task })),
    filter: currentFilter,
    editingId,
  }),
};
