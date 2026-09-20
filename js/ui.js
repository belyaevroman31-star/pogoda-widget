"use strict";

window.UI = (function () {
  const $ = (id) => document.getElementById(id);
  const COND_TEXT = {
    clear: "Ясно",
    cloud: "Облачно",
    fog: "Туман",
    drizzle: "Морось",
    rain: "Дождь",
    snow: "Снег",
    sleet: "Мокрый снег",
    thunder: "Гроза"
  };
  const ICON = {
    clear: "☀️",
    cloud: "☁️",
    fog: "🌫️",
    drizzle: "🌦️",
    rain: "🌧️",
    snow: "🌨️",
    sleet: "🌧️",
    thunder: "⛈️"
  };
  const pad2 = (n) => String(n).padStart(2, "0");
  const WD = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

  function fmtTemp(v) {
    if (v == null || !isFinite(v)) return "—";
    return (v > 0 ? "+" : "") + Math.round(v) + "°";
  }

  function fmtVis(v) {
    if (v == null) return "—";
    return v >= 1000 ? (Math.round(v / 100) / 10).toFixed(1) + " км" : Math.round(v) + " м";
  }

  function fmtWind(v) {
    if (v == null) return "—";
    return Math.round(v) + " км/ч";
  }

  function fmtPrecip(v) {
    if (v == null || v <= 0.05) return "нет";
    return v.toFixed(1) + " мм/ч";
  }

  function iconForCat(cat, isDay) {
    if (cat === "clear") return isDay ? "☀️" : "🌙";
    if (cat === "cloud") return isDay ? "⛅" : "☁️";
    return ICON[cat] || "☁️";
  }

  function hourlyIcon(h) {
    if (h.thunderCount * 2 > h.n) return "⛈️";
    if (h.snowCount * 2 > h.n) return "🌨️";
    if (h.rainCount * 2 > h.n) return "🌧️";
    if (h.fogCount >= 1) return "🌫️";
    if (h.rainCount >= 1) return "🌦️";
    const hh = h.date.getHours();
    const day = hh >= 6 && hh < 20;
    return day ? (h.cloud != null && h.cloud > 50 ? "☁️" : "☀️") : "🌙";
  }

  function setUpdated(text) {
    $("updatedAt").textContent = text;
  }

  function setCity(text) {
    $("cityName").textContent = text || "—";
  }

  function showStatus(message, type) {
    const el = $("statusBar");
    if (!message) { el.hidden = true; el.className = "status"; return; }
    el.hidden = false;
    el.textContent = message;
    el.className = "status " + (type || "info");
  }

  function renderWarnings(list) {
    const box = $("warnings");
    box.innerHTML = "";
    if (!list.length) { box.hidden = true; return; }
    box.hidden = false;
    for (const w of list) {
      const div = document.createElement("div");
      div.className = "warn " + w.color + (w.active ? " active" : "");
      div.innerHTML =
        '<span class="warn-icon">' + w.icon + '</span>' +
        '<div class="warn-body"><div class="warn-title">' + w.title +
        (w.active ? ' <span class="badge">сейчас</span>' : "") +
        '</div><div class="warn-text">' + w.text + "</div></div>";
      box.appendChild(div);
    }
  }

  function renderCurrent(cur) {
    $("currentCard").classList.remove("hidden");
    $("curTemp").textContent = cur.temp != null ? Math.round(cur.temp) : "—";
    $("curCond").textContent = COND_TEXT[cur.category] || "—";
    $("curIcon").textContent = iconForCat(cur.category, cur.isDay);
    $("curFeels").textContent = "ощущается " + fmtTemp(cur.feelsLike);
    $("srcCount").textContent = cur.contrib;
    $("stHum").textContent = cur.humidity != null ? Math.round(cur.humidity) + " %" : "—";
    $("stWind").textContent = fmtWind(cur.windKmh);
    $("stPres").textContent = cur.pressure != null ? Math.round(cur.pressure) + " гПа" : "—";
    $("stVis").textContent = fmtVis(cur.vis);
    $("stCloud").textContent = cur.cloud != null ? Math.round(cur.cloud) + " %" : "—";
    $("stPrec").textContent = fmtPrecip(cur.precip);
    document.title = cur.temp != null
      ? (Math.round(cur.temp) + "° " + (COND_TEXT[cur.category] || "") + " · Погода")
      : "Погода";
  }

  function renderHourly(hourly, now) {
    const card = $("forecastCard");
    const scroll = $("hourlyScroll");
    const nowMs = now.getTime();
    const futureBuckets = hourly.filter((h) => h.date.getTime() > nowMs - 1000);

    if (!futureBuckets.length) { card.classList.add("hidden"); return; }
    card.classList.remove("hidden");
    scroll.innerHTML = "";

    for (const h of futureBuckets) {
      const cur = Math.abs(h.date.getTime() - nowMs) < 3600000;
      const item = document.createElement("div");
      item.className = "hour" + (cur ? " now" : "");
      const dateLine = (h.date.getHours() === 0)
        ? h.date.getDate() + " " + WD[h.date.getDay()]
        : pad2(h.date.getHours());
      item.innerHTML =
        '<div class="h-time">' + (cur ? "сейчас" : dateLine) + "</div>" +
        '<div class="h-icon">' + hourlyIcon(h) + "</div>" +
        '<div class="h-temp">' + fmtTemp(h.temp) + "</div>" +
(h.prob != null && h.prob >= 5
          ? '<div class="h-prob">💧' + Math.round(h.prob) + "%</div>"
          : '<div class="h-prob empty"></div>');
      scroll.appendChild(item);
    }
  }

  function renderSources(sources, errors, avgCur) {
    const card = $("sourcesCard");
    const list = $("sourcesList");
    card.classList.remove("hidden");
    list.innerHTML = "";

    for (const name of window.AppConfig.serviceOrder) {
      const src = sources.find((s) => s.source === name);
      const err = errors.find((e) => e.source === name);
      const cfg = window.AppSettings.load();
      const needsKey = name === "openweathermap" || name === "weatherapi";
      const keySet = needsKey ? (name === "openweathermap" ? cfg.owmKey : cfg.waKey) : null;

      const row = document.createElement("div");
      row.className = "src-row hidden";
      const nameEl = document.createElement("div");
      nameEl.className = "src-name";
      const label = window.AppConfig.serviceNames[name] || name;

      if (src) {
        const keyText = keySet ? "" : " (без ключа)";
        const diff = src.current && avgCur.temp != null && src.current.temp != null
          ? (src.current.temp - avgCur.temp)
          : null;
        const diffText = diff != null && Math.abs(diff) >= 0.05
          ? ' <span class="src-diff">' + (diff >= 0 ? "+" : "−") + Math.abs(diff).toFixed(1) + "°</span>"
          : ' <span class="src-diff on">±0°</span>';
        nameEl.innerHTML =
          '<span class="dot ok"></span> ' + label + keyText + diffText;
        row.appendChild(nameEl);
        const tempEl = document.createElement("div");
        tempEl.className = "src-temp";
        tempEl.textContent = src.current && src.current.temp != null
          ? Math.round(src.current.temp) + "°" : "—";
        row.appendChild(tempEl);
      } else if (err) {
        nameEl.innerHTML =
          '<span class="dot err"></span> ' + label;
        row.appendChild(nameEl);
        const tempEl = document.createElement("div");
        tempEl.className = "src-temp err";
        tempEl.textContent = "ошибка";
        row.appendChild(tempEl);
        const msg = document.createElement("div");
        msg.className = "src-err";
        msg.textContent = err.message + (err.status ? " (" + err.status + ")" : "");
        row.appendChild(msg);
      }
      row.classList.remove("hidden");
      list.appendChild(row);
    }
  }

  function renderEmpty() {
    $("warnings").hidden = true;
    ["currentCard", "forecastCard", "sourcesCard"].forEach((id) => $(id).classList.add("hidden"));
  }

  function showLoading(on) {
    document.body.classList.toggle("loading", on);
  }

  function openModal() {
    $("settingsModal").hidden = false;
    document.body.classList.add("modal-open");
  }

  function closeModal() {
    $("settingsModal").hidden = true;
    document.body.classList.remove("modal-open");
  }

  function fillSettings(s) {
    $("cityInput").value = s.city;
    $("owmKey").value = s.owmKey;
    $("waKey").value = s.waKey;
    $("proxyUrl").value = s.proxyUrl || "";
    $("proxyMode").value = s.proxyMode || "auto";
    $("warnHorizon").value = String(s.warnHorizonHours || 36);
  }

  function openShare(url) {
    const link = $("shareLink");
    link.textContent = url || location.href;
    const target = url || location.href;
    $("qrImg").src = "https://api.qrserver.com/v1/create-qr-code/?size=640x640&margin=8&qzone=1&data=" +
      encodeURIComponent(target);
    $("qrImg").alt = "QR-код: " + target;
    $("shareModal").hidden = false;
    document.body.classList.add("modal-open");
  }

  function closeShare() {
    $("shareModal").hidden = true;
    document.body.classList.remove("modal-open");
  }

  function clearSuggestions() {
    $("citySuggest").innerHTML = "";
  }

  function showSuggestions(items, onPick) {
    const ul = $("citySuggest");
    ul.innerHTML = "";
    if (!items.length) { ul.innerHTML = '<li class="empty">Ничего не найдено</li>'; return; }
    for (const it of items) {
      const li = document.createElement("li");
      const region = [it.region, it.country].filter(Boolean).join(", ");
      li.innerHTML = '<span class="s-name">' + it.name +
        '</span> <span class="s-reg">' + region + "</span>";
      li.addEventListener("click", () => onPick(it));
      ul.appendChild(li);
    }
  }

  return {
    setUpdated, setCity, showStatus, renderWarnings, renderCurrent, renderHourly,
    renderSources, renderEmpty, showLoading, openModal, closeModal,
    fillSettings, openShare, closeShare, showSuggestions, clearSuggestions, fmtTemp
  };
})();