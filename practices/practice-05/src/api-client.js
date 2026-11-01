// HTTP-транспортный клиент. Отвечает только за: URL, GET-запрос, статус,
// Content-Type, разбор JSON, ограничение времени и единый тип ошибки.
// Предметная область (задачи/категории) сюда не входит — ею занимается task-api.

/** Классификация ошибок по полю kind (не по тексту). */
export const API_ERROR_KINDS = ["http", "network", "invalid-response", "timeout", "aborted"];

export class ApiError extends Error {
  constructor(kind, message, details = {}) {
    super(message);

    this.name = "ApiError";
    this.kind = kind;
    this.url = details.url;
    this.status = details.status;
    this.code = details.code;
    this.details = details.details;
    this.cause = details.cause;
  }
}

const OMITTED_QUERY_VALUES = [undefined, null, ""];

/**
 * Формирует абсолютный URL из базового адреса, относительного пути и объекта параметров.
 * Значения false и 0 сохраняются; undefined, null и пустая строка пропускаются.
 */
export function buildUrl(baseUrl, path, query = {}) {
  if (typeof baseUrl !== "string" || baseUrl === "") {
    throw new TypeError("baseUrl должен быть непустой строкой.");
  }

  let base;

  try {
    base = new URL(baseUrl);
  } catch {
    throw new TypeError(`baseUrl должен быть абсолютным адресом: получено ${baseUrl}`);
  }

  if (base.protocol !== "http:" && base.protocol !== "https:") {
    throw new TypeError(`baseUrl должен использовать схему http или https: получено ${baseUrl}`);
  }

  if (base.search !== "" || base.hash !== "") {
    throw new TypeError("baseUrl не должен содержать query-параметры и hash.");
  }

  if (typeof path !== "string" || path.trim() === "") {
    throw new TypeError("path должен быть непустой строкой.");
  }

  if (query === null || typeof query !== "object" || Array.isArray(query)) {
    throw new TypeError("query должен быть обычным объектом.");
  }

  const basePath = base.pathname.replace(/\/+$/, "");
  const relativePath = path.replace(/^\/+/, "");
  const url = new URL(`${base.origin}${basePath}/${relativePath}`);

  for (const [name, value] of Object.entries(query)) {
    if (OMITTED_QUERY_VALUES.includes(value)) {
      continue;
    }

    // Кодирование выполняет URLSearchParams: ручная замена символов не используется.
    url.searchParams.set(name, String(value));
  }

  return url.toString();
}

function isResponseLike(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof value.status === "number" &&
    typeof value.ok === "boolean" &&
    value.headers !== undefined &&
    typeof value.json === "function"
  );
}

/** Отличает истёкший тайм-аут от внешней отмены по тому, какой сигнал сработал. */
function classifyAbort(error, url, timeoutSignal, externalSignal) {
  if (externalSignal !== undefined && externalSignal.aborted) {
    return new ApiError("aborted", "Запрос отменён вызывающим кодом.", { url, cause: error });
  }

  if (timeoutSignal !== undefined && timeoutSignal.aborted) {
    return new ApiError("timeout", "Истекло время ожидания ответа.", { url, cause: error });
  }

  return new ApiError("aborted", "Запрос прерван до получения ответа.", { url, cause: error });
}

export function createApiClient({ baseUrl, fetchFn = globalThis.fetch, timeoutMs = 2000 } = {}) {
  if (typeof baseUrl !== "string" || baseUrl === "") {
    throw new TypeError("createApiClient: baseUrl должен быть непустой строкой.");
  }

  // Проверка адреса выполняется один раз при создании клиента.
  buildUrl(baseUrl, "/");

  if (typeof fetchFn !== "function") {
    throw new TypeError("createApiClient: fetchFn должен быть функцией.");
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("createApiClient: timeoutMs должен быть положительным числом.");
  }

  async function requestJson(path, options = {}) {
    const { query = {}, signal, timeoutMs: requestTimeoutMs = timeoutMs } = options;

    if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) {
      throw new TypeError("requestJson: timeoutMs должен быть положительным числом.");
    }

    const url = buildUrl(baseUrl, path, query);

    if (signal !== undefined && signal.aborted) {
      throw new ApiError("aborted", "Запрос отменён до отправки.", { url, cause: signal.reason });
    }

    const timeoutSignal = AbortSignal.timeout(requestTimeoutMs);
    const requestSignal =
      signal === undefined ? timeoutSignal : AbortSignal.any([signal, timeoutSignal]);

    let response;

    // Сетевой этап перехватывается отдельно: иначе HTTP-ошибка получила бы kind "network".
    try {
      response = await fetchFn(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: requestSignal,
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      if (error.name === "AbortError" || error.name === "TimeoutError") {
        throw classifyAbort(error, url, timeoutSignal, signal);
      }

      throw new ApiError("network", `Не удалось выполнить запрос: ${error.message}`, {
        url,
        cause: error,
      });
    }

    if (!isResponseLike(response)) {
      throw new ApiError("invalid-response", "fetchFn вернул значение, не являющееся Response.", {
        url,
      });
    }

    const contentType = response.headers.get("content-type") ?? "";
    const isJson = contentType.includes("application/json");

    if (!response.ok) {
      let payload = null;

      if (isJson) {
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }
      }

      const apiError =
        payload !== null && typeof payload === "object" && typeof payload.error === "object"
          ? payload.error
          : null;

      throw new ApiError(
        "http",
        apiError?.message ?? `Сервер ответил статусом ${response.status}.`,
        {
          url,
          status: response.status,
          code: apiError?.code,
          details: apiError?.details,
        }
      );
    }

    if (response.status === 204) {
      return null;
    }

    if (!isJson) {
      throw new ApiError(
        "invalid-response",
        `Ожидался JSON, получен Content-Type: ${contentType === "" ? "отсутствует" : contentType}.`,
        { url, status: response.status }
      );
    }

    try {
      return await response.json();
    } catch (error) {
      throw new ApiError("invalid-response", `Не удалось разобрать JSON: ${error.message}`, {
        url,
        status: response.status,
        cause: error,
      });
    }
  }

  return { baseUrl, timeoutMs, requestJson };
}
