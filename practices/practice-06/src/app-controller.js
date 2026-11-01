// Контроллер состояния приложения. Не обращается к document и не импортирует dom-app.

import { ApiError } from "./api-client.js";
import { validateTaskDraft } from "./form-validation.js";

export function messageForError(error) {
  if (error instanceof ApiError) {
    if (error.kind === "aborted") {
      return "";
    }

    if (error.kind === "timeout") {
      return "Превышено время ожидания ответа сервера.";
    }

    if (error.kind === "network") {
      return "Не удалось связаться с учебным API. Проверьте, что сервер запущен.";
    }

    if (error.kind === "http") {
      return error.message;
    }

    return "Ответ сервера имеет неожиданный формат.";
  }

  return error instanceof Error ? error.message : String(error);
}

export function createAppController({ api, view }) {
  if (api === null || typeof api !== "object") {
    throw new TypeError("createAppController: ожидается предметный API.");
  }

  if (view === null || typeof view !== "object") {
    throw new TypeError("createAppController: ожидается представление.");
  }

  let tasks = [];
  let categories = [];
  let filters = {};
  let editingId = null;
  let loadController = null;
  let loadSequence = 0;
  let started = false;
  let destroyed = false;

  function currentFilters() {
    return { ...filters };
  }

  function applyReady(nextTasks, meta) {
    tasks = nextTasks;
    view.setTasks(nextTasks, categories, meta);
    view.setListState(nextTasks.length === 0 ? "empty" : "ready");
  }

  async function loadCurrentTasks() {
    const sequence = (loadSequence += 1);

    if (loadController !== null) {
      loadController.abort();
    }

    loadController = new AbortController();
    view.setListState("loading");

    const startedAt = performance.now();

    try {
      const result = await api.getTasks(currentFilters(), { signal: loadController.signal });

      if (sequence !== loadSequence || destroyed) {
        return;
      }

      applyReady(result.tasks, result.meta);
      view.setRequestDuration?.(performance.now() - startedAt);
    } catch (error) {
      if (destroyed || sequence !== loadSequence) {
        return;
      }

      if (error instanceof ApiError && error.kind === "aborted") {
        return;
      }

      view.setListState("error", messageForError(error));
    } finally {
      if (sequence === loadSequence) {
        loadController = null;
      }
    }
  }

  async function mutate(action, successMessage) {
    view.setMutationPending(true);

    try {
      await action();
      view.notify(successMessage, "success");
      await loadCurrentTasks();
    } catch (error) {
      if (!(error instanceof ApiError && error.kind === "aborted")) {
        view.notify(messageForError(error), "error");
      }
    } finally {
      view.setMutationPending(false);
    }
  }

  async function start(initialFilters = {}) {
    if (destroyed) {
      return;
    }

    filters = { ...initialFilters };
    started = true;
    view.setFilters(currentFilters());
    view.setListState("loading");

    const sequence = (loadSequence += 1);

    if (loadController !== null) {
      loadController.abort();
    }

    loadController = new AbortController();

    const startedAt = performance.now();

    try {
      const result = await api.loadInitialData(currentFilters(), { signal: loadController.signal });

      if (sequence !== loadSequence || destroyed) {
        return;
      }

      categories = result.categories;
      view.setCategories(categories);
      applyReady(result.tasks, result.meta);
      view.setRequestDuration?.(performance.now() - startedAt);
    } catch (error) {
      if (destroyed || sequence !== loadSequence) {
        return;
      }

      if (error instanceof ApiError && error.kind === "aborted") {
        return;
      }

      view.setListState("error", messageForError(error));
    } finally {
      if (sequence === loadSequence) {
        loadController = null;
      }
    }
  }

  async function applyFilters(nextFilters) {
    filters = { ...nextFilters };
    view.setFilters(currentFilters());
    await loadCurrentTasks();
  }

  async function refresh() {
    if (!started || categories.length === 0) {
      await start(currentFilters());

      return;
    }

    await loadCurrentTasks();
  }

  async function submit(draft) {
    const validation = validateTaskDraft(draft, categories);

    if (!validation.valid) {
      view.showFormErrors(validation.errors);

      return { ok: false, errors: validation.errors };
    }

    view.showFormErrors({});

    const wasEditing = editingId;

    await mutate(async () => {
      if (wasEditing === null) {
        await api.createTask(validation.value);
      } else {
        await api.updateTask(wasEditing, validation.value);
      }
    }, wasEditing === null ? "Задача создана." : `Задача ${wasEditing} изменена.`);

    editingId = null;
    view.setFormMode(null);

    return { ok: true };
  }

  function beginEdit(id) {
    const task = tasks.find((item) => item.id === id);

    if (task === undefined) {
      view.notify(`Задача ${id} не найдена в текущей выборке.`, "error");
      cancelEdit();

      return;
    }

    editingId = id;
    view.setFormMode(task);
  }

  function cancelEdit() {
    editingId = null;
    view.setFormMode(null);
  }

  async function toggleTask(id) {
    const task = tasks.find((item) => item.id === id);

    if (task === undefined) {
      view.notify(`Задача ${id} не найдена в текущей выборке.`, "error");

      return;
    }

    await mutate(
      () => api.setTaskCompleted(id, !task.completed),
      `Статус задачи ${id} изменён.`
    );
  }

  async function deleteTask(id) {
    await mutate(async () => {
      await api.deleteTask(id);

      if (editingId === id) {
        cancelEdit();
      }
    }, `Задача ${id} удалена.`);
  }

  async function resetData() {
    await mutate(() => api.resetDemoData(), "Исходный набор восстановлен.");
  }

  function destroy() {
    destroyed = true;

    if (loadController !== null) {
      loadController.abort();
      loadController = null;
    }
  }

  return {
    start,
    applyFilters,
    refresh,
    submit,
    beginEdit,
    cancelEdit,
    toggleTask,
    deleteTask,
    resetData,
    destroy,
    getState: () => ({
      tasks: tasks.map((task) => ({ ...task })),
      categories: categories.map((item) => ({ ...item })),
      filters: currentFilters(),
      editingId,
    }),
  };
}
