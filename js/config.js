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
    owmKey: "",
    waKey: "",
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