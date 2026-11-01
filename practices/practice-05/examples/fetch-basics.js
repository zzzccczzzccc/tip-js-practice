// Задание 3. Наблюдение за объектом Response: статус, ok, Content-Type и форма тела.
// Этот файл служит для наблюдения и не переносится целиком в рабочие модули.

const baseUrl = process.env.API_URL ?? "http://127.0.0.1:5505/api";

async function look(label, path) {
  const url = `${baseUrl}${path}`;

  console.log(`\n== ${label}`);
  console.log(`   ${url}`);

  let response;

  try {
    response = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (error) {
    // Сетевой отказ: ответа нет вообще, поэтому проверять статус бессмысленно.
    console.log(`   запрос отклонён: ${error.name}: ${error.message}`);
    console.log("   это сетевая ошибка, а не HTTP-ответ");

    return;
  }

  const contentType = response.headers.get("content-type") ?? "(нет)";

  console.log(`   status = ${response.status} ${response.statusText}`);
  console.log(`   response.ok = ${response.ok}`);
  console.log(`   content-type = ${contentType}`);

  if (!contentType.includes("application/json")) {
    const text = await response.text();

    console.log(`   тело как текст: ${JSON.stringify(text.slice(0, 60))}`);

    return;
  }

  try {
    const payload = await response.json();
    const keys = payload === null ? [] : Object.keys(payload);

    console.log(`   ключи тела: ${JSON.stringify(keys)}`);

    if (Array.isArray(payload.data)) {
      console.log(`   data — массив длины ${payload.data.length}, meta.total = ${payload.meta?.total}`);
    } else if (payload.data !== undefined) {
      console.log(`   data — объект: ${JSON.stringify(payload.data)}`);
    }

    if (payload.error !== undefined) {
      console.log(`   error.code = ${payload.error.code}`);
      console.log(`   error.message = ${payload.error.message}`);
    }
  } catch (error) {
    // Успешный статус не гарантирует корректного JSON.
    console.log(`   JSON.parse не удался: ${error.name}: ${error.message}`);
  }
}

async function run() {
  console.log(`Адрес API: ${baseUrl}`);

  await look("Состояние сервиса", "/health");
  await look("Все задачи", "/tasks");
  await look("Фильтры: невыполненные с высоким приоритетом", "/tasks?completed=false&priority=high");
  await look("Существующая задача", "/tasks/25");
  await look("Отсутствующая задача", "/tasks/999");
  await look("Неизвестный параметр запроса", "/tasks?unknown=1");
  await look("Все категории", "/categories");
  await look("Отладка: JSON-ошибка сервиса", "/debug/error");
  await look("Отладка: повреждённый JSON при статусе 200", "/debug/invalid-json");
  await look("Отладка: текст вместо JSON", "/debug/text");
}

run();
