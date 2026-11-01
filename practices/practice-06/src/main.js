import { createApiClient } from "./api-client.js";
import { createTaskApi } from "./task-api.js";
import { createAppController } from "./app-controller.js";
import { createDomApp } from "./dom-app.js";
import { getVariantFilters, variantNumber } from "./variant.js";

const params = new URLSearchParams(window.location.search);
const apiUrl = params.get("api") ?? "http://127.0.0.1:5505/api";
const dataset = params.get("dataset");
const initialFilters = dataset === "variant" ? getVariantFilters(variantNumber) : {};

const urlLabel = document.querySelector("#api-url");

if (urlLabel !== null) {
  urlLabel.textContent = `API: ${apiUrl}`;
}

const client = createApiClient({ baseUrl: apiUrl, timeoutMs: 3000 });
const api = createTaskApi(client);
const { view, form, filterForm, listElement, cancelButton, resetDataButton, resetFiltersButton, retryButton } =
  createDomApp(document);
const controller = createAppController({ api, view });

form.addEventListener("submit", (event) => {
  event.preventDefault();
  controller.submit(view.readDraft());
});

cancelButton.addEventListener("click", () => controller.cancelEdit());

filterForm.addEventListener("submit", (event) => {
  event.preventDefault();
  controller.applyFilters(view.readFilters());
});

resetFiltersButton.addEventListener("click", () => {
  controller.applyFilters(dataset === "variant" ? getVariantFilters(variantNumber) : {});
});

resetDataButton.addEventListener("click", () => controller.resetData());
retryButton.addEventListener("click", () => controller.refresh());

listElement.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");

  if (button === null) {
    return;
  }

  const card = button.closest("li[data-task-id]");

  if (card === null) {
    return;
  }

  const id = Number(card.dataset.taskId);
  const action = button.dataset.action;

  if (action === "edit") {
    controller.beginEdit(id);
  } else if (action === "toggle") {
    controller.toggleTask(id);
  } else if (action === "delete") {
    if (window.confirm(`Удалить задачу ${id}?`)) {
      controller.deleteTask(id);
    }
  }
});

const ready = controller.start(initialFilters);

window.practice06 = { ready, controller, apiUrl };

window.addEventListener("beforeunload", () => controller.destroy());
