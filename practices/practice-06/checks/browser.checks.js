const logElement = document.querySelector("#checks-log");
const summaryElement = document.querySelector("#checks-summary");
const frame = document.querySelector("#app-frame");

let passed = 0;
const failed = [];

function log(line) {
  logElement.textContent += `${line}\n`;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: ожидалось ${JSON.stringify(expected)}, получено ${JSON.stringify(actual)}`);
  }
}

async function check(name, body) {
  try {
    await body();
    passed += 1;
    log(`OK   ${name}`);
  } catch (error) {
    failed.push(name);
    log(`FAIL ${name}`);
    log(`     ${String(error.message).split("\n")[0]}`);
  }
}

function loadApp(search = "") {
  return new Promise((resolve, reject) => {
    const url = new URL("../index.html", import.meta.url);

    url.search = search;
    const timer = setTimeout(() => reject(new Error("приложение не загрузилось")), 8000);

    frame.addEventListener(
      "load",
      () => {
        setTimeout(async () => {
          try {
            const win = frame.contentWindow;

            if (win.practice06?.ready) {
              await win.practice06.ready;
            }

            clearTimeout(timer);
            resolve(win);
          } catch (error) {
            clearTimeout(timer);
            resolve(frame.contentWindow);
          }
        }, 80);
      },
      { once: true }
    );

    frame.src = url.toString();
  });
}

const ids = (doc) =>
  [...doc.querySelectorAll("#task-list li[data-task-id]")].map((card) => Number(card.dataset.taskId));

async function reset(win) {
  await win.practice06.controller.resetData();
}

async function run() {
  await check("Адрес API показан в шапке", async () => {
    const win = await loadApp();

    assert(win.document.querySelector("#api-url").textContent.includes("5505/api"), "адрес API");
  });

  await check("Первая загрузка показывает исходные 12 задач", async () => {
    const win = await loadApp();

    await reset(win);
    assertEqual(ids(win.document).length, 12, "число карточек");
    assertEqual(win.document.querySelector("#list-status").textContent, "", "состояние ready");
  });

  await check("Категории появляются в форме", async () => {
    const win = await loadApp();
    const options = [...win.document.querySelector("#field-category").options].map((item) => item.textContent);

    assert(options.includes("Проект"), "категория Проект");
    assert(options.includes("Учёба"), "категория Учёба");
  });

  await check("Карточка содержит toggle, edit, delete и безопасный заголовок", async () => {
    const win = await loadApp();
    const card = win.document.querySelector('#task-list li[data-task-id="4"]');
    const actions = [...card.querySelectorAll("button")].map((button) => button.dataset.action);

    assertEqual(JSON.stringify(actions), JSON.stringify(["toggle", "edit", "delete"]), "действия");
    assertEqual(card.querySelector(".task-title").textContent, "Подготовить модель задач", "название");
    assertEqual(card.querySelector(".task-category").textContent, "Проект", "категория");
  });

  await check("Фильтр categoryId=2 оставляет шесть задач варианта", async () => {
    const win = await loadApp("?dataset=variant");

    await reset(win);
    await win.practice06.controller.applyFilters({ categoryId: 2 });
    assertEqual(JSON.stringify(ids(win.document)), JSON.stringify([4, 16, 22, 25, 28, 34]), "id варианта");
  });

  await check("Создание задачи добавляет карточку после повторного GET", async () => {
    const win = await loadApp();

    await reset(win);
    await win.practice06.controller.submit({
      title: "Изучить fetch",
      priority: "high",
      categoryId: 2,
    });

    assert(ids(win.document).includes(35), "появился id 35");
    assertEqual(
      win.document.querySelector('#task-list li[data-task-id="35"] .task-status').textContent,
      "В работе",
      "статус новой"
    );
  });

  await check("Невалидная форма не отправляет создание", async () => {
    const win = await loadApp();

    await reset(win);
    const before = ids(win.document).length;

    await win.practice06.controller.submit({ title: "   ", priority: "high", categoryId: 2 });
    assertEqual(ids(win.document).length, before, "список не изменился");
    assert(
      win.document.querySelector('[data-error-for="title"]').textContent.length > 0,
      "ошибка названия"
    );
  });

  await check("Редактирование не сбрасывает completed", async () => {
    const win = await loadApp();

    await reset(win);
    win.practice06.controller.beginEdit(1);
    await win.practice06.controller.submit({
      title: "Изучить функции подробно",
      priority: "medium",
      categoryId: 1,
    });

    const card = win.document.querySelector('#task-list li[data-task-id="1"]');

    assertEqual(card.querySelector(".task-status").textContent, "Выполнена", "статус сохранён");
    assertEqual(card.querySelector(".task-title").textContent, "Изучить функции подробно", "название");
  });

  await check("Переключение статуса обновляет карточку", async () => {
    const win = await loadApp();

    await reset(win);
    await win.practice06.controller.toggleTask(7);

    assertEqual(
      win.document.querySelector('#task-list li[data-task-id="7"] .task-status').textContent,
      "Выполнена",
      "статус"
    );
  });

  await check("Удаление убирает карточку", async () => {
    const win = await loadApp();

    await reset(win);
    await win.practice06.controller.deleteTask(10);
    assertEqual(ids(win.document).includes(10), false, "id 10 отсутствует");
  });

  await check("Пустой фильтр показывает состояние empty", async () => {
    const win = await loadApp();

    await reset(win);
    await win.practice06.controller.applyFilters({ q: "такогоназваниянетzzz" });
    assertEqual(ids(win.document).length, 0, "карточек нет");
    assert(
      win.document.querySelector("#list-status").textContent.includes("Нет задач"),
      "сообщение empty"
    );
  });

  await check("Название выводится как текст, а не HTML", async () => {
    const win = await loadApp();

    await reset(win);
    await win.practice06.controller.submit({
      title: "<img src=x onerror=window.__xss=1>",
      priority: "low",
      categoryId: 3,
    });

    const card = [...win.document.querySelectorAll(".task-title")].find((item) =>
      item.textContent.includes("<img")
    );

    assert(card !== undefined, "карточка с угловыми скобками");
    assertEqual(card.querySelectorAll("*").length, 0, "вложенных элементов нет");
    assertEqual(win.__xss, undefined, "обработчик не выполнился");
  });

  await check("Восстановление набора возвращает 12 задач", async () => {
    const win = await loadApp();

    await win.practice06.controller.deleteTask(1);
    await win.practice06.controller.resetData();
    assertEqual(ids(win.document).length, 12, "после reset");
  });

  await check("Длительность запроса выводится без изменения API", async () => {
    const win = await loadApp();
    const text = win.document.querySelector("#request-duration").textContent;

    assert(text.includes("мс"), `ожидалась длительность, получено ${text}`);
  });

  const total = passed + failed.length;

  log("");
  log(`Всего: ${total}. Пройдено: ${passed}. Ошибок: ${failed.length}.`);
  summaryElement.textContent = `Всего: ${total}. Пройдено: ${passed}. Ошибок: ${failed.length}.`;
  window.checksResult = { total, passed, failed };
}

run();
