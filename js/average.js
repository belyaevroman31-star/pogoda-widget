"use strict";

window.Average = (function () {
  function avg(arr) {
    return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  }

  function majority(count, n) {
    return count >= 1 && count * 2 > n;
  }

  function isSnowCat(cat) {
    return cat === "snow" || cat === "sleet";
  }

  /* ---------- current ---------- */

  function averageCurrent(sources) {
    const keys = ["temp", "feelsLike", "humidity", "windKmh", "pressure", "vis", "cloud", "precip"];
    const agg = {};
    const counts = {};
    const cats = {};
    let contrib = 0;
    let dayCount = 0;

    for (const s of sources) {
      if (!s.current) continue;
      contrib++;
      for (const k of keys) {
        const v = s.current[k];
        if (v != null && isFinite(v)) {
          agg[k] = (agg[k] || 0) + v;
          counts[k] = (counts[k] || 0) + 1;
        }
      }
      const cat = s.current.category;
      if (cat) cats[cat] = (cats[cat] || 0) + 1;
      if (s.current.isDay === 1) dayCount++;
    }

    const cur = { contrib };
    for (const k of keys) cur[k] = counts[k] ? agg[k] / counts[k] : null;
    cur.isDay = contrib > 0 && dayCount * 2 >= contrib;

    let bestCat = "cloud", bestN = 0;
    for (const k in cats) {
      if (cats[k] > bestN) { bestN = cats[k]; bestCat = k; }
    }
    cur.category = bestCat;

    cur.isRain = cats.rain + (cats.drizzle || 0) + (cats.thunder || 0) > contrib / 2;
    cur.isSnow = (cats.snow || 0) + (cats.sleet || 0) > contrib / 2;
    cur.isFog = (cats.fog || 0) >= 1;
    return cur;
  }

  /* ---------- hourly ---------- */

  function averageHourly(sources) {
    const buckets = new Map();

    for (const s of sources) {
      for (const h of s.hourly || []) {
        let b = buckets.get(h.epochHour);
        if (!b) {
          b = {
            eh: h.epochHour,
            temps: [], feels: [], hums: [], winds: [], presses: [], viss: [],
            clouds: [], precips: [], rainMms: [], snowCms: [], prob: [],
            fRain: 0, fSnow: 0, fFrozen: 0, fFog: 0, fThunder: 0, n: 0
          };
          buckets.set(h.epochHour, b);
        }
        if (h.temp != null) b.temps.push(h.temp);
        if (h.feelsLike != null) b.feels.push(h.feelsLike);
        if (h.humidity != null) b.hums.push(h.humidity);
        if (h.wind != null) b.winds.push(h.wind);
        if (h.press != null) b.presses.push(h.press);
        if (h.vis != null) b.viss.push(h.vis);
        if (h.cloud != null) b.clouds.push(h.cloud);
        if (h.precip != null) b.precips.push(h.precip);
        if (h.rainMms != null) b.rainMms.push(h.rainMms);
        if (h.snowCm != null) b.snowCms.push(h.snowCm);
        if (h.prob != null) b.prob.push(h.prob);
        const f = h.flags || {};
        if (f.rain) b.fRain++;
        if (f.snow) b.fSnow++;
        if (f.frozen) b.fFrozen++;
        if (f.fog) b.fFog++;
        if (f.thunder) b.fThunder++;
        b.n++;
      }
    }

    const list = Array.from(buckets.values())
      .sort((a, b) => a.eh - b.eh)
      .map((b) => {
        const tempAvg = avg(b.temps);
        const isRain = majority(b.fRain, b.n);
        const isSnow = majority(b.fSnow, b.n);
        const thresholdedFrozen = majority(b.fFrozen, b.n) ||
          (tempAvg != null && tempAvg <= 0.7 && b.fRain >= 1);
        let category = "cloud";
        if (majority(b.fThunder, b.n)) category = "thunder";
        else if (majority(b.fSnow, b.n)) category = "snow";
        else if (majority(b.fRain, b.n)) category = "rain";
        else if (b.fFog >= 1) category = "fog";
        return {
          eh: b.eh,
          date: new Date(b.eh * 1000),
          temp: tempAvg,
          feelsLike: avg(b.feels),
          humidity: avg(b.hums),
          wind: avg(b.winds),
          press: avg(b.presses),
          vis: avg(b.viss),
          cloud: avg(b.clouds),
          precip: avg(b.precips),
          rainMm: avg(b.rainMms),
          snowCm: avg(b.snowCms),
          prob: avg(b.prob),
          n: b.n,
          rainCount: b.fRain,
          snowCount: b.fSnow,
          frozenCount: b.fFrozen,
          fogCount: b.fFog,
          thunderCount: b.fThunder,
          isRain,
          isSnow,
          isFog: b.fFog >= 1,
          isFrozen: thresholdedFrozen,
          category
        };
      });

    return list;
  }

  function bucketAt(hourly, ms) {
    const target = Math.floor(ms / 3600) * 3600;
    for (const h of hourly) if (h.eh === target) return h;
    return null;
  }

  return { averageCurrent, averageHourly, bucketAt, avg, isSnowCat };
})();