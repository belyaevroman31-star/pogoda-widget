"use strict";

window.RadarMap = (function () {
  const $ = (id) => document.getElementById(id);
  let map = null;
  let radarLayer = null;
  let marker = null;
  let frames = [];
  let host = "https://tilecache.rainviewer.com";
  let idx = 0;
  let playing = false;
  let animTimer = null;
  let refreshTimer = null;
  let currentLat = null;
  let currentLon = null;
  const LIB_CSS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
  const LIB_JS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";

  const pad2 = (n) => String(n).padStart(2, "0");
  const fmtTime = (d) => pad2(d.getHours()) + ":" + pad2(d.getMinutes());

  function ensureLib(cb) {
    if (window.L) { cb(); return; }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = LIB_CSS;
    document.head.appendChild(link);
    const script = document.createElement("script");
    script.src = LIB_JS;
    script.onload = cb;
    script.onerror = () => {
      showStatus("Не удалось загрузить карту (нет сети для Leaflet).");
    };
    document.head.appendChild(script);
  }

  function showStatus(text) {
    $("radarStatus").textContent = text || "";
  }

  function initMap(lat, lon) {
    if (!map) {
      map = L.map("rainMap", { zoomControl: true, attributionControl: false }).setView([lat, lon], 8);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 13,
        subdomains: "abcd"
      }).addTo(map);
      radarLayer = L.layerGroup().addTo(map);
    } else {
      map.setView([lat, lon], Math.max(map.getZoom(), 8));
    }
    if (!marker) {
      marker = L.marker([lat, lon], {
        icon: L.divIcon({ html: '<div class="radar-me"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
        zIndexOffset: 1000
      }).addTo(map);
    } else {
      marker.setLatLng([lat, lon]);
    }
  }

  async function loadFrames() {
    showStatus("Загружаю данные радара…");
    try {
      const rv = await Services.fetchRainViewer();
      frames = rv.frames || [];
      host = rv.host || host;
      if (!frames.length) {
        showStatus("Нет данных радиолокатора для этого региона.");
        return;
      }
      const range = $("radarRange");
      range.max = frames.length - 1;
      range.min = 0;
      idx = nearestIndex(Date.now() / 1000);
      applyFrame();
      showStatus("");
    } catch (e) {
      showStatus("Ошибка загрузки радара: " + (e.message || e));
    }
  }

  function nearestIndex(epochSec) {
    let best = 0, bestDiff = Infinity;
    frames.forEach((f, i) => {
      const d = Math.abs(f.time - epochSec);
      if (d < bestDiff) { bestDiff = d; best = i; }
    });
    if (frames[best] && frames[best].time > epochSec + 600) {
      for (let i = best; i >= 0; i--) if (frames[i].time <= epochSec) return i;
    }
    return best;
  }

  function applyFrame() {
    if (!frames.length || !map) return;
    const f = frames[idx];
    radarLayer.clearLayers();
    L.tileLayer(host + f.path + "/256/{z}/{x}/{y}/2/1_1.png", {
      opacity: 0.78,
      zIndex: 300,
      maxZoom: 13
    }).addTo(radarLayer);

    const d = new Date(f.time * 1000);
    const future = f.time * 1000 > Date.now() + 600000;
    $("radarTime").textContent = fmtTime(d) + (future ? " · прогноз" : "");
    $("radarRange").value = String(idx);
    $("radarPlay").textContent = playing ? "⏸" : "▶";
    $("radarPlay").setAttribute("aria-label", playing ? "Пауза" : "Воспроизвести");
  }

  function play() {
    if (!frames.length) return;
    if (playing) { stopPlay(); return; }
    playing = true;
    animTimer = setInterval(() => {
      idx = (idx + 1) % frames.length;
      applyFrame();
    }, 600);
    applyFrame();
  }

  function stopPlay() {
    playing = false;
    clearInterval(animTimer);
    animTimer = null;
    applyFrame();
  }

  function step(dir) {
    stopPlay();
    if (!frames.length) return;
    idx = (idx + dir + frames.length) % frames.length;
    applyFrame();
  }

  function open(lat, lon) {
    currentLat = lat;
    currentLon = lon;
    ensureLib(() => {
      $("mapModal").hidden = false;
      document.body.classList.add("modal-open");
      setTimeout(() => {
        initMap(lat, lon);
        if (!frames.length) loadFrames();
        else {
          map.setView([lat, lon], Math.max(map.getZoom(), 8));
          marker.setLatLng([lat, lon]);
          applyFrame();
        }
      }, 60);
    });
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      if (!$("mapModal").hidden) loadFrames();
    }, 5 * 60000);
  }

  function close() {
    stopPlay();
    $("mapModal").hidden = true;
    document.body.classList.remove("modal-open");
    clearInterval(refreshTimer);
  }

  function bind() {
    $("btnMap").addEventListener("click", () => {
      const s = window.AppSettings.load();
      if (s.latitude == null || s.longitude == null) {
        UI.showStatus("Сначала укажите город или разрешите геолокацию.", "warn");
        return;
      }
      open(s.latitude, s.longitude);
    });
    $("btnMapRecenter").addEventListener("click", () => {
      const s = window.AppSettings.load();
      if (map && s.latitude != null) map.setView([s.latitude, s.longitude], 8);
    });
    $("btnCloseMap").addEventListener("click", close);
    $("radarPlay").addEventListener("click", play);
    $("radarPrev").addEventListener("click", () => step(-1));
    $("radarNext").addEventListener("click", () => step(1));
    $("radarRange").addEventListener("input", () => {
      stopPlay();
      idx = parseInt($("radarRange").value, 10) || 0;
      applyFrame();
    });
    $("mapModal").addEventListener("click", (e) => {
      if (e.target.id === "mapModal") close();
    });
  }

  return { open, close, bind };
})();