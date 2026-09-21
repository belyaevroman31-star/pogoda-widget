"use strict";

/* ============================================================
 * RadarMap — карта осадков (Leaflet + OpenWeatherMap tiles)
 *
 * Источник: OWM weather map tiles precipitation_new (бесплатно,
 * ваш API-ключ). Показывает зоны осадков поверх базовой карты.
 * Требует настроенный ключ OWM (settings.owmKey).
 * ============================================================ */

window.RadarMap = (function () {
  const $ = (id) => document.getElementById(id);
  const mapSources = {
    "precipitation": {
      label: "Осадки",
      base: "https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid="
    },
    "clouds": {
      label: "Облачность",
      base: "https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid="
    },
    "temp": {
      label: "Температура",
      base: "https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid="
    }
  };
  const MAX_ZOOM = 19;

  let map = null;
  let overlay = null;
  let curLayer = "precipitation";
  let center = [55.75, 37.62];
  let zoom = 8;
  let userMark = null;
  let key = "";

  function tileUrl(base, k) {
    return base + encodeURIComponent(k);
  }

  function onTileLoad(ev) {
    const mark = $("radarStatus");
    if (mark) mark.textContent = "обновлено " + new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }
  function onTileErr(ev) {
    const t = ev.target;
    if (t && t.src && t.src.indexOf("tile.openweathermap.org") >= 0) {
      const mark = $("radarStatus");
      if (mark) mark.textContent = "тайлы осадков недоступны — проверьте ключ OWM";
      t.remove();
    }
  }

  /* ---------- public ---------- */

  function open() {
    if (!key) {
      const s = window.AppSettings.load();
      key = (s && s.owmKey || "").trim();
    }
    if (map) {
      UI.openModal("mapSheet");
      return;
    }
    create();
    UI.openModal("mapSheet");
  }

  function create() {
    const sheet = $("mapSheet");
    if (!sheet) return;

    map = window.L.map(sheet, {
      zoomControl: true,
      attributionControl: true,
      minZoom: 3,
      maxZoom: MAX_ZOOM
    });
    map.setView(center, zoom);

    const baseLayers = {
      "Схема (OSM)": window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: MAX_ZOOM,
        attribution: "© OpenStreetMap"
      }),
      "Спутник (Esri)": window.L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 19,
        attribution: "Tiles © Esri"
      })
    };
    baseLayers["Схема (OSM)"].addTo(mapgen);

    addOverlay();
    window.L.control.layers(baseLayers, { [mapSources[curLayer].label]: overlay }, { position: "topright" }).addTo(map);

    window.L.control.zoom({ position: "topleft" }).addTo(map);

    if (navigator.geolocation) {
      const gc = window.L.control.locate ? window.L.control.locate({ position: "bottomleft", flyTo: true, setView: true }) : null;
      if (gc) gc.addTo(map);
    }

    map.on("click", onMapClick);
  }

  function addOverlay() {
    if (!map || !key) return;
    const src = mapSources[curLayer] || mapSources.precipitation;
    const t = window.L.tileLayer(tileUrl(src.base, key), {
      opacity: 0.75,
      maxZoom: MAX_ZOOM,
      zIndex: 500
    });
    t.on("tileload", onTileLoad);
    t.on("tileerror", onTileErr);
    if (overlay) map.removeLayer(overlay);
    overlay = t;
    overlay.addTo(map);
    return overlay;
  }

  function switchLayer(name) {
    if (!mapSources[name]) name = "precipitation";
    curLayer = name;
    if (map) addOverlay();
  }

  function paint(arr) {
    if (!map) return;
    const ll = arr.map(([la, lo]) => [la, lo]);
    if (userMark) {
      userMark.setLatLng([arr[0][0], arr[0][1]]);
    } else {
      userMark = window.L.marker([arr[0][0], arr[0][1]], {
        icon: window.L.divIcon({
          className: "radar-me",
          iconSize: [18, 18],
          iconAnchor: [9, 9]
        })
      }).addTo(map);
    }
    if (ll.length > 1) {
      if (!map.poly) map.poly = window.L.polyline(ll, { color: "#2f7df4", weight: 3, opacity: 0.9, dashArray: "6 8" }).addTo(map);
      else map.poly.setLatLngs(ll);
    }
    center = ll[ll.length - 1] || center;
  }

  function pinpoint(lat, lon, label) {
    if (!map) return;
    center = [lat, lon];
    map.setView(center, zoom);
    if (userMark) userMark.setLatLng(center);
    else userMark = window.L.marker(center, {
      icon: window.L.divIcon({ className: "radar-me", iconSize: [18, 18], iconAnchor: [9, 9] })
    }).addTo(map);
    if (label) {
      const popup = window.L.popup().setLatLng(center).setContent(label);
      map.openPopup(popup);
    }
  }

  function onMapClick(e) {
    if (userMark) userMark.setLatLng(e.latlng);
    else userMark = window.L.marker(e.latlng, {
      icon: window.L.divIcon({ className: "radar-me", iconSize: [18, 18], iconAnchor: [9, 9] })
    }).addTo(map);
    center = [e.latlng.lat, e.latlng.lng];
  }

  function close() {
    if (map) {
      map.remove();
      map = null;
      overlay = null;
      userMark = null;
    }
  }

  function setCenter(lat, lon, z) {
    center = [lat, lon];
    if (z) zoom = z;
    if (map) map.setView(center, zoom);
  }

  function open() {
    if (!map) create();
    UI.openModal("mapSheet");
  }

  function bind() {
    $("btnRadar") && $("btnRadar").addEventListener("click", open);
    $("btnRadarClose") && $("btnRadarClose")?.addEventListener("click", () => UI.closeModal());
    $("radarLayer") && $("radarLayer")?.addEventListener("change", (e) => switchLayer(e.target.value));
    const s = window.AppSettings.load();
    key = (s && s.owmKey || "").trim();
  }

  return { bind, open, close, setCenter, switchLayer };
})();
