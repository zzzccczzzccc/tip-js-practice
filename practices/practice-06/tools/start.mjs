import { startApiServer } from "../api/server.mjs";
import { startStaticServer } from "./static-server.mjs";

const apiPort = Number(process.argv[2] ?? 5505);
const appPort = Number(process.argv[3] ?? 5506);

const api = await startApiServer(apiPort);
const app = await startStaticServer(appPort);

console.log(`Учебный API: ${api.baseUrl}`);
console.log(`Приложение: ${app.origin}/`);
console.log(`Проверки: ${app.origin}/checks.html`);
console.log("Остановить серверы: Ctrl+C");

function shutdown() {
  api.server.close();
  app.server.close();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
