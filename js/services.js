"use strict";

window.Services = (function () {
  const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
  const FROZEN_WMO = new Set([56, 57, 66, 67]);
  const FROZEN_WA = new Set([1072, 1168, 1171, 1204, 1207, 1235, 1237, 1249, 1252, 1261, 1264]);

  /* ---------- fetch with optional CORS proxy ---------- */

  function buildProxyUrl(proxyUrl, url) {
    if (!proxyUrl) return null;
    const p = String(proxyUrl).trim();
    if (!p) return null;
    if (p.indexOf("{url}") >= 0) return p.replace("{url}", encodeURIComponent(url));
    return p + (p.indexOf("?") >= 0 ? "&" : "?") + "url=" + encodeURIComponent(url);
  }

  async function fetchJson(url) {
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) {
      const e = new Error("HTTP " + r.status + " " + r.statusText);
      e.status = r.status;
      throw e;
    }
    return r.json();
  }

  async function fetchSmart(url) {
    const settings = window.AppSettings.load() || {};
    const mode = settings.proxyMode || "auto";
    const proxyUrl = buildProxyUrl(settings.proxyUrl || "", url);

    if (mode === "proxy") {
      if (proxyUrl) {
        try { return await fetchJson(proxyUrl); } catch (e) { throw e; }
      }
      return fetchJson(url);
    }

    if (mode === "direct") return fetchJson(url);

    // auto: direct first, then user proxy if configured
    try {
      return await fetchJson(url);
    } catch (directErr) {
      if (!proxyUrl) throw directErr;
      return fetchJson(proxyUrl);
    }
  }

  /* ---------- condition categories ---------- */

  function wmoCat(code) {
    if (code == null) return "cloud";
    if (code === 0) return "clear";
    if (code <= 3) return "cloud";
    if (code === 45 || code === 48) return "fog";
    if (code >= 51 && code <= 57) return "drizzle";
    if (code >= 61 && code <= 67) return "rain";
    if (code >= 71 && code <= 77) return "snow";
    if (code >= 80 && code <= 82) return "rain";
    if (code >= 85 && code <= 86) return "snow";
    if (code >= 95) return "thunder";
    return "cloud";
  }

  function owmCat(id) {
    if (id == null) return "cloud";
    if (id >= 200 && id <= 232) return "thunder";
    if (id >= 300 && id <= 321) return "drizzle";
    if (id === 511) return "rain";
    if (id >= 500 && id <= 531) return "rain";
    if (id >= 600 && id <= 622) return "snow";
    if (id === 741) return "fog";
    if (id === 701 || id === 721 || id === 762) return "fog";
    if (id === 800) return "clear";
    if (id >= 801 && id <= 804) return "cloud";
    return "cloud";
  }

  function waCat(code) {
    if (code == null) return "cloud";
    switch (code) {
      case 1000: return "clear";
      case 1003:
      case 1006:
      case 1009: return "cloud";
      case 1030:
      case 1135:
      case 1148: return "fog";
      case 1063:
      case 1150: case 1153:
      case 1180: case 1183: case 1186: case 1189: case 1192: case 1195:
      case 1198: case 1201:
      case 1240: case 1243: case 1246:
      case 1273: case 1276:
        return "rain";
      case 1066:
      case 1114:
      case 1117:
      case 1213: case 1216: case 1219: case 1222: case 1225:
      case 1237:
      case 1255: case 1258:
        return "snow";
      case 1204: case 1207:
      case 1249: case 1252:
        return "drizzle";
      case 1235:
      case 1261: case 1264:
        return "snow";
      case 1087:
      case 1279: case 1282:
        return "thunder";
      default:
        return "cloud";
    }
  }

  function flagsFrom(category, rainMm, snowCm, temp, code) {
    const rain = (rainMm || 0) > 0.06 ||
      category === "rain" || category === "drizzle" || category === "thunder";
    const snow = (snowCm || 0) > 0.03 || category === "snow" || category === "sleet";
    let frozen = false;
    if (code != null && (FROZEN_WMO.has(code) || FROZEN_WA.has(code))) frozen = true;
    if (!frozen && (category === "drizzle" || category === "rain" || category === "sleet") &&
        temp != null && temp <= 0.7) frozen = true;
    const fog = category === "fog";
    const thunder = category === "thunder";
    return { rain, snow, frozen, fog, thunder };
  }

  /* ---------- geocoding ---------- */

  async function geocode(query) {
    const url = GEOCODE_URL + "?name=" + encodeURIComponent(query) +
      "&count=6&language=ru&format=json";
    const j = await fetchJson(url);
    return (j.results || []).map((r) => ({
      name: r.name,
      region: r.admin1 || "",
      country: r.country || "",
      latitude: r.latitude,
      longitude: r.longitude,
      timezone: r.timezone || ""
    }));
  }

  async function reverseGeocode(lat, lon) {
    const url = "https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=" +
      lat + "&lon=" + lon + "&zoom=10";
    const j = await fetchJson(url);
    const a = j.address || {};
    const parts = [a.city || a.town || a.village || a.suburb, a.state || a.country].filter(Boolean);
    return {
      name: parts.join(", ") || (lat.toFixed(2) + ", " + lon.toFixed(2)),
      timezone: j.timezone || ""
    };
  }

  /* ---------- Open-Meteo (free, no key) ---------- */

  async function fetchOpenMeteo(lat, lon) {
    const p = new URLSearchParams({
      latitude: lat.toFixed(4),
      longitude: lon.toFixed(4),
      timezone: "auto",
      forecast_days: "2",
      current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility",
      hourly: "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,rain,showers,snowfall,weather_code,visibility,pressure_msl,wind_speed_10m,cloud_cover"
    });
    const j = await fetchSmart("https://api.open-meteo.com/v1/forecast?" + p.toString());
    const off = j.utc_offset_seconds || 0;
    const toEpoch = (localIso) =>
      Math.floor((Date.parse(localIso + "Z") - off * 1000) / 3600) * 3600;

    const c = j.current || {};
    const cur = {
      temp: c.temperature_2m,
      feelsLike: c.apparent_temperature,
      humidity: c.relative_humidity_2m,
      windKmh: c.wind_speed_10m,
      pressure: c.pressure_msl,
      vis: c.visibility,
      cloud: c.cloud_cover,
      precip: c.precipitation,
      code: c.weather_code,
      category: wmoCat(c.weather_code),
      isDay: c.is_day
    };

    const H = j.hourly || {};
    const hourly = [];
    for (let i = 0; i < (H.time || []).length; i++) {
      if (!H.time[i]) continue;
      const code = H.weather_code ? H.weather_code[i] : null;
      const cat = wmoCat(code);
      const rainMm = (H.rain ? H.rain[i] || 0 : 0) + (H.showers ? H.showers[i] || 0 : 0);
      const snowCm = H.snowfall ? H.snowfall[i] || 0 : 0;
      const temp = H.temperature_2m ? H.temperature_2m[i] : null;
      hourly.push({
        epochHour: toEpoch(H.time[i]),
        temp,
        feelsLike: H.apparent_temperature ? H.apparent_temperature[i] : null,
        humidity: H.relative_humidity_2m ? H.relative_humidity_2m[i] : null,
        wind: H.wind_speed_10m ? H.wind_speed_10m[i] : null,
        press: H.pressure_msl ? H.pressure_msl[i] : null,
        vis: H.visibility ? H.visibility[i] : null,
        cloud: H.cloud_cover ? H.cloud_cover[i] : null,
        rainMms: rainMm,
        snowCm,
        precip: H.precipitation ? H.precipitation[i] : null,
        prob: H.precipitation_probability ? H.precipitation_probability[i] : null,
        code,
        category: cat,
        flags: flagsFrom(cat, rainMm, snowCm, temp, code)
      });
    }
    return { source: "open-meteo", current: cur, hourly, utcOffset: off };
  }

  /* ---------- OpenWeatherMap (5-day / 3h, free) ---------- */

  async function fetchOpenWeather(lat, lon, key) {
    const common = "lat=" + lat + "&lon=" + lon + "&units=metric&appid=" + encodeURIComponent(key);
    const base = "https://api.openweathermap.org/data/2.5/";
    const [curJ, fcJ] = await Promise.all([
      fetchSmart(base + "weather?" + common),
      fetchSmart(base + "forecast?" + common + "&cnt=20")
    ]);

    const w = (curJ.weather && curJ.weather[0]) || {};
    const icon = curJ.weather && curJ.weather[0] && curJ.weather[0].icon || "";
    let precip = 0;
    if (curJ.rain && curJ.rain["1h"]) precip += curJ.rain["1h"];
    if (curJ.snow && curJ.snow["1h"]) precip += curJ.snow["1h"];
    const cur = {
      temp: curJ.main ? curJ.main.temp : null,
      feelsLike: curJ.main ? curJ.main.feels_like : null,
      humidity: curJ.main ? curJ.main.humidity : null,
      windKmh: curJ.wind && curJ.wind.speed != null ? curJ.wind.speed * 3.6 : null,
      pressure: curJ.main ? curJ.main.pressure : null,
      vis: curJ.visibility || null,
      cloud: curJ.clouds ? curJ.clouds.all : null,
      precip,
      code: w.id,
      category: owmCat(w.id),
      isDay: /d$/.test(icon) ? 1 : 0
    };

    const hourly = [];
    for (const f of fcJ.list || []) {
      const w2 = (f.weather && f.weather[0]) || {};
      const rain3h = (f.rain && f.rain["3h"]) || 0;
      const snow3h = (f.snow && f.snow["3h"]) || 0;
      const temp = f.main ? f.main.temp : null;
      const rainMm = rain3h / 3;
      const snowCm = snow3h / 3 / 0.7;
      const code = w2.id;
      const cat = owmCat(code);
      hourly.push({
        epochHour: Math.floor(f.dt / 3600) * 3600,
        temp,
        feelsLike: f.main ? f.main.feels_like : null,
        humidity: f.main ? f.main.humidity : null,
        wind: f.wind && f.wind.speed != null ? f.wind.speed * 3.6 : null,
        press: f.main ? f.main.pressure : null,
        vis: f.visibility || null,
        cloud: f.clouds ? f.clouds.all : null,
        rainMms: rainMm,
        snowCm,
        precip: rain3h / 3 + snow3h / 3,
        prob: f.pop != null ? f.pop * 100 : null,
        code,
        category: cat,
        flags: flagsFrom(cat, rainMm, snowCm, temp, code)
      });
    }
    return { source: "openweathermap", current: cur, hourly };
  }

  /* ---------- WeatherAPI.com ---------- */

  async function fetchWeatherAPI(lat, lon, key) {
    const url = "https://api.weatherapi.com/v1/forecast.json?key=" +
      encodeURIComponent(key) + "&q=" + lat + "," + lon + "&days=2&lang=ru";
    const j = await fetchSmart(url);

    const c = j.current || {};
    const cur = {
      temp: c.temp_c,
      feelsLike: c.feelslike_c,
      humidity: c.humidity,
      windKmh: c.wind_kph,
      pressure: c.pressure_mb,
      vis: c.vis_km != null ? c.vis_km * 1000 : null,
      cloud: c.cloud,
      precip: c.precip_mm,
      code: c.condition ? c.condition.code : null,
      category: waCat(c.condition ? c.condition.code : null),
      isDay: c.is_day
    };

    let offset = 0;
    const locEpoch = c.last_updated_epoch;
    const m = (c.localtime || "").match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2})/);
    if (locEpoch && m) {
      const parsedUtc = Date.parse(m[1].replace(" ", "T") + "Z");
      if (!isNaN(parsedUtc)) offset = Math.round((parsedUtc / 1000 - locEpoch) / 900) * 900;
    }

    const hourly = [];
    for (const d of (j.forecast && j.forecast.forecastday) || []) {
      for (const h of d.hour || []) {
        const iso = (h.time || "").replace(" ", "T");
        const ms = Date.parse(iso + "Z") - offset * 1000;
        if (isNaN(ms)) continue;
        const temp = h.temp_c;
        const snowCm = h.snow_cm || 0;
        const rainMm = h.precip_mm || 0;
        const code = h.condition ? h.condition.code : null;
        const cat = waCat(code);
        hourly.push({
          epochHour: Math.floor(ms / 3600) * 3600,
          temp,
          feelsLike: h.feelslike_c,
          humidity: h.humidity,
          wind: h.wind_kph,
          press: h.pressure_mb,
          vis: h.vis_km != null ? h.vis_km * 1000 : null,
          cloud: h.cloud,
          rainMms: rainMm,
          snowCm,
          precip: rainMm,
          prob: Math.max(h.chance_of_rain || 0, h.chance_of_snow || 0),
          code,
          category: cat,
          flags: flagsFrom(cat, rainMm, snowCm, temp, code)
        });
      }
    }
    return { source: "weatherapi", current: cur, hourly, utcOffset: offset };
  }

  /* ---------- orchestration ---------- */

  async function fetchAll(lat, lon, settings) {
    const jobs = [
      { name: "open-meteo", run: () => fetchOpenMeteo(lat, lon), required: true },
      { name: "openweathermap", run: () => {
          if (!settings.owmKey) throw new Error("Не задан API-ключ");
          return fetchOpenWeather(lat, lon, settings.owmKey);
        }, required: false },
      { name: "weatherapi", run: () => {
          if (!settings.waKey) throw new Error("Не задан API-ключ");
          return fetchWeatherAPI(lat, lon, settings.waKey);
        }, required: false }
    ];
    const results = { sources: [], errors: [] };
    await Promise.all(
      jobs.map((job) =>
        Promise.resolve()
          .then(() => job.run())
          .then((res) => { res.error = null; results.sources.push(res); })
          .catch((err) => {
            results.errors.push({ source: job.name, message: err.message || String(err), status: err.status });
          })
      )
    );
    return results;
  }

  return {
    geocode,
    reverseGeocode,
    fetchAll,
    fetchOpenMeteo,
    fetchOpenWeather,
    fetchWeatherAPI,
    flagsFrom
  };
})();