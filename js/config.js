"use strict";

window.AppConfig = {
  refreshMinutes: 30,
  defaultWarnHorizonHours: 36,
  serviceNames: {
    "open-meteo": "Open-Meteo",
    "openweathermap": "OpenWeatherMap",
    "weatherapi": "WeatherAPI"
  },
  serviceOrder: ["open-meteo", "openweathermap", "weatherapi"],
  storageKey: "pogoda-widget.v1"
};

window.AppSettings = (function () {
  const defaults = {
    city: "",
    latitude: null,
    longitude: null,
    timezone: "",
    owmKey: "140199bad789f914b8be6eed1321ea95",
    waKey: "a4e1eb23b62d45d3ad2103041262109",
    proxyMode: "auto", // auto | direct | proxy
    proxyUrl: "",
    warnHorizonHours: 36
  };

  function load() {
    try {
      const raw = localStorage.getItem(window.AppConfig.storageKey);
      if (raw) return Object.assign({}, defaults, JSON.parse(raw));
    } catch (e) { /* ignore */ }
    return Object.assign({}, defaults);
  }

  function save(s) {
    try {
      localStorage.setItem(window.AppConfig.storageKey, JSON.stringify(s));
    } catch (e) { /* ignore */ }
  }

  return { load, save };
})();