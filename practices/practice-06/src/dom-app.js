// DOM-адаптер: связывает контроллер с разметкой. HTTP-запросы здесь не выполняются.

import { renderTaskList } from "./task-view.js";

export function createDomApp(root = document) {
  const listElement = root.querySelector("#task-list");
  const listStatus = root.querySelector("#list-status");
  const foundCount = root.querySelector("#found-count");
  const operationMessage = root.querySelector("#operation-message");
  const durationElement = root.querySelector("#request-duration");
  const form = root.querySelector("#task-form");
  const formTitle = root.querySelector("#form-title");
  const submitButton = root.querySelector("#form-submit");
  const cancelButton = root.querySelector("#form-cancel");
  const titleField = root.querySelector("#field-title");
  const priorityField = root.querySelector("#field-priority");
  const categoryField = root.querySelector("#field-category");
  const filterForm = root.querySelector("#filter-form");
  const filterCompleted = root.querySelector("#filter-completed");
  const filterPriority = root.querySelector("#filter-priority");
  const filterCategory = root.querySelector("#filter-category");
  const filterQuery = root.querySelector("#filter-q");
  const mutationButtons = [
    submitButton,
    cancelButton,
    root.querySelector("#reset-data"),
  ].filter(Boolean);

  function fillSelect(select, items, placeholder) {
    const current = select.value;
    const options = [];

    if (placeholder !== undefined) {
      const option = document.createElement("option");

      option.value = "";
      option.textContent = placeholder;
      options.push(option);
    }

    for (const item of items) {
      const option = document.createElement("option");

      option.value = String(item.id);
      option.textContent = item.name;
      options.push(option);
    }

    select.replaceChildren(...options);
    select.value = [...select.options].some((option) => option.value === current) ? current : "";
  }

  const view = {
    setCategories(categories) {
      fillSelect(categoryField, categories);
      fillSelect(filterCategory, categories, "Все категории");
    },

    setFilters(filters) {
      filterCompleted.value =
        filters.completed === true ? "true" : filters.completed === false ? "false" : "";
      filterPriority.value = filters.priority ?? "";
      filterCategory.value = filters.categoryId === undefined ? "" : String(filters.categoryId);
      filterQuery.value = filters.q ?? "";
    },

    setTasks(tasks, categories, meta) {
      renderTaskList(listElement, tasks, categories);
      foundCount.textContent =
        meta === undefined ? `Показано: ${tasks.length}` : `Найдено: ${meta.total}`;
    },

    setListState(state, message = "") {
      listElement.setAttribute("aria-busy", state === "loading" ? "true" : "false");

      if (state === "loading") {
        listStatus.textContent = "Загрузка задач…";
        foundCount.textContent = "";

        return;
      }

      if (state === "empty") {
        listStatus.textContent = "Нет задач по выбранному фильтру.";

        return;
      }

      if (state === "error") {
        listStatus.textContent = message;

        return;
      }

      listStatus.textContent = "";
    },

    setMutationPending(pending) {
      for (const button of mutationButtons) {
        button.disabled = pending;
      }

      for (const button of listElement.querySelectorAll("button")) {
        button.disabled = pending;
      }
    },

    notify(message, kind) {
      operationMessage.textContent = message;
      operationMessage.dataset.kind = kind;
    },

    showFormErrors(errors) {
      for (const name of ["title", "priority", "categoryId"]) {
        const element = form.querySelector(`[data-error-for="${name}"]`);

        if (element !== null) {
          element.textContent = errors[name] ?? "";
        }
      }
    },

    setFormMode(task) {
      if (task === null || task === undefined) {
        form.reset();
        formTitle.textContent = "Добавление задачи";
        submitButton.textContent = "Добавить задачу";
        cancelButton.hidden = true;
        titleField.focus();

        return;
      }

      titleField.value = task.title;
      priorityField.value = task.priority;
      categoryField.value = String(task.categoryId);
      formTitle.textContent = `Редактирование задачи № ${task.id}`;
      submitButton.textContent = "Сохранить изменения";
      cancelButton.hidden = false;
      titleField.focus();
    },

    setRequestDuration(ms) {
      if (durationElement !== null) {
        durationElement.textContent = `Последний запрос: ${Math.round(ms)} мс`;
      }
    },

    readDraft() {
      return {
        title: titleField.value,
        priority: priorityField.value,
        categoryId: Number(categoryField.value),
      };
    },

    readFilters() {
      const filters = {};

      if (filterCompleted.value === "true") {
        filters.completed = true;
      } else if (filterCompleted.value === "false") {
        filters.completed = false;
      }

      if (filterPriority.value !== "") {
        filters.priority = filterPriority.value;
      }

      if (filterCategory.value !== "") {
        filters.categoryId = Number(filterCategory.value);
      }

      if (filterQuery.value.trim() !== "") {
        filters.q = filterQuery.value.trim();
      }

      return filters;
    },
  };

  return {
    view,
    form,
    filterForm,
    listElement,
    cancelButton,
    resetDataButton: root.querySelector("#reset-data"),
    resetFiltersButton: root.querySelector("#reset-filters"),
    retryButton: root.querySelector("#retry-load"),
  };
}
