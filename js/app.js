"use strict";

(function () {
  const $ = (id) => document.getElementById(id);
  const pad2 = (n) => String(n).padStart(2, "0");
  let settings = window.AppSettings.load();
  let autoTimer = null;
  let suggestTimer = null;

  /* ---------- geolocation ---------- */

  function geolocate(andSave) {
    if (!("geolocation" in navigator)) {
      UI.showStatus("Геолокация недоступна в этом браузере — укажите город в настройках.", "warn");
      return;
    }
    UI.showStatus("Определяю местоположение…", "info");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        settings.latitude = pos.coords.latitude;
        settings.longitude = pos.coords.longitude;
        settings.city = "";
        const label = {
          name: "Моё местоположение",
          timezone: ""
        };
        try {
          const rev = await Services.reverseGeocode(pos.coords.latitude, pos.coords.longitude);
          label.name = rev.name;
          label.timezone = rev.timezone;
        } catch (e) { /* keep default */ }
        if (label.name !== "Моё местоположение" && label.name) settings.city = label.name;
        settings.timezone = label.timezone;
        UI.setCity(label.name);
        window.AppSettings.save(settings);
        if (andSave) UI.fillSettings(settings);
        refresh();
      },
      (err) => {
        UI.showStatus("Не удалось получить геолокацию: " + err.message + " — укажите город в настройках.", "warn");
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }

  /* ---------- fetch + render ---------- */

  async function refresh() {
    if (settings.latitude == null || settings.longitude == null) {
      UI.showStatus("Укажите город в настройках или разрешите геолокацию.", "warn");
      return;
    }
    UI.showLoading(true);
    UI.showStatus("Обновляю данные из сервисов…", "info");
    try {
      const res = await Services.fetchAll(settings.latitude, settings.longitude, settings);
      if (!res.sources.length) {
        UI.showStatus(
          "Не удалось получить данные ни от одного сервиса: " +
          res.errors.map((e) => e.message).slice(0, 2).join("; "),
          "err"
        );
        UI.showLoading(false);
        return;
      }

      const now = new Date();
      const withCurrent = res.sources.filter((s) => s.current);
      const cur = Average.averageCurrent(withCurrent);
      const hourly = Average.averageHourly(res.sources);
      const warns = Warn.compute(cur, hourly, now, settings.warnHorizonHours);

      UI.setCity(settings.city || "Моё местоположение");
      UI.renderCurrent(cur);
      UI.renderHourly(hourly, now);
      UI.renderWarnings(warns);
      UI.renderSources(res.sources, res.errors, cur);
      UI.setUpdated("Обновлено в " + pad2(now.getHours()) + ":" + pad2(now.getMinutes()));

      if (res.errors.length) {
        UI.showStatus(
          "Частично доступно: " + res.errors.map((e) => e.message).join("; "),
          "warn"
        );
      } else {
        UI.showStatus("", "");
      }
    } catch (e) {
      console.error("refresh failed", e);
      UI.showStatus("Ошибка: " + (e && (e.stack || e.message) || e), "err");
    } finally {
      UI.showLoading(false);
    }
  }

  /* ---------- city autocomplete ---------- */

  function debouncedSuggest(q) {
    clearTimeout(suggestTimer);
    if (q.trim().length < 2) { UI.clearSuggestions(); return; }
    suggestTimer = setTimeout(async () => {
      try {
        const items = await Services.geocode(q.trim());
        UI.showSuggestions(items, pickCity);
      } catch (e) {
        UI.clearSuggestions();
      }
    }, 350);
  }

  function pickCity(it) {
    settings.city = [it.name, it.region].filter(Boolean).join(", ");
    settings.latitude = it.latitude;
    settings.longitude = it.longitude;
    settings.timezone = it.timezone || "";
    window.AppSettings.save(settings);
    UI.fillSettings(settings);
    UI.clearSuggestions();
    UI.closeModal();
    UI.setCity(settings.city);
    refresh();
  }

  /* ---------- bindings ---------- */

  function bind() {
    $("btnRefresh").addEventListener("click", refresh);
    $("btnSettings").addEventListener("click", () => {
      UI.fillSettings(settings);
      UI.openModal();
    });
    $("btnCloseSettings").addEventListener("click", () => UI.closeModal());
    $("btnLocation").addEventListener("click", () => geolocate(false));
    $("btnUseGeo").addEventListener("click", () => geolocate(true));

    $("btnShare").addEventListener("click", () => UI.openShare());
    $("btnCloseShare").addEventListener("click", () => UI.closeShare());
    $("shareModal").addEventListener("click", (e) => {
      if (e.target.id === "shareModal") UI.closeShare();
    });
    $("btnCopyLink").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(location.href);
        $("btnCopyLink").textContent = "✓ Скопировано";
        setTimeout(() => { $("btnCopyLink").textContent = "🔗 Скопировать ссылку"; }, 2000);
      } catch (e) {
        UI.showStatus("Не удалось скопировать: " + e.message, "err");
      }
    });
    $("btnShareNative").addEventListener("click", async () => {
      if (navigator.share) {
        try {
          await navigator.share({
            title: "Погода — среднее по 3 сервисам",
            text: "Мой погодный виджет с радаром осадков и предупреждениями",
            url: location.href
          });
        } catch (e) { /* user closed */ }
      } else {
        UI.showStatus("На этом устройстве нет системного меню «Поделиться» — используйте QR-код или копирование.", "warn");
      }
    });
    $("btnTestProxy").addEventListener("click", async () => {
      const pu = $("proxyUrl").value.trim();
      if (!pu) { UI.showStatus("Сначала укажите URL прокси.", "warn"); return; }
      UI.showStatus("Проверяю прокси…", "info");
      const probe = "https://api.weatherapi.com/v1/current.json?key=probe&q=55.75,37.62";
      const target = pu.indexOf("{url}") >= 0
        ? pu.replace("{url}", encodeURIComponent(probe))
        : pu + (pu.indexOf("?") >= 0 ? "&" : "?") + "url=" + encodeURIComponent(probe);
      try {
        const r = await fetch(target, { headers: { Accept: "application/json" } });
        const code = r.status;
        if (code === 401 || code === 200) {
          UI.showStatus("✓ Прокси работает (ответ HTTP " + code + "; 401 — просто нет ключа).");
        } else {
          UI.showStatus("Прокси отвечает HTTP " + code + ".", "warn");
        }
      } catch (e) {
        UI.showStatus("Прокси не отвечает: " + e.message, "err");
      }
    });

    $("settingsModal").addEventListener("click", (e) => {
      if (e.target.id === "settingsModal") UI.closeModal();
    });

    $("cityInput").addEventListener("input", (e) => debouncedSuggest(e.target.value));
    $("cityInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") e.preventDefault();
    });
    document.addEventListener("click", (e) => {
      if (!$("cityInput").contains(e.target)) UI.clearSuggestions();
    });

    $("settingsForm").addEventListener("submit", (e) => {
      e.preventDefault();
      settings.owmKey = $("owmKey").value.trim();
      settings.waKey = $("waKey").value.trim();
      settings.proxyUrl = $("proxyUrl").value.trim();
      settings.proxyMode = $("proxyMode").value;
      settings.warnHorizonHours = parseInt($("warnHorizon").value, 10) || 36;
      const cityQ = $("cityInput").value.trim();
      if (cityQ && (settings.latitude == null || cityQ.toLowerCase() !== (settings.city || "").toLowerCase())) {
        Services.geocode(cityQ).then((items) => {
          if (items.length) {
            pickCity(items[0]);
          } else {
            UI.showStatus("Город «" + cityQ + "» не найден.", "warn");
            window.AppSettings.save(settings);
            UI.closeModal();
          }
        }).catch(() => {
          window.AppSettings.save(settings);
          UI.closeModal();
        });
      } else {
        window.AppSettings.save(settings);
        UI.closeModal();
        refresh();
      }
    });
  }

  function init() {
    UI.setCity(settings.city || "Моё местоположение");
    if (settings.latitude == null || settings.longitude == null) {
      geolocate(false);
    } else {
      refresh();
    }
    autoTimer = setInterval(refresh, window.AppConfig.refreshMinutes * 60000);

    if ("serviceWorker" in navigator && /^https?:/.test(location.protocol)) {
      navigator.serviceWorker.register("./sw.js").catch(() => { /* offline optional */ });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    bind();
    init();
  });
})();