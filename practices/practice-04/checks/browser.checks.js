// Готовые браузерные проверки практической работы № 4.
// Проверяются регрессия представления ПР3, третья кнопка карточки, форма создания и
// редактирования, ошибки полей, сохранение операций, восстановление, сброс, повреждённый
// JSON и разделение ключей наборов.
//
// Приложение открывается с параметром mode=check, поэтому используются отдельные ключи
// tip-js-practice-04:checks:* и рабочие данные не затрагиваются.

import { getVisibleTasks } from "../src/task-selectors.js";
import {
  createTaskElement,
  renderEmptyState,
  renderSummary,
  renderTaskList,
} from "../src/task-view.js";

const logElement = document.querySelector("#checks-log");
const summaryElement = document.querySelector("#checks-summary");
const sandbox = document.querySelector("#sandbox");
const frame = document.querySelector("#app-frame");

const CHECK_PREFIX = "tip-js-practice-04:checks:";

let passedCount = 0;
const failedNames = [];

function log(line) {
  logElement.textContent += `${line}\n`;
}

async function check(name, body) {
  try {
    await body();
    passedCount += 1;
    log(`OK   ${name}`);
  } catch (error) {
    failedNames.push(name);
    log(`FAIL ${name}`);
    log(`     ${String(error && error.message).split("\n")[0]}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `${message}: ожидалось ${JSON.stringify(expected)}, получено ${JSON.stringify(actual)}`
    );
  }
}

function assertDeepEqual(actual, expected, message) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);

  if (left !== right) {
    throw new Error(`${message}: ожидалось ${right}, получено ${left}`);
  }
}

function demo() {
  return [
    { id: 1, title: "Изучить функции", completed: true, priority: "medium" },
    { id: 4, title: "Подготовить модель задач", completed: false, priority: "high" },
    { id: 7, title: "Проверить методы массивов", completed: false, priority: "low" },
    { id: 10, title: "Оформить README", completed: true, priority: "medium" },
  ];
}

const ids = (tasks) => tasks.map((task) => task.id);

// --- Песочница модулей отображения -------------------------------------------

function createSandbox() {
  sandbox.replaceChildren();

  const list = document.createElement("ul");
  const summary = document.createElement("dl");

  for (const name of ["total", "completed", "pending", "progress", "visible"]) {
    const value = document.createElement("dd");

    value.dataset.stat = name;
    value.textContent = "—";
    summary.append(value);
  }

  const message = document.createElement("p");

  message.hidden = true;
  sandbox.append(list, summary, message);

  return { list, summary, message };
}

const statOf = (summary, name) => summary.querySelector(`[data-stat="${name}"]`).textContent;

// --- Работа с хранилищем проверок --------------------------------------------

const keyFor = (dataset) => `${CHECK_PREFIX}${dataset ?? "demo"}`;

/** Удаляются только ключи пространства проверок. localStorage.clear() не используется. */
function clearCheckKeys() {
  const keys = [];

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);

    if (key !== null && key.startsWith(CHECK_PREFIX)) {
      keys.push(key);
    }
  }

  for (const key of keys) {
    window.localStorage.removeItem(key);
  }
}

function checkKeys() {
  const keys = [];

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);

    if (key !== null && key.startsWith(CHECK_PREFIX)) {
      keys.push(key);
    }
  }

  return keys.sort();
}

const rawStored = (dataset) => window.localStorage.getItem(keyFor(dataset));

function storedTasks(dataset) {
  const raw = rawStored(dataset);

  return raw === null ? null : JSON.parse(raw).tasks;
}

// --- Запуск приложения в iframe ----------------------------------------------

let frameCounter = 0;

function loadApp(dataset) {
  return new Promise((resolve, reject) => {
    const url = new URL("../index.html", import.meta.url);

    url.searchParams.set("mode", "check");

    if (dataset !== undefined) {
      url.searchParams.set("dataset", dataset);
    }

    frameCounter += 1;
    url.searchParams.set("checkRun", String(frameCounter));

    const timer = setTimeout(() => reject(new Error("приложение не загрузилось")), 5000);

    frame.addEventListener(
      "load",
      () => {
        // Модуль main.js выполняется после события load документа iframe.
        setTimeout(() => {
          clearTimeout(timer);
          resolve(frame.contentDocument);
        }, 60);
      },
      { once: true }
    );

    frame.src = url.toString();
  });
}

const appIds = (doc) =>
  [...doc.querySelectorAll("#task-list li[data-task-id]")].map((card) =>
    Number(card.dataset.taskId)
  );

const appStat = (doc, name) => doc.querySelector(`#task-summary [data-stat="${name}"]`).textContent;
const appMessage = (doc) => doc.querySelector("#operation-message").textContent;
const appStorageMessage = (doc) => doc.querySelector("#storage-message").textContent;
const appEmpty = (doc) => {
  const element = doc.querySelector("#empty-message");

  return element.hidden ? "" : element.textContent;
};

const fieldError = (doc, name) =>
  doc.querySelector(`#task-form [data-error-for="${name}"]`).textContent;

function fillForm(doc, values) {
  if ("id" in values) {
    doc.querySelector("#field-id").value = values.id;
  }

  if ("title" in values) {
    doc.querySelector("#field-title").value = values.title;
  }

  if ("priority" in values) {
    doc.querySelector("#field-priority").value = values.priority;
  }
}

function submitForm(doc) {
  // requestSubmit повторяет обычную отправку: нативные ограничения проверяются первыми.
  doc.querySelector("#task-form").requestSubmit();
}

function typeInto(doc, selector, value) {
  const field = doc.querySelector(selector);

  field.value = value;
  field.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));
}

function clickFilter(doc, value) {
  // Нажатие выполняется по вложенной подписи, чтобы проверить поиск кнопки через closest.
  doc.querySelector(`#task-filters button[data-filter="${value}"] .action-label`).click();
}

function clickAction(doc, id, action) {
  doc
    .querySelector(
      `#task-list li[data-task-id="${id}"] button[data-action="${action}"] .action-label`
    )
    .click();
}

const clickReset = (doc) => doc.querySelector("#reset-storage").click();

async function run() {
  clearCheckKeys();

  // --- Регрессия представления ПР3 -------------------------------------------

  await check("Регрессия: getVisibleTasks отбирает задачи по фильтру", () => {
    assertDeepEqual(ids(getVisibleTasks(demo(), "all")), [1, 4, 7, 10], "режим all");
    assertDeepEqual(ids(getVisibleTasks(demo(), "pending")), [4, 7], "режим pending");
    assertDeepEqual(ids(getVisibleTasks(demo(), "completed")), [1, 10], "режим completed");

    const tasks = demo();
    const visible = getVisibleTasks(tasks, "all");

    assert(visible !== tasks, "возвращается новый массив");
    assertDeepEqual(ids(tasks), [1, 4, 7, 10], "входной массив не изменился");
  });

  await check("Карточка содержит ровно три действия: toggle, edit, delete", () => {
    const card = createTaskElement({
      id: 4,
      title: "Подготовить модель задач",
      completed: false,
      priority: "high",
    });

    const buttons = [...card.querySelectorAll("button")];

    assertDeepEqual(
      buttons.map((button) => button.dataset.action),
      ["toggle", "edit", "delete"],
      "набор действий"
    );

    for (const button of buttons) {
      assertEqual(button.type, "button", `кнопка ${button.dataset.action} не отправляет форму`);
    }

    const editButton = card.querySelector('button[data-action="edit"]');
    const label = editButton.querySelector("span.action-label");

    assert(label !== null, "внутри кнопки edit есть span.action-label");
    assertEqual(label.textContent, "Изменить", "подпись кнопки edit");
    assertEqual(card.dataset.taskId, "4", "идентификатор задачи в data-атрибуте");
  });

  await check("Название задачи выводится как текст, а не как разметка", () => {
    const title = '<img src="x" onerror="window.__pr04 = true">';
    const card = createTaskElement({ id: 5, title, completed: false, priority: "low" });
    const heading = card.querySelector(".task-title");

    assertEqual(heading.textContent, title, "текст заголовка");
    assertEqual(heading.querySelectorAll("*").length, 0, "вложенных элементов нет");
    assertEqual(window.__pr04, undefined, "обработчик из строки не выполнился");
  });

  await check("Повторная отрисовка не дублирует карточки, пустые состояния различаются", () => {
    const { list, summary, message } = createSandbox();

    renderTaskList(list, demo());
    renderTaskList(list, demo());
    assertEqual(list.children.length, 4, "число карточек после двух отрисовок");

    renderSummary(summary, demo(), 2);
    assertEqual(statOf(summary, "total"), "4", "всего");
    assertEqual(statOf(summary, "completed"), "2", "выполнено");
    assertEqual(statOf(summary, "pending"), "2", "осталось");
    assertEqual(statOf(summary, "progress"), "50.0%", "прогресс");
    assertEqual(statOf(summary, "visible"), "2", "показано");

    renderEmptyState(message, 4, 2);
    assertEqual(message.hidden, true, "при видимых задачах сообщение скрыто");

    renderEmptyState(message, 4, 0);
    assertEqual(message.hidden, false, "сообщение фильтра показано");
    assertEqual(message.textContent, "Нет задач по выбранному фильтру.", "текст фильтра");

    renderEmptyState(message, 0, 0);
    assertEqual(message.textContent, "Список задач пуст.", "текст пустого списка");
  });

  // --- Форма создания и редактирования ---------------------------------------

  await check("Форма открывается в режиме создания", async () => {
    clearCheckKeys();

    const doc = await loadApp();

    assertEqual(doc.querySelector("#form-title").textContent, "Добавление задачи", "заголовок");
    assertEqual(doc.querySelector("#form-submit").textContent, "Добавить задачу", "подпись кнопки");
    assertEqual(doc.querySelector("#form-cancel").hidden, true, "кнопка отмены скрыта");
    assertEqual(doc.querySelector("#form-cancel").type, "button", "отмена не отправляет форму");
    assertEqual(doc.querySelector("#field-id").disabled, false, "поле id доступно");
    assertEqual(doc.querySelector("#field-id").value, "", "поле id пустое");
    assertEqual(doc.querySelector("#field-title").value, "", "поле названия пустое");
    assertDeepEqual(appIds(doc), [1, 4, 7, 10], "исходный список");
  });

  await check("Добавление задачи обновляет список и сводку", async () => {
    clearCheckKeys();

    const doc = await loadApp();

    fillForm(doc, { id: "20", title: "  Изучить localStorage  ", priority: "high" });
    submitForm(doc);

    assertDeepEqual(appIds(doc), [1, 4, 7, 10, 20], "идентификаторы после добавления");
    assertEqual(appStat(doc, "total"), "5", "всего");
    assertEqual(appStat(doc, "completed"), "2", "выполнено");
    assertEqual(appStat(doc, "pending"), "3", "осталось");
    assertEqual(appStat(doc, "progress"), "40.0%", "прогресс");

    const added = doc.querySelector('#task-list li[data-task-id="20"]');

    assertEqual(added.querySelector(".task-title").textContent, "Изучить localStorage", "название");
    assertEqual(added.querySelector(".task-status").textContent, "В работе", "статус новой задачи");
    assertEqual(added.querySelector(".task-priority").textContent, "Высокий", "приоритет");
    assertEqual(doc.querySelector("#field-title").value, "", "форма очищена после успеха");
    assertEqual(fieldError(doc, "id"), "", "сообщений об ошибках нет");
  });

  await check("Повторный идентификатор отклоняется с сообщением у поля id", async () => {
    clearCheckKeys();

    const doc = await loadApp();
    const beforeKeys = checkKeys();

    fillForm(doc, { id: "4", title: "Другая задача", priority: "low" });
    submitForm(doc);

    assertDeepEqual(appIds(doc), [1, 4, 7, 10], "список не изменился");
    assertEqual(appStat(doc, "total"), "4", "всего");
    assert(fieldError(doc, "id").length > 0, "ошибка выведена рядом с полем id");
    assertEqual(fieldError(doc, "title"), "", "поле названия не отмечено");
    assertEqual(doc.querySelector("#field-id").validity.customError, true, "customError установлен");
    assertDeepEqual(checkKeys(), beforeKeys, "отказ не создаёт запись в хранилище");
  });

  await check("Название из пробелов отклоняется прикладным правилом", async () => {
    clearCheckKeys();

    const doc = await loadApp();
    const titleField = doc.querySelector("#field-title");

    fillForm(doc, { id: "20", title: "   ", priority: "low" });
    assertEqual(titleField.validity.valueMissing, false, "required пропускает пробелы");

    submitForm(doc);

    assertDeepEqual(appIds(doc), [1, 4, 7, 10], "список не изменился");
    assert(fieldError(doc, "title").length > 0, "ошибка выведена рядом с полем названия");
    assertEqual(fieldError(doc, "id"), "", "поле id не отмечено");
    assertEqual(rawStored(), null, "запись в хранилище не создана");
  });

  await check("Кнопка «Изменить» переводит форму в режим редактирования", async () => {
    clearCheckKeys();

    const doc = await loadApp();
    const beforeKeys = checkKeys();

    clickAction(doc, 4, "edit");

    assertEqual(doc.querySelector("#field-id").value, "4", "id подставлен");
    assertEqual(doc.querySelector("#field-id").disabled, true, "поле id заблокировано");
    assertEqual(
      doc.querySelector("#field-title").value,
      "Подготовить модель задач",
      "название подставлено"
    );
    assertEqual(doc.querySelector("#field-priority").value, "high", "приоритет подставлен");
    assertEqual(doc.querySelector("#form-cancel").hidden, false, "кнопка отмены показана");
    assertEqual(
      doc.querySelector("#form-submit").textContent,
      "Сохранить изменения",
      "подпись кнопки"
    );

    const formData = new doc.defaultView.FormData(doc.querySelector("#task-form"));

    assertEqual(formData.has("id"), false, "отключённое поле не попадает в FormData");
    assertDeepEqual(checkKeys(), beforeKeys, "переход в режим редактирования не пишет в storage");
  });

  await check("Сохранение изменений не сбрасывает статус и не меняет id", async () => {
    clearCheckKeys();

    const doc = await loadApp();

    // Редактируется выполненная задача: completed должен сохраниться.
    clickAction(doc, 1, "edit");
    fillForm(doc, { title: "  Изучить функции и ссылки  ", priority: "low" });
    submitForm(doc);

    assertDeepEqual(appIds(doc), [1, 4, 7, 10], "порядок и состав не изменились");

    const card = doc.querySelector('#task-list li[data-task-id="1"]');

    assertEqual(card.querySelector(".task-title").textContent, "Изучить функции и ссылки", "название");
    assertEqual(card.querySelector(".task-status").textContent, "Выполнена", "статус сохранён");
    assertEqual(card.querySelector(".task-priority").textContent, "Низкий", "приоритет изменён");
    assertEqual(appStat(doc, "completed"), "2", "число выполненных не изменилось");
    assertEqual(doc.querySelector("#form-title").textContent, "Добавление задачи", "режим создания");
    assertEqual(doc.querySelector("#field-id").disabled, false, "поле id снова доступно");

    assertDeepEqual(
      storedTasks()[0],
      { id: 1, title: "Изучить функции и ссылки", completed: true, priority: "low" },
      "в хранилище записан изменённый список"
    );
  });

  await check("Отмена возвращает форму в режим создания без изменения данных", async () => {
    clearCheckKeys();

    const doc = await loadApp();

    clickAction(doc, 7, "edit");
    fillForm(doc, { title: "Черновое название", priority: "high" });
    doc.querySelector("#form-cancel").click();

    assertEqual(doc.querySelector("#form-title").textContent, "Добавление задачи", "заголовок");
    assertEqual(doc.querySelector("#field-id").value, "", "поля очищены");
    assertEqual(doc.querySelector("#field-id").disabled, false, "поле id доступно");
    assertEqual(doc.querySelector("#form-cancel").hidden, true, "кнопка отмены скрыта");

    const card = doc.querySelector('#task-list li[data-task-id="7"]');

    assertEqual(
      card.querySelector(".task-title").textContent,
      "Проверить методы массивов",
      "задача не изменилась"
    );
    assertEqual(rawStored(), null, "отмена не создаёт запись");
  });

  await check("Ошибка исправляемого поля очищается при вводе, остальные остаются", async () => {
    clearCheckKeys();

    const doc = await loadApp();

    fillForm(doc, { id: "4", title: "   ", priority: "low" });
    submitForm(doc);

    assert(fieldError(doc, "id").length > 0, "ошибка id выведена");
    assert(fieldError(doc, "title").length > 0, "ошибка названия выведена");

    typeInto(doc, "#field-title", "Корректное название");

    assertEqual(fieldError(doc, "title"), "", "ошибка исправляемого поля снята");
    assertEqual(doc.querySelector("#field-title").validity.customError, false, "customError снят");
    assert(fieldError(doc, "id").length > 0, "ошибка другого поля осталась видимой");
  });

  await check("Удаление редактируемой задачи возвращает форму в режим создания", async () => {
    clearCheckKeys();

    const doc = await loadApp();

    clickAction(doc, 7, "edit");
    assertEqual(doc.querySelector("#field-id").value, "7", "режим редактирования включён");

    clickAction(doc, 7, "delete");

    assertDeepEqual(appIds(doc), [1, 4, 10], "задача удалена");
    assertEqual(doc.querySelector("#form-title").textContent, "Добавление задачи", "режим создания");
    assertEqual(doc.querySelector("#field-id").disabled, false, "поле id доступно");
    assertEqual(doc.querySelector("#field-id").value, "", "поля очищены");
  });

  // --- Хранение --------------------------------------------------------------

  await check("Добавление записывается в оболочке версии 1", async () => {
    clearCheckKeys();

    const doc = await loadApp();

    assertEqual(rawStored(), null, "до операций запись отсутствует");

    fillForm(doc, { id: "20", title: "Изучить localStorage", priority: "high" });
    submitForm(doc);

    const envelope = JSON.parse(rawStored());

    assertDeepEqual(Object.keys(envelope).sort(), ["tasks", "version"], "состав оболочки");
    assertEqual(envelope.version, 1, "версия схемы");
    assertDeepEqual(ids(envelope.tasks), [1, 4, 7, 10, 20], "сохранённые идентификаторы");
    assertDeepEqual(
      envelope.tasks[4],
      { id: 20, title: "Изучить localStorage", completed: false, priority: "high" },
      "сохранённая задача"
    );
    assertDeepEqual(checkKeys(), [keyFor("demo")], "создан только ключ набора demo");
  });

  await check("Переключение статуса, редактирование и удаление сохраняются", async () => {
    clearCheckKeys();

    const doc = await loadApp();

    clickAction(doc, 7, "toggle");
    assertDeepEqual(
      storedTasks().map((task) => task.completed),
      [true, false, true, true],
      "статус после toggle"
    );

    clickAction(doc, 4, "edit");
    fillForm(doc, { title: "Подготовить форму задач", priority: "low" });
    submitForm(doc);
    assertDeepEqual(
      storedTasks()[1],
      { id: 4, title: "Подготовить форму задач", completed: false, priority: "low" },
      "запись после редактирования"
    );

    clickAction(doc, 1, "delete");
    assertDeepEqual(ids(storedTasks()), [4, 7, 10], "запись после удаления");
  });

  await check("Выбор фильтра не создаёт и не изменяет запись в хранилище", async () => {
    clearCheckKeys();

    const doc = await loadApp();

    clickFilter(doc, "pending");
    assertDeepEqual(appIds(doc), [4, 7], "видимые задачи");
    assertEqual(rawStored(), null, "фильтр не создал запись");
    assertDeepEqual(checkKeys(), [], "ключей проверок нет");

    clickAction(doc, 4, "toggle");

    const afterToggle = rawStored();

    assert(afterToggle !== null, "изменение статуса создало запись");

    clickFilter(doc, "completed");
    clickFilter(doc, "all");

    assertEqual(rawStored(), afterToggle, "смена фильтра не изменила запись");
  });

  await check("Корректная запись восстанавливается после перезагрузки", async () => {
    clearCheckKeys();

    const first = await loadApp();

    fillForm(first, { id: "20", title: "Изучить localStorage", priority: "high" });
    submitForm(first);
    clickAction(first, 7, "toggle");
    clickAction(first, 1, "delete");

    const expected = storedTasks();
    const second = await loadApp();

    assertDeepEqual(appIds(second), [4, 7, 10, 20], "список после перезагрузки");
    assertEqual(appStat(second, "total"), "4", "всего");
    assertEqual(appStat(second, "completed"), "2", "выполнено");
    assertEqual(appStat(second, "progress"), "50.0%", "прогресс");
    assertDeepEqual(storedTasks(), expected, "перезагрузка не перезаписала данные");
    assert(
      appStorageMessage(second).includes("localStorage"),
      "строка состояния сообщает о восстановлении из localStorage"
    );
    assertEqual(
      second.querySelector("#form-title").textContent,
      "Добавление задачи",
      "режим формы не сохраняется"
    );
  });

  await check("Повреждённая запись приводит к исходному набору и предупреждению", async () => {
    clearCheckKeys();
    window.localStorage.setItem(keyFor("demo"), "{broken-json");

    const doc = await loadApp();

    assertDeepEqual(appIds(doc), [1, 4, 7, 10], "загружен исходный набор");
    assertEqual(appStat(doc, "progress"), "50.0%", "прогресс исходного набора");
    assert(appStorageMessage(doc).length > 0, "показано предупреждение");
    assertEqual(rawStored(), "{broken-json", "повреждённая запись не удалена автоматически");

    clearCheckKeys();
    window.localStorage.setItem(keyFor("demo"), JSON.stringify({ version: 2, tasks: demo() }));

    const other = await loadApp();

    assertDeepEqual(appIds(other), [1, 4, 7, 10], "чужая версия схемы отклонена");
    assert(appStorageMessage(other).length > 0, "показано предупреждение о схеме");
  });

  await check("Сброс удаляет только текущий ключ и не создаёт его заново", async () => {
    clearCheckKeys();
    window.localStorage.setItem(`${CHECK_PREFIX}foreign`, "данные другой страницы");

    const doc = await loadApp();

    fillForm(doc, { id: "20", title: "Изучить localStorage", priority: "high" });
    submitForm(doc);
    clickFilter(doc, "completed");
    clickAction(doc, 10, "edit");

    assert(rawStored() !== null, "запись существует до сброса");

    clickReset(doc);

    assertEqual(rawStored(), null, "ключ набора удалён");
    assertEqual(
      window.localStorage.getItem(`${CHECK_PREFIX}foreign`),
      "данные другой страницы",
      "посторонний ключ сохранён"
    );
    assertDeepEqual(appIds(doc), [1, 4, 7, 10], "восстановлен исходный набор");
    assertEqual(appStat(doc, "visible"), "4", "фильтр вернулся к «Все»");
    assertEqual(
      doc.querySelector('#task-filters button[data-filter="all"]').getAttribute("aria-pressed"),
      "true",
      "активен фильтр «Все»"
    );
    assertEqual(doc.querySelector("#form-title").textContent, "Добавление задачи", "режим создания");

    clickFilter(doc, "pending");
    assertEqual(rawStored(), null, "после сброса ключ не появляется снова");

    window.localStorage.removeItem(`${CHECK_PREFIX}foreign`);
  });

  await check("Общий и индивидуальный наборы используют разные ключи", async () => {
    clearCheckKeys();

    const demoDoc = await loadApp("demo");

    fillForm(demoDoc, { id: "20", title: "Изучить localStorage", priority: "high" });
    submitForm(demoDoc);

    assertDeepEqual(checkKeys(), [keyFor("demo")], "создан ключ только общего набора");

    const variantDoc = await loadApp("variant");

    assertDeepEqual(appIds(variantDoc), [11, 23, 37, 41, 58, 64], "исходный набор варианта");
    assertEqual(rawStored("variant"), null, "ключ варианта ещё не создан");

    clickAction(variantDoc, 37, "delete");

    assertDeepEqual(ids(storedTasks("variant")), [11, 23, 41, 58, 64], "запись варианта");
    assertDeepEqual(ids(storedTasks("demo")), [1, 4, 7, 10, 20], "общий набор не изменился");

    const backToDemo = await loadApp("demo");

    assertDeepEqual(appIds(backToDemo), [1, 4, 7, 10, 20], "общий набор восстановлен без варианта");
  });

  // --- Сквозные сценарии -----------------------------------------------------

  await check("Контрольный сценарий раздела 6.8 проходит полностью", async () => {
    clearCheckKeys();

    let doc = await loadApp("demo");
    const state = () => [
      JSON.stringify(appIds(doc)),
      appStat(doc, "total"),
      appStat(doc, "completed"),
      appStat(doc, "pending"),
      appStat(doc, "progress"),
    ];

    assertDeepEqual(state(), ["[1,4,7,10]", "4", "2", "2", "50.0%"], "шаг 0");

    fillForm(doc, { id: "20", title: "Изучить localStorage", priority: "high" });
    submitForm(doc);
    assertDeepEqual(state(), ["[1,4,7,10,20]", "5", "2", "3", "40.0%"], "шаг 1");

    fillForm(doc, { id: "4", title: "Повторный идентификатор", priority: "low" });
    submitForm(doc);
    assertDeepEqual(state(), ["[1,4,7,10,20]", "5", "2", "3", "40.0%"], "шаг 2");
    assert(fieldError(doc, "id").length > 0, "шаг 2: ошибка около поля id");

    clickAction(doc, 4, "edit");
    fillForm(doc, { title: "Подготовить форму задач", priority: "low" });
    submitForm(doc);
    assertDeepEqual(state(), ["[1,4,7,10,20]", "5", "2", "3", "40.0%"], "шаг 3");
    assertEqual(storedTasks()[1].completed, false, "шаг 3: статус задачи 4 не изменился");

    clickAction(doc, 7, "toggle");
    assertDeepEqual(state(), ["[1,4,7,10,20]", "5", "3", "2", "60.0%"], "шаг 4");

    clickAction(doc, 1, "delete");
    assertDeepEqual(state(), ["[4,7,10,20]", "4", "2", "2", "50.0%"], "шаг 5");

    doc = await loadApp("demo");
    assertDeepEqual(state(), ["[4,7,10,20]", "4", "2", "2", "50.0%"], "шаг 6");

    clickReset(doc);
    assertDeepEqual(state(), ["[1,4,7,10]", "4", "2", "2", "50.0%"], "шаг 7");
    assertEqual(rawStored(), null, "шаг 7: ключ отсутствует");
  });

  await check("Фокус возвращается после изменения статуса и удаления", async () => {
    clearCheckKeys();

    const doc = await loadApp();

    clickAction(doc, 4, "toggle");

    const afterToggle = doc.activeElement;

    assertEqual(afterToggle.dataset.action, "toggle", "фокус на том же действии");
    assertEqual(afterToggle.closest("li").dataset.taskId, "4", "фокус на той же задаче");

    clickAction(doc, 4, "delete");

    const afterDelete = doc.activeElement;

    assertEqual(afterDelete.dataset.filter, "all", "после исчезновения карточки фокус на фильтре");
    assert(afterDelete.classList.contains("is-active"), "фокус на активном фильтре");
    assertEqual(appEmpty(doc), "", "список не пуст");
  });

  await check("Неизвестное действие и некорректный id не изменяют данные", async () => {
    clearCheckKeys();

    const doc = await loadApp();

    fillForm(doc, { id: "20", title: "Изучить localStorage", priority: "high" });
    submitForm(doc);

    const before = rawStored();

    const card = doc.querySelector('#task-list li[data-task-id="20"]');
    const unknown = doc.createElement("button");

    unknown.type = "button";
    unknown.dataset.action = "archive";
    card.querySelector(".task-actions").append(unknown);
    unknown.click();

    assertDeepEqual(appIds(doc), [1, 4, 7, 10, 20], "список не изменился");
    assertEqual(rawStored(), before, "запись не изменилась");
    assert(appMessage(doc).includes("archive"), "выведено понятное сообщение");

    const broken = doc.querySelector('#task-list li[data-task-id="10"]');

    broken.dataset.taskId = "не число";
    broken.querySelector('button[data-action="toggle"] .action-label').click();

    assertEqual(rawStored(), before, "некорректный id не привёл к записи");
    assert(appMessage(doc).length > 0, "выведено сообщение об ошибке");

    doc.querySelector("#task-list").addEventListener("click", () => {}, { once: true });
    doc.querySelector("#task-list").click();
    assertEqual(rawStored(), before, "клик вне кнопки игнорируется");
  });

  clearCheckKeys();

  const total = passedCount + failedNames.length;

  log("");
  log(`Всего: ${total}. Пройдено: ${passedCount}. Ошибок: ${failedNames.length}.`);
  summaryElement.textContent = `Всего: ${total}. Пройдено: ${passedCount}. Ошибок: ${failedNames.length}.`;
  window.checksResult = { total, passed: passedCount, failed: failedNames };
}

run();
