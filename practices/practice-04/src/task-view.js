// Создание и обновление DOM. Модуль не изменяет задачи и не назначает обработчики событий.
// Разметка строится только DOM-методами: innerHTML, outerHTML и insertAdjacentHTML не используются.

import { getTaskStats } from "./task-service.js";

const PRIORITY_LABELS = {
  low: "Низкий",
  medium: "Средний",
  high: "Высокий",
};

const EMPTY_LIST_MESSAGE = "Список задач пуст.";
const EMPTY_FILTER_MESSAGE = "Нет задач по выбранному фильтру.";

function createActionButton(action, label, pressed) {
  const button = document.createElement("button");

  button.type = "button";
  button.dataset.action = action;

  if (pressed !== undefined) {
    button.setAttribute("aria-pressed", pressed ? "true" : "false");
  }

  const text = document.createElement("span");

  text.classList.add("action-label");
  text.textContent = label;
  button.append(text);

  return button;
}

export function createTaskElement(task) {
  const card = document.createElement("li");

  card.classList.add("task-card");
  card.dataset.taskId = String(task.id);

  if (task.completed) {
    card.classList.add("is-completed");
  }

  const title = document.createElement("h3");

  title.classList.add("task-title");
  title.textContent = task.title;

  const status = document.createElement("span");

  status.classList.add("task-status");
  status.textContent = task.completed ? "Выполнена" : "В работе";

  const priority = document.createElement("span");

  priority.classList.add("task-priority");
  priority.textContent = PRIORITY_LABELS[task.priority] ?? task.priority;

  const actions = document.createElement("div");

  actions.classList.add("task-actions");
  actions.append(
    createActionButton("toggle", "Выполнена", task.completed),
    createActionButton("edit", "Изменить"),
    createActionButton("delete", "Удалить")
  );

  card.append(title, status, priority, actions);

  return card;
}

export function renderTaskList(listElement, tasks) {
  listElement.replaceChildren(...tasks.map((task) => createTaskElement(task)));
}

export function renderSummary(summaryElement, tasks, visibleCount) {
  const { total, completed, pending, progress } = getTaskStats(tasks);

  setStat(summaryElement, "total", String(total));
  setStat(summaryElement, "completed", String(completed));
  setStat(summaryElement, "pending", String(pending));
  setStat(summaryElement, "progress", `${progress.toFixed(1)}%`);
  setStat(summaryElement, "visible", String(visibleCount));
}

export function renderEmptyState(messageElement, total, visibleCount) {
  if (visibleCount > 0) {
    messageElement.textContent = "";
    messageElement.hidden = true;

    return;
  }

  messageElement.textContent = total === 0 ? EMPTY_LIST_MESSAGE : EMPTY_FILTER_MESSAGE;
  messageElement.hidden = false;
}

function setStat(summaryElement, name, value) {
  const target = summaryElement.querySelector(`[data-stat="${name}"]`);

  if (target !== null) {
    target.textContent = value;
  }
}
