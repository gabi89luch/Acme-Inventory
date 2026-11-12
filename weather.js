// weather.js - JSON parsing & rendering for the Weather page
//
// Data flow:
//   1. Primary (required by the brief): GET
//      https://api.weatherapi.com/v1/current.json?key=[KEY]&q=[CITY]
//   2. If that response is complete, it is used on its own. If it lacks
//      measurements (a restricted/free key can return only rain and snow
//      probabilities), the missing fields are filled from Open-Meteo using the
//      coordinates WeatherAPI reported - including visibility and UV index,
//      which Open-Meteo publishes as hourly series.
//   3. If the WeatherAPI request fails entirely, the app falls back to
//      Open-Meteo, geocoding the city name if no coordinates are available.
//   4. The source in use is always labelled for the user, and the raw JSON
//      responses are available in the "Show raw JSON response" panel.
(function () {
  "use strict";

  const els = {
    form: document.getElementById("weatherForm"),
    cityInput: document.getElementById("cityInput"),
    weatherBtn: document.getElementById("weatherBtn"),
    formError: document.getElementById("formError"),
    resultCard: document.getElementById("resultCard"),
    loading: document.getElementById("loading"),
    weatherResult: document.getElementById("weatherResult"),
    weatherError: document.getElementById("weatherError"),
    apiKeyInput: document.getElementById("apiKeyInput"),
    saveKeyBtn: document.getElementById("saveKeyBtn"),
    keyNotice: document.getElementById("keyNotice"),
  };

  const STORAGE_KEY = "weatherApiKey";
  const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
  const OPEN_METEO_GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";

  function getApiKey() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored.trim() && stored !== "YOUR_API_KEY_HERE") return stored.trim();
    const cfg = (window.APP_CONFIG && window.APP_CONFIG.WEATHER_API_KEY) || "";
    if (cfg && cfg.trim() && cfg !== "YOUR_API_KEY_HERE") return cfg.trim();
    return "";
  }

  function setApiKey(key) {
    localStorage.setItem(STORAGE_KEY, key.trim());
  }

  const currentKey = getApiKey();
  if (currentKey) els.apiKeyInput.value = currentKey;

  // Show a friendly warning until a key has been configured.
  function refreshKeyNotice() {
    if (els.keyNotice) els.keyNotice.hidden = !!getApiKey();
  }
  refreshKeyNotice();

  els.saveKeyBtn.addEventListener("click", () => {
    const k = els.apiKeyInput.value.trim();
    if (!k) {
      showFormError("Please enter an API key.");
      return;
    }
    setApiKey(k);
    showFormError("");
    refreshKeyNotice();
    flashSuccess("API key saved. You can now search for a city.");
  });

  function flashSuccess(msg) {
    const d = document.createElement("div");
    d.className = "px-4 py-3 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium";
    d.textContent = msg;
    els.resultCard.hidden = false;
    els.weatherResult.innerHTML = "";
    els.weatherError.hidden = true;
    els.loading.hidden = true;
    els.weatherResult.appendChild(d);
  }

  function showFormError(msg) {
    if (!msg) { els.formError.hidden = true; els.formError.textContent = ""; return; }
    els.formError.hidden = false;
    els.formError.textContent = msg;
  }

  // Letters (any language, e.g. "São Paulo", "München"), spaces, hyphens,
  // apostrophes, full stops and commas only.
  const CITY_PATTERN = /^[\p{L}][\p{L}\s'\-,.\u00C0-\u024F]*$/u;

  function validateCity(city) {
    if (!city) return "City name is required.";
    if (city.length < 2) return "City name must be at least 2 characters.";
    if (city.length > 60) return "City name must be 60 characters or fewer.";
    if (!CITY_PATTERN.test(city)) return "City name can only contain letters, spaces, hyphens, apostrophes, full stops or commas.";
    return "";
  }

  function numOrNull(v) {
    return (v == null || typeof v !== "number" || isNaN(v)) ? null : v;
  }

  // ------------------------------------------------------------------
  // Primary request - exactly the URL required by the assignment brief
  // ------------------------------------------------------------------
  async function fetchWeather(city) {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error("No API key configured. Please save your WeatherAPI key in Settings.");
    }
    const base = (window.APP_CONFIG && window.APP_CONFIG.WEATHER_BASE_URL) || "https://api.weatherapi.com/v1/current.json";
    const url = `${base}?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(city)}`;
    const res = await fetch(url);
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      const msg = (data && data.error && data.error.message) ? data.error.message : ("HTTP " + res.status);
      throw new Error(msg);
    }
    if (!data) throw new Error("Empty response from weather service.");
    if (data.error) throw new Error(data.error.message || "Weather service error.");
    return data;
  }

  // ------------------------------------------------------------------
  // Fallback service: Open-Meteo (free, no API key, full current data)
  // ------------------------------------------------------------------
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // GET a JSON endpoint, retrying once after a short pause to ride out
  // transient network/5xx failures. Throws labelled, user-readable errors.
  async function fetchJson(url, label, attempts) {
    attempts = attempts || 2;
    let lastErr = new Error(label + " request failed.");
    for (let i = 0; i < attempts; i++) {
      if (i > 0) await sleep(750);
      try {
        const res = await fetch(url);
        let data = null;
        try { data = await res.json(); } catch (e) { data = null; }
        if (!res.ok) {
          const reason = data && (data.reason || (data.error && data.error.message));
          throw new Error(reason || (label + " HTTP " + res.status));
        }
        if (!data) throw new Error("Empty response from " + label + ".");
        return data;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr;
  }

  async function fetchOpenMeteo(lat, lon) {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      current: "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,is_day",
      hourly: "visibility,uv_index",
      forecast_days: "1",
      timezone: "auto",
    });
    const data = await fetchJson(`${OPEN_METEO_URL}?${params.toString()}`, "Open-Meteo");
    if (data.error) throw new Error(data.reason || "Fallback service error.");
    if (!data.current || data.current.temperature_2m == null) {
      throw new Error("Fallback service returned no current data.");
    }
    return data;
  }

  async function geocodeCity(city) {
    const params = new URLSearchParams({ name: city, count: "1", language: "en", format: "json" });
    const data = await fetchJson(`${OPEN_METEO_GEO_URL}?${params.toString()}`, "Location lookup");
    if (!data.results || data.results.length === 0) {
      throw new Error(`No location found for "${city}".`);
    }
    return data.results[0];
  }

  // ------------------------------------------------------------------
  // Normalisation: every provider is mapped to one common shape
  // ------------------------------------------------------------------

  // WMO weather interpretation codes -> [text, emoji]
  const WMO_CODES = {
    0: ["Clear sky", "\u2600\uFE0F"],
    1: ["Mainly clear", "\uD83C\uDF24\uFE0F"],
    2: ["Partly cloudy", "\u26C5"],
    3: ["Overcast", "\u2601\uFE0F"],
    45: ["Fog", "\uD83C\uDF2B\uFE0F"],
    48: ["Depositing rime fog", "\uD83C\uDF2B\uFE0F"],
    51: ["Light drizzle", "\uD83C\uDF26\uFE0F"],
    53: ["Moderate drizzle", "\uD83C\uDF26\uFE0F"],
    55: ["Dense drizzle", "\uD83C\uDF27\uFE0F"],
    56: ["Light freezing drizzle", "\uD83C\uDF27\uFE0F"],
    57: ["Dense freezing drizzle", "\uD83C\uDF27\uFE0F"],
    61: ["Slight rain", "\uD83C\uDF26\uFE0F"],
    63: ["Moderate rain", "\uD83C\uDF27\uFE0F"],
    65: ["Heavy rain", "\uD83C\uDF27\uFE0F"],
    66: ["Light freezing rain", "\uD83C\uDF27\uFE0F"],
    67: ["Heavy freezing rain", "\uD83C\uDF27\uFE0F"],
    71: ["Slight snow", "\uD83C\uDF28\uFE0F"],
    73: ["Moderate snow", "\uD83C\uDF28\uFE0F"],
    75: ["Heavy snow", "\u2744\uFE0F"],
    77: ["Snow grains", "\uD83C\uDF28\uFE0F"],
    80: ["Slight rain showers", "\uD83C\uDF26\uFE0F"],
    81: ["Moderate rain showers", "\uD83C\uDF27\uFE0F"],
    82: ["Violent rain showers", "\u26C8\uFE0F"],
    85: ["Slight snow showers", "\uD83C\uDF28\uFE0F"],
    86: ["Heavy snow showers", "\uD83C\uDF28\uFE0F"],
    95: ["Thunderstorm", "\u26C8\uFE0F"],
    96: ["Thunderstorm with hail", "\u26C8\uFE0F"],
    99: ["Thunderstorm with heavy hail", "\u26C8\uFE0F"],
  };

  function degToCompass(deg) {
    const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    return dirs[Math.round(deg / 22.5) % 16];
  }

  // Open-Meteo publishes visibility and UV index as hourly series rather than
  // current values. Find the hourly entry for the hour that contains the
  // current observation, falling back to the next hour and then the last one.
  function hourlyValueIndex(hourly, isoTime) {
    if (!hourly || !Array.isArray(hourly.time) || !isoTime) return null;
    const key = String(isoTime).slice(0, 13); // YYYY-MM-DDTHH
    let idx = hourly.time.findIndex((t) => String(t).slice(0, 13) === key);
    if (idx < 0) idx = hourly.time.findIndex((t) => String(t) >= String(isoTime));
    if (idx < 0 && hourly.time.length) idx = hourly.time.length - 1;
    return idx >= 0 ? idx : null;
  }

  // hint: "weatherapi" | "open-meteo" | undefined (auto-detect)
  // place: { name, country } used when the payload carries no place name
  function normalize(data, hint, place) {
    // WeatherAPI style
    if (hint !== "open-meteo" && data && data.location && data.current) {
      const loc = data.location;
      const cur = data.current;
      const cond = cur.condition || {};
      return {
        source: "WeatherAPI",
        name: loc.name,
        country: loc.country,
        region: loc.region,
        localtime: loc.localtime,
        lat: numOrNull(loc.lat),
        lon: numOrNull(loc.lon),
        tempC: numOrNull(cur.temp_c),
        feelsLikeC: numOrNull(cur.feelslike_c),
        conditionText: cond.text || "N/A",
        conditionEmoji: "",
        conditionIcon: cond.icon || "",
        humidity: numOrNull(cur.humidity),
        windKph: numOrNull(cur.wind_kph),
        windDir: cur.wind_dir || "",
        pressureMb: numOrNull(cur.pressure_mb),
        visKm: numOrNull(cur.vis_km),
        uv: numOrNull(cur.uv),
        lastUpdated: cur.last_updated || "",
      };
    }
    // Open-Meteo style
    if (hint === "open-meteo" || (data && data.current && data.current.temperature_2m !== undefined)) {
      const cur = data.current || {};
      const cond = WMO_CODES[cur.weather_code] || ["Conditions unavailable", ""];
      const time = cur.time ? String(cur.time).replace("T", " ") : "";
      const hourlyIdx = hourlyValueIndex(data.hourly, cur.time);
      const visibilityM = hourlyIdx != null && data.hourly.visibility ? data.hourly.visibility[hourlyIdx] : null;
      const uvValue = hourlyIdx != null && data.hourly.uv_index ? data.hourly.uv_index[hourlyIdx] : null;
      return {
        source: "Open-Meteo (fallback)",
        name: (place && place.name) || "Unknown",
        country: (place && place.country) || "",
        region: "",
        localtime: time,
        lat: numOrNull(data.latitude),
        lon: numOrNull(data.longitude),
        tempC: numOrNull(cur.temperature_2m),
        feelsLikeC: numOrNull(cur.apparent_temperature),
        conditionText: cond[0],
        conditionEmoji: cond[1],
        conditionIcon: "",
        humidity: numOrNull(cur.relative_humidity_2m),
        windKph: numOrNull(cur.wind_speed_10m),
        windDir: cur.wind_direction_10m != null ? degToCompass(cur.wind_direction_10m) : "",
        pressureMb: numOrNull(cur.surface_pressure),
        visKm: visibilityM != null ? numOrNull(visibilityM / 1000) : null,
        uv: numOrNull(uvValue),
        lastUpdated: time,
      };
    }
    // OpenWeatherMap style
    if (data && data.main && Array.isArray(data.weather)) {
      const w = data.weather[0] || {};
      return {
        source: "OpenWeatherMap",
        name: data.name,
        country: (data.sys && data.sys.country) || "",
        region: "",
        localtime: "",
        lat: numOrNull(data.coord && data.coord.lat),
        lon: numOrNull(data.coord && data.coord.lon),
        tempC: numOrNull(data.main.temp),
        feelsLikeC: numOrNull(data.main.feels_like),
        conditionText: w.description || "N/A",
        conditionEmoji: "",
        conditionIcon: w.icon ? `https://openweathermap.org/img/wn/${w.icon}@2x.png` : "",
        humidity: numOrNull(data.main.humidity),
        windKph: data.wind ? numOrNull(data.wind.speed * 3.6) : null,
        windDir: "",
        pressureMb: numOrNull(data.main.pressure),
        visKm: data.visibility != null ? numOrNull(data.visibility / 1000) : null,
        uv: null,
        lastUpdated: "",
      };
    }
    // Unknown: try best-effort
    return {
      source: "Unknown response format",
      name: data.name || data.city || "Unknown",
      country: data.country || "",
      region: data.region || "",
      localtime: data.localtime || "",
      lat: numOrNull(data.lat),
      lon: numOrNull(data.lon),
      tempC: numOrNull(data.temp_c != null ? data.temp_c : data.temp),
      feelsLikeC: numOrNull(data.feelslike_c != null ? data.feelslike_c : data.feels_like),
      conditionText: (data.condition && data.condition.text) || data.description || "N/A",
      conditionEmoji: "",
      conditionIcon: (data.condition && data.condition.icon) || "",
      humidity: numOrNull(data.humidity),
      windKph: numOrNull(data.wind_kph || data.wind_speed),
      windDir: data.wind_dir || "",
      pressureMb: numOrNull(data.pressure_mb || data.pressure),
      visKm: numOrNull(data.vis_km || data.visibility),
      uv: numOrNull(data.uv),
      lastUpdated: data.last_updated || "",
    };
  }

  // A restricted WeatherAPI key can return only some "current" fields (for
  // example rain/snow probabilities). Keep its location details, then fill
  // every missing measurement from Open-Meteo so temperature, visibility, UV
  // index and the rest are complete.
  const MEASUREMENT_FIELDS = ["tempC", "feelsLikeC", "humidity", "windKph", "pressureMb", "visKm", "uv"];

  function mergeNormalized(primary, supplement) {
    const merged = Object.assign({}, supplement);
    MEASUREMENT_FIELDS.forEach((key) => {
      if (primary[key] != null) merged[key] = primary[key];
    });
    merged.name = primary.name || supplement.name;
    merged.country = primary.country || supplement.country;
    merged.region = primary.region || supplement.region;
    merged.localtime = primary.localtime || supplement.localtime;
    merged.lat = primary.lat != null ? primary.lat : supplement.lat;
    merged.lon = primary.lon != null ? primary.lon : supplement.lon;
    if (primary.windKph != null && primary.windDir) merged.windDir = primary.windDir;
    if (primary.conditionText && primary.conditionText !== "N/A") {
      merged.conditionText = primary.conditionText;
      merged.conditionEmoji = primary.conditionEmoji;
      merged.conditionIcon = primary.conditionIcon;
    }
    merged.source = "WeatherAPI + Open-Meteo (supplementary)";
    return merged;
  }

  // ------------------------------------------------------------------
  // Orchestration: required WeatherAPI request first, fill or fall back
  // ------------------------------------------------------------------
  async function loadWeather(city) {
    if (!getApiKey()) {
      throw new Error("No API key configured. Please save your WeatherAPI key in Settings.");
    }

    let primary = null;
    let primaryError = null;

    try {
      primary = await fetchWeather(city);
      const n = normalize(primary, "weatherapi");
      if (n.tempC != null) {
        return { data: primary, n, fallback: false, primaryOk: true };
      }
      // WeatherAPI responded, but without the usual measurements (a
      // restricted key can return only rain/snow probabilities). Keep the
      // required response and fill the gaps from Open-Meteo.
      primaryError = new Error("WeatherAPI returned limited data for this location.");
      if (n.lat != null && n.lon != null) {
        try {
          const fb = await fetchOpenMeteo(n.lat, n.lon);
          const supplement = normalize(fb, "open-meteo", { name: n.name, country: n.country });
          return {
            data: primary,
            fbData: fb,
            n: mergeNormalized(n, supplement),
            fallback: false,
            merged: true,
            primaryOk: true,
            primaryData: primary,
          };
        } catch (fbErr) {
          primaryError = new Error("WeatherAPI returned limited data (" + fbErr.message + ")");
        }
      }
    } catch (e) {
      primaryError = e;
    }

    // Last resort: geocode the city name, then use the fallback service.
    try {
      const geo = await geocodeCity(city);
      const fb = await fetchOpenMeteo(geo.latitude, geo.longitude);
      return {
        data: fb,
        n: normalize(fb, "open-meteo", { name: geo.name, country: geo.country }),
        fallback: true,
        primaryOk: false,
        reason: primaryError ? primaryError.message : "",
        primaryData: primary,
      };
    } catch (fbErr) {
      throw new Error(
        (primaryError ? primaryError.message + " " : "") + "Fallback also failed: " + fbErr.message
      );
    }
  }

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------
  function statCard(label, value, iconPath) {
    return `
      <div class="bg-slate-50 rounded-xl p-4 border border-slate-200 flex items-center gap-3">
        <div class="flex-shrink-0 w-10 h-10 rounded-lg bg-brand-100 text-brand-600 flex items-center justify-center">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${iconPath}"/></svg>
        </div>
        <div class="min-w-0">
          <div class="text-xs uppercase tracking-wide text-slate-500">${escapeHtml(label)}</div>
          <div class="font-semibold text-slate-800 truncate">${value}</div>
        </div>
      </div>
    `;
  }

  function renderWeather(result) {
    const n = result.n;
    const data = result.data;

    // Always be transparent about which service supplied the data and why.
    let notice = "";
    if (result.merged) {
      notice = `<div class="mb-4 px-4 py-3 rounded-lg bg-blue-50 text-blue-800 border border-blue-200 text-sm font-medium">
           WeatherAPI returned a partial response for this location, so the missing measurements were filled from Open-Meteo.
         </div>`;
    } else if (result.fallback) {
      const why = result.primaryOk
        ? "WeatherAPI returned limited data for this location"
        : "WeatherAPI request failed" + (result.reason ? " (" + result.reason + ")" : "");
      notice = `<div class="mb-4 px-4 py-3 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 text-sm font-medium">
           ${escapeHtml(why)} &mdash; showing fallback data from Open-Meteo.
         </div>`;
    } else if (n.tempC == null && n.humidity == null && n.windKph == null) {
      notice = `<div class="mb-4 px-4 py-3 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 text-sm font-medium">
           The weather service returned limited data for this location, so some details are shown as N/A.
         </div>`;
    }

    const iconUrl = n.conditionIcon ? (n.conditionIcon.startsWith("//") ? "https:" + n.conditionIcon : n.conditionIcon) : "";
    const media = iconUrl
      ? `<img src="${escapeHtml(iconUrl)}" alt="${escapeHtml(n.conditionText)}" class="w-28 h-28 drop-shadow-lg">`
      : (n.conditionEmoji
          ? `<span class="text-7xl leading-none drop-shadow-lg" role="img" aria-label="${escapeHtml(n.conditionText)}">${n.conditionEmoji}</span>`
          : "");
    const fmt = (v, suffix) => (v == null || (typeof v === "number" && isNaN(v))) ? "N/A" : (v + (suffix || ""));
    const fmtNum = (v, suffix) => (v == null || (typeof v === "number" && isNaN(v))) ? "N/A" : (Math.round(v) + (suffix || ""));

    const rawPanels = [];
    const rawPre = (obj) =>
      `<pre class="mt-1 text-xs bg-slate-100 p-3 rounded-lg overflow-x-auto">${escapeHtml(JSON.stringify(obj, null, 2))}</pre>`;

    if (result.merged) {
      rawPanels.push(
        `<p class="mt-3 text-xs font-semibold text-slate-500">WeatherAPI response (required endpoint):</p>` +
        rawPre(result.primaryData)
      );
      rawPanels.push(
        `<p class="mt-3 text-xs font-semibold text-slate-500">Open-Meteo supplementary response:</p>` +
        rawPre(result.fbData)
      );
    } else {
      if (result.fallback && result.primaryOk !== false && result.primaryData) {
        rawPanels.push(
          `<p class="mt-3 text-xs font-semibold text-slate-500">WeatherAPI response (required endpoint):</p>` +
          rawPre(result.primaryData)
        );
      }
      rawPanels.push(
        `<p class="mt-3 text-xs font-semibold text-slate-500">${result.fallback ? "Open-Meteo fallback response:" : "Response:"}</p>` +
        rawPre(data)
      );
    }

    const html = `
      ${notice}
      <div class="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 via-brand-700 to-indigo-800 text-white p-6 sm:p-8 shadow-lg">
        <div class="flex flex-col sm:flex-row items-center gap-6">
          ${media}
          <div class="text-center sm:text-left">
            <div class="text-sm uppercase tracking-widest text-blue-200">${escapeHtml(n.name || "Unknown")}${n.country ? ", " + escapeHtml(n.country) : ""}</div>
            <div class="text-6xl font-extrabold mt-1">${fmtNum(n.tempC, "°C")}</div>
            <div class="text-xl text-blue-100 mt-1 capitalize">${escapeHtml(n.conditionText)}</div>
            <div class="text-sm text-blue-200 mt-1">Feels like ${fmtNum(n.feelsLikeC, "°C")}${n.localtime ? " &middot; " + escapeHtml(n.localtime) : ""}</div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6">
        ${statCard("Humidity", fmt(n.humidity, "%"), "M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41")}
        ${statCard("Wind", (n.windKph != null ? Math.round(n.windKph) : "N/A") + " km/h " + (n.windDir || ""), "M9.59 4.59A2 2 0 1111 8H2m10.59 11.41A2 2 0 1014 16H2m15.73-8.27A2.5 2.5 0 1119.5 12H2")}
        ${statCard("Pressure", fmt(n.pressureMb, " mb"), "M13 17h8m-8 0a2 2 0 01-2-2V9a2 2 0 012-2h3l2 3h5a2 2 0 012 2v3a2 2 0 01-2 2m-8 0H5a2 2 0 01-2-2V9a2 2 0 012-2h3")}
        ${statCard("Visibility", fmt(n.visKm, " km"), "M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z M12 9a3 3 0 100 6 3 3 0 000-6z")}
        ${statCard("UV Index", fmt(n.uv), "M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z")}
        ${statCard("Last Updated", escapeHtml(n.lastUpdated || "N/A"), "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z")}
      </div>

      ${n.region ? `<p class="mt-4 text-sm text-slate-500">Region: ${escapeHtml(n.region)}${n.country ? " &middot; " + escapeHtml(n.country) : ""}</p>` : ""}
      <p class="mt-1 text-xs text-slate-400">Source: ${escapeHtml(n.source)}</p>

      <details class="mt-4">
        <summary class="cursor-pointer text-brand-600 text-sm font-medium">Show raw JSON response</summary>
        ${rawPanels.join("")}
      </details>
    `;
    els.weatherResult.innerHTML = html;
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  els.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const city = els.cityInput.value.trim().replace(/\s+/g, " ");
    const err = validateCity(city);
    if (err) {
      showFormError(err);
      els.cityInput.setAttribute("aria-invalid", "true");
      els.cityInput.focus();
      return;
    }
    showFormError("");
    els.cityInput.removeAttribute("aria-invalid");

    els.resultCard.hidden = false;
    els.loading.hidden = false;
    els.weatherResult.innerHTML = "";
    els.weatherError.hidden = true;
    els.weatherBtn.disabled = true;

    try {
      const result = await loadWeather(city);
      els.loading.hidden = true;
      renderWeather(result);
    } catch (ex) {
      els.loading.hidden = true;
      els.weatherError.hidden = false;
      els.weatherError.textContent = "Could not retrieve weather: " + ex.message;
    } finally {
      els.weatherBtn.disabled = false;
    }
  });

  // NOTE: the mobile menu toggle is handled once, inline in weather.html.
})();
