// Эксперименты ПР4. Журнал наполняется только фактическими наблюдениями.
// Страница использует собственный ключ хранилища и не влияет на приложение.

const EXAMPLES_KEY = "tip-js-practice-04:examples";

const form = document.querySelector("#demo-form");
const idField = document.querySelector("#demo-id");
const titleField = document.querySelector("#demo-title");
const logElement = document.querySelector("#log");

let step = 0;

function log(lines) {
  step += 1;
  logElement.append(`${step}. ${lines.join("\n   ")}\n`);
}

// Опыт 1. Нативное ограничение проверяется до обработчика submit.
document.querySelector("#check-validity").addEventListener("click", () => {
  log([
    `title.value = ${JSON.stringify(titleField.value)}`,
    `title.validity.valid = ${titleField.validity.valid}`,
    `title.validity.valueMissing = ${titleField.validity.valueMissing}`,
    `title.validationMessage = ${JSON.stringify(titleField.validationMessage)}`,
    `form.checkValidity() = ${form.checkValidity()}`,
  ]);
});

// Опыт 2. required пропускает строку из пробелов: это задача прикладного правила.
document.querySelector("#spaces-title").addEventListener("click", () => {
  titleField.value = "   ";
  titleField.setCustomValidity("");

  const trimmed = titleField.value.trim();

  log([
    `title.value = ${JSON.stringify(titleField.value)}`,
    `title.validity.valid = ${titleField.validity.valid} (required выполнено)`,
    `title.value.trim().length = ${trimmed.length}`,
    `прикладное правило нарушено: ${trimmed.length === 0}`,
  ]);

  if (trimmed.length === 0) {
    titleField.setCustomValidity("Название не может состоять из пробелов.");
    log([
      "после setCustomValidity(...)",
      `title.validity.valid = ${titleField.validity.valid}`,
      `title.validity.customError = ${titleField.validity.customError}`,
      `form.reportValidity() = ${form.reportValidity()}`,
    ]);
  }
});

titleField.addEventListener("input", () => {
  titleField.setCustomValidity("");
});

// Опыт 3. FormData отдаёт строки; преобразование и нормализация выполняются явно.
form.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const rawId = formData.get("id");
  const rawTitle = formData.get("title");
  const rawPriority = formData.get("priority");

  log([
    "сработал обработчик submit",
    `event.defaultPrevented = ${event.defaultPrevented}`,
    `typeof rawId = ${typeof rawId}; rawId = ${JSON.stringify(rawId)}`,
    `Number(rawId) = ${Number(rawId)} (${typeof Number(rawId)})`,
    `Number("") = ${Number("")}`,
    `typeof rawTitle = ${typeof rawTitle}; rawTitle = ${JSON.stringify(rawTitle)}`,
    `rawTitle.trim() = ${JSON.stringify(rawTitle.trim())}`,
    `rawPriority = ${JSON.stringify(rawPriority)}`,
    `idField.disabled = ${idField.disabled}; formData.has("id") = ${formData.has("id")}`,
  ]);

  const payload = {
    version: 1,
    tasks: [
      {
        id: Number(rawId),
        title: rawTitle.trim(),
        completed: false,
        priority: rawPriority,
      },
    ],
  };

  const serialized = JSON.stringify(payload);

  window.localStorage.setItem(EXAMPLES_KEY, serialized);
  log(["значение записано в localStorage", `строка = ${serialized}`]);
});

// Опыт 4. getItem всегда возвращает строку или null.
document.querySelector("#read-stored").addEventListener("click", () => {
  const raw = window.localStorage.getItem(EXAMPLES_KEY);

  log([
    `typeof raw = ${typeof raw}`,
    `raw = ${JSON.stringify(raw)}`,
    `raw === null = ${raw === null}`,
  ]);

  if (raw === null) {
    return;
  }

  try {
    const value = JSON.parse(raw);

    log([
      `typeof JSON.parse(raw) = ${typeof value}`,
      `Array.isArray(value.tasks) = ${Array.isArray(value.tasks)}`,
      `value.tasks[0].id = ${value.tasks[0].id} (${typeof value.tasks[0].id})`,
    ]);
  } catch (error) {
    log([`JSON.parse выбросил ${error.name}: ${error.message}`]);
  }
});

// Опыт 5. Повреждённая строка: синтаксис JSON нарушен.
document.querySelector("#break-stored").addEventListener("click", () => {
  window.localStorage.setItem(EXAMPLES_KEY, "{broken-json");
  log([`в ключ ${EXAMPLES_KEY} записана строка "{broken-json"`]);
});

document.querySelector("#parse-unsafe").addEventListener("click", () => {
  const raw = window.localStorage.getItem(EXAMPLES_KEY);

  log([`разбор без try/catch, raw = ${JSON.stringify(raw)}`]);

  // Ошибка намеренно не перехватывается: она должна попасть в консоль браузера.
  const value = JSON.parse(raw);

  log([`разбор завершился без ошибки: ${JSON.stringify(value)}`]);
});

document.querySelector("#parse-safe").addEventListener("click", () => {
  const raw = window.localStorage.getItem(EXAMPLES_KEY);

  try {
    const value = JSON.parse(raw);

    log([`разбор успешен, typeof = ${typeof value}`]);
  } catch (error) {
    log([
      "разбор в try/catch",
      `перехвачено ${error.name}: ${error.message}`,
      "приложение может подставить исходный набор вместо аварийной остановки",
    ]);
  }
});

document.querySelector("#remove-stored").addEventListener("click", () => {
  window.localStorage.removeItem(EXAMPLES_KEY);
  log([
    `removeItem(${EXAMPLES_KEY}) выполнен`,
    `getItem вернул ${JSON.stringify(window.localStorage.getItem(EXAMPLES_KEY))}`,
  ]);
});

document.querySelector("#clear-log").addEventListener("click", () => {
  logElement.textContent = "";
  step = 0;
});
