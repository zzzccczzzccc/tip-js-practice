// Задание 7. Сравнение последовательного ожидания и Promise.all на /debug/delay.
// Искусственные задержки не входят в итоговую реализацию loadInitialData.

const baseUrl = process.env.API_URL ?? "http://127.0.0.1:5505/api";
const DELAY_MS = 120;
const RUNS = 3;

async function delayOnce() {
  const started = Date.now();
  const response = await fetch(`${baseUrl}/debug/delay?ms=${DELAY_MS}`);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  await response.json();

  return Date.now() - started;
}

async function sequential() {
  const started = Date.now();

  await delayOnce();
  await delayOnce();

  return Date.now() - started;
}

async function parallel() {
  const started = Date.now();

  await Promise.all([delayOnce(), delayOnce()]);

  return Date.now() - started;
}

async function run() {
  console.log(`Адрес API: ${baseUrl}`);
  console.log(`Два запроса /debug/delay?ms=${DELAY_MS}, прогонов: ${RUNS}`);

  const sequentialTimes = [];
  const parallelTimes = [];

  for (let index = 1; index <= RUNS; index += 1) {
    const sequentialMs = await sequential();
    const parallelMs = await parallel();

    sequentialTimes.push(sequentialMs);
    parallelTimes.push(parallelMs);
    console.log(`  прогон ${index}: последовательно ${sequentialMs} мс, параллельно ${parallelMs} мс`);
  }

  const average = (values) => Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);

  console.log(`среднее последовательно: ${average(sequentialTimes)} мс`);
  console.log(`среднее параллельно:     ${average(parallelTimes)} мс`);
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
