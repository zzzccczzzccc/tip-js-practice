// Карточки задач. Модуль не назначает обработчики и не выполняет запросы.

const PRIORITY_LABELS = {
  low: "Низкий",
  medium: "Средний",
  high: "Высокий",
};

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

export function createTaskElement(task, categories = []) {
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

  const category = document.createElement("span");
  const found = categories.find((item) => item.id === task.categoryId);

  category.classList.add("task-category");
  category.textContent = found === undefined ? `Категория ${task.categoryId}` : found.name;

  const actions = document.createElement("div");

  actions.classList.add("task-actions");
  actions.append(
    createActionButton("toggle", "Выполнена", task.completed),
    createActionButton("edit", "Изменить"),
    createActionButton("delete", "Удалить")
  );

  card.append(title, status, priority, category, actions);

  return card;
}

export function renderTaskList(listElement, tasks, categories = []) {
  listElement.replaceChildren(...tasks.map((task) => createTaskElement(task, categories)));
}
