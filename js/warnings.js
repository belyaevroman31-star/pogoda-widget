"use strict";

window.Warn = (function () {
  const pad2 = (n) => String(n).padStart(2, "0");
  const fmtTime = (d) => pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  const dayNames = ["в воскресенье", "в понедельник", "во вторник",
    "в среду", "в четверг", "в пятницу", "в субботу"];

  function dayLabel(d, now) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = Math.round((that - today) / 86400000);
    if (diff === 0) return "сегодня";
    if (diff === 1) return "завтра";
    return dayNames[d.getDay()];
  }

  function inHours(d, now) {
    const h = Math.round((d - now) / 3600000);
    if (h <= 0) return "в ближайший час";
    if (h === 1) return "через 1 ч";
    return "через " + h + " ч";
  }

  function findBlocks(hourly, pred, nowMs, horizonMs) {
    const hs = hourly.filter((h) => h.date.getTime() > nowMs - 3600000 && h.date.getTime() <= nowMs + horizonMs);
    const blocks = [];
    let i = 0;
    while (i < hs.length) {
      if (!pred(hs[i])) { i++; continue; }
      let j = i;
      while (j + 1 < hs.length && pred(hs[j + 1])) j++;
      blocks.push({ start: hs[i], end: hs[j] });
      i = j + 1;
    }
    return blocks;
  }

  function intensityRain(mm) {
    if (mm == null) return "";
    if (mm < 0.5) return "слабый ";
    if (mm < 4) return "умеренный ";
    return "сильный ";
  }

  function intensitySnow(cm) {
    if (cm == null) return "";
    if (cm < 0.5) return "небольшой ";
    if (cm < 2) return "умеренный ";
    return "сильный ";
  }

  function endText(end, start) {
    if (end.date.getTime() <= start.date.getTime()) return "до конца часа";
    return "до " + fmtTime(end.date);
  }

  function compute(current, hourly, now, horizonHours) {
    const warns = [];
    const horizonMs = (horizonHours || 36) * 3600000;
    const nowMs = now.getTime();

    const rainBlock = findBlocks(hourly, (h) => h.isRain, nowMs, horizonMs)[0];
    const snowBlock = findBlocks(hourly, (h) => h.isSnow, nowMs, horizonMs)[0];
    const fogBlock = findBlocks(hourly, (h) => h.isFog, nowMs, horizonMs)[0];
    const iceBlock = findBlocks(hourly, (h) => h.isFrozen, nowMs, horizonMs)[0];

    if (rainBlock) {
      const s = rainBlock.start;
      const active = s.date.getTime() <= nowMs;
      warns.push({
        id: "rain",
        icon: active ? "🌧" : "🌦",
        title: "Дождь",
        color: "rain",
        severity: 20,
        active,
        start: s.date,
        end: rainBlock.end.date,
        text: active
          ? "Сейчас идёт " + intensityRain(s.rainMm) + "дождь — " + endText(rainBlock.end, s) + "."
          : intensityRain(s.rainMm) + "дождь начнётся " + dayLabel(s.date, now) + " в " + fmtTime(s.date) +
            " (" + inHours(s.date, now) + "). Возьмите зонт."
      });
    }

    if (snowBlock) {
      const s = snowBlock.start;
      const active = s.date.getTime() <= nowMs;
      warns.push({
        id: "snow",
        icon: "🌨",
        title: "Снег",
        color: "snow",
        severity: 20,
        active,
        start: s.date,
        end: snowBlock.end.date,
        text: active
          ? "Сейчас идёт " + intensitySnow(s.snowCm) + "снег — " + endText(snowBlock.end, s) + "."
          : intensitySnow(s.snowCm) + "снег начнётся " + dayLabel(s.date, now) + " в " + fmtTime(s.date) +
            " (" + inHours(s.date, now) + ")."
      });
    }

    if (fogBlock) {
      const s = fogBlock.start;
      const active = s.date.getTime() <= nowMs;
      let minVis = null;
      for (const h of hourly) {
        if (h.date.getTime() >= s.date.getTime() && h.date.getTime() <= fogBlock.end.date.getTime() &&
            h.vis != null && (minVis == null || h.vis < minVis)) minVis = h.vis;
      }
      const visText = minVis != null
        ? "Видимость может снизиться до " + (Math.round(minVis / 100) / 10).toFixed(1) + " км."
        : "Будьте осторожны на дорогах.";
      warns.push({
        id: "fog",
        icon: "🌫",
        title: "Туман",
        color: "fog",
        severity: 10,
        active,
        start: s.date,
        end: fogBlock.end.date,
        text: active
          ? "Сейчас туман — " + endText(fogBlock.end, s) + ". " + visText
          : "Туман ожидается " + dayLabel(s.date, now) + " в " + fmtTime(s.date) +
            " (" + inHours(s.date, now) + "). " + visText
      });
    }

    if (iceBlock) {
      const s = iceBlock.start;
      const active = s.date.getTime() <= nowMs;
      const tempText = s.temp != null ? " При температуре " + (s.temp > 0 ? "+" : "") + s.temp.toFixed(1) + " °C" : "";
      warns.push({
        id: "ice",
        icon: "🧊",
        title: "Гололедица",
        color: "ice",
        severity: 40,
        active,
        start: s.date,
        end: iceBlock.end.date,
        text: active
          ? "Сейчас гололедица — осадки замерзают на дорогах." + tempText + " Будьте осторожны."
          : "Гололедица ожидается " + dayLabel(s.date, now) + " в " + fmtTime(s.date) +
            " (" + inHours(s.date, now) + "): осадки при" + tempText.toLowerCase() +
            " могут замерзать, образуя наледь."
      });
    }

    warns.sort((a, b) => (b.active - a.active) || (b.severity - a.severity) || (a.start - b.start));
    return warns;
  }

  return { compute, fmtTime };
})();