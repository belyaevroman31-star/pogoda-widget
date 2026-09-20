/**
 * Weather CORS proxy for Cloudflare Workers.
 *
 * Решает одну задачу: снимает CORS-ограничение WeatherAPI.com
 * (и любых других API) для браузерного приложения.
 *
 * Деплой (бесплатно, ~5 минут, без карты):
 *   1. https://dash.cloudflare.com/sign-up  -> создать аккаунт
 *   2. Workers & Pages -> Create -> Worker
 *   3. Вставить содержимое этого файла -> Deploy
 *   4. Скопировать URL вида https://xxx.workers.dev
 *   5. Вставить его в настройках приложения в поле «Прокси»:
 *        https://xxx.workers.dev?url={url}
 */

const DEFAULT_TIMEOUT_MS = 15000;
const BASE_HTTP_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  // приватный заголовок приложения: прокси может быть использован только вами
  "X-Proxy-Source": "pogoda-widget"
};

function respondJson(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...BASE_HTTP_HEADERS
    }
  });
}

export default {
  async fetch(request) {
    // preflight для браузера
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: BASE_HTTP_HEADERS });
    }

    const url = new URL(request.url);
    const target = url.searchParams.get("url");

    if (!target) {
      return respondJson(400, {
        error: "Параметр 'url' обязателен. Например: /?url=https://api.weatherapi.com/v1/forecast.json?key=..."
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const upstream = await fetch(target, {
        method: request.method,
        headers: {
          "User-Agent": "pogoda-widget-proxy/1.0",
          "Accept": "application/json"
        },
        signal: controller.signal
      });
      const body = await upstream.arrayBuffer();
      const contentType = upstream.headers.get("Content-Type") || "application/json";
      return new Response(body, {
        status: upstream.status,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "max-age=60",
          ...BASE_HTTP_HEADERS
        }
      });
    } catch (err) {
      const aborted = err && err.name === "AbortError";
      return respondJson(504, {
        error: aborted ? "Таймаут запроса к API" : "Ошибка проксирования: " + (err.message || String(err))
      });
    } finally {
      clearTimeout(timeout);
    }
  }
};