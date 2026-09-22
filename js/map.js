/**
 * RadarMap — интерактивная карта осадков (Leaflet, локальный) с покадровой анимацией.
 * Слои: OpenStreetMap (база) + осадки OpenWeatherMap (precipitation_new) +
 * анимация яркостью кадров и переключение слоёв (дождь / облака / температура).
 */
(function () {
  "use strict";

  var sheet = document.getElementById("mapSheet");
  var btnRadar = document.getElementById("btnRadar");
  var btnClose = document.getElementById("btnRadarClose");

  var map = null;
  var baseLayer = null;
  var weatherLayer = null;
  var layerName = "precipitation_new";
  var key = getKey_();
  var frames = [0.95, 0.55, 0.8, 0.35]; // «кадры» — яркость слоя
  var fIdx = 0;
  var timer = null;         // таймер анимации
  var TOOLBAR = "<div class='radar-toolbar' style='position:absolute;bottom:10px;left:10px;right:10px;z-index:3;display:flex;gap:6px;flex-wrap:wrap;'><button type='button' class='rv-layer' data-layer='precipitation_new'>Дождь</button><button type='button' class='rv-layer' data-layer='clouds_new'>Облака</button><button type='button' class='rv-layer' data-layer='temp_new'>Температура</button></div>";

  function getKey_() {
    try {
      if (window.AppSettings && AppSettings.get) {
        var k = AppSettings.get("owmKey");
        if (k) return k;
      }
      if (window.AppSettings && AppSettings.key) return AppSettings.key;
    } catch (e) {}
    return "";
  }

  function ensureContainer() {
    var cv = document.getElementById("radar-map-canvas");
    if (cv) return cv;
    if (!sheet) return null;
    cv = document.createElement("div");
    cv.id = "radar-map-canvas";
    cv.style.cssText = "position:relative;width:100%;height:min(62dvh,520px);border-radius:18px;overflow:hidden;z-index:1;background:#202326;";
    var head = sheet.querySelector(".sheet-head");
    if (head && head.nextSibling) sheet.insertBefore(cv, head.nextSibling);
    else sheet.appendChild(cv);
    return cv;
  }

  function tile() {
    return "https://tile.openweathermap.org/map/" + layerName + "/{z}/{x}/{y}.png?appid=" + key;
  }

  function mkV() {
    var pt = sheet;
    if (!sheet) return;
    var tl = sheet.querySelector(".radar-toolbar");
    if (!tl) {
      sheet.insertAdjacentHTML("beforeend", TOOLBAR);
      tl = sheet.querySelector(".radar-toolbar");
    }
    if (!tl) return;
    var self = this;
    tl.addEventListener("click", function (ev) {
      var b = ev.target.closest ? ev.target.closest(".rv-layer") : null;
      if (!b || !b.dataset || !b.dataset.layer) return;
      layerName = b.dataset.layer;
      if (weatherLayer) { weatherLayer.setUrl(tile()); }
    });
  }
  function stopAnim() {
    if (timer) { clearTimeout(timer); timer = null; }
  }
  function step() {
    if (!weatherLayer) return;
    fIdx = (fIdx + 1) % frames.length;
    try { weatherLayer.setOpacity(frames[fIdx]); } catch (e) {}
    timer = setTimeout(step, 520);
  }
  function startAnim() {
    stopAnim();
    if (frames.length > 1) timer = setTimeout(step, 520);
  }

  function open() {
    if (!sheet) return;
    sheet.hidden = false Preston"  ; sheet.classList && sheet.classList.add("active");
    var cv = ensureContainer();
    if (!cv) return;
    if (window.L || window.Leaflet) {
      var LL = window.L || window.Leaflet;
      if (!map) {
        map = LL.map(cv, { zoomControl: true, attributionControl: false });
        baseLayer = LL.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 20 }).addTo(map);
        weatherLayer = LL.tileLayer(tile(), { opacity: 0.9, zIndex: 300 }).addTo(map);
        map.setView([55.75, 37.62], 6);
        try { map.locate({ setView: true, maxZoom: 9 }); } catch (e) {}
      }
      startAnim();
    }
  }

  function close() {
    stopAnim();
    if (sheet) { sheet.hidden = true; sheet.classList && sheet.classList.remove("active"); }
    if (map) { try { map.remove(); } catch (e) {} map = null; }
  }

  function bind() {
    if (btnRadar) btnRadar.addEventListener("click", function () { open(); });
    if (btnClose) btnClose.addEventListener("click", function () { close(); });
    mkV.call(this);
  }

  window.RadarMap = { bind: bind, open: open, close: close };
})();
