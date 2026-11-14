// Weather page.
//
// Section 2 of the brief asks for a GET request to OpenWeatherMap:
//   https://api.openweathermap.org/data/2.5/weather?q=[CITY]&appid=[KEY]&units=metric
// so that is always the first request. OpenWeatherMap returns temperature,
// humidity, pressure, wind and visibility, but its current weather endpoint does
// not include a UV index. So:
//
//   1. Call OpenWeatherMap. If it answers, use it.
//   2. If a measurement is missing (usually UV, sometimes visibility), keep the
//      OpenWeatherMap values and fill the gap from Open-Meteo using the
//      coordinates OpenWeatherMap returned.
//   3. If OpenWeatherMap fails outright, geocode the city with Open-Meteo and
//      use its forecast endpoint on its own.
//
// The page always says which service the numbers came from, and the raw JSON
// is in the collapsible panel so the response can be checked by hand.
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

  // A separate storage key from the old provider, so a key saved in
  // an earlier session cannot be picked up by mistake.
  const STORAGE_KEY = "openWeatherMapApiKey";
  const OPEN_WEATHER_URL = "https://api.openweathermap.org/data/2.5/weather";
  const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
  const OPEN_METEO_GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
  const PLACEHOLDER_KEYS = ["", "YOUR_API_KEY", "YOUR_API_KEY_HERE"];

  function isPlaceholder(key) {
    return PLACEHOLDER_KEYS.indexOf(String(key || "").trim()) !== -1;
  }

  // Precedence: a key saved in Settings (localStorage) beats the one baked into
  // config.js, so the page can be tested with a different key without editing
  // any files. The placeholder is treated as "no key".
  function getApiKey() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && !isPlaceholder(stored)) return stored.trim();
    const cfg = (window.APP_CONFIG && window.APP_CONFIG.WEATHER_API_KEY) || "";
    if (!isPlaceholder(cfg)) return cfg.trim();
    return "";
  }

  function setApiKey(key) {
    localStorage.setItem(STORAGE_KEY, key.trim());
  }

  const currentKey = getApiKey();
  if (currentKey) els.apiKeyInput.value = currentKey;

  // Keep the "no key yet" banner up until there is actually a key to use.
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

  // City names are messier than they look: "São Paulo", "München",
  // "St. John's", "Washington, D.C.". Allow unicode letters plus spaces,
  // hyphens, apostrophes, dots and commas, and reject the rest before it ever
  // reaches the API.
  const CITY_PATTERN = /^[\p{L}][\p{L}\s'\-,.\u00C0-\u024F]*$/u;

  function validateCity(city) {
    if (!city) return "City name is required.";
    if (city.length < 2) return "City name must be at least 2 characters.";
    if (city.length > 60) return "City name must be 60 characters or fewer.";
    if (!CITY_PATTERN.test(city)) return "City name can only contain letters, spaces, hyphens, apostrophes, full stops or commas.";
    return "";
  }

  // APIs are inconsistent: a missing field can be undefined, null, a string or
  // NaN. Anything that is not a real number becomes null, and the render code
  // turns null into N/A.
  function numOrNull(v) {
    return (v == null || typeof v !== "number" || isNaN(v)) ? null : v;
  }

  // ------------------------------------------------------------------
  // OpenWeatherMap call - the URL from the brief, with units=metric
  // ------------------------------------------------------------------
  async function fetchWeather(city) {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error("No API key configured. Please save your OpenWeatherMap API key in Settings.");
    }
    const base = (window.APP_CONFIG && window.APP_CONFIG.WEATHER_BASE_URL) || OPEN_WEATHER_URL;
    const params = new URLSearchParams({
      q: city,
      appid: apiKey,
      units: "metric",
    });
    const url = `${base}?${params.toString()}`;
    const res = await fetch(url);
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      const msg = (data && data.message) ? data.message : ("HTTP " + res.status);
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    if (!data) throw new Error("Empty response from weather service.");
    if (String(data.cod) !== "200") {
      const err = new Error(data.message || "Weather service error.");
      err.status = Number(data.cod) || 0;
      throw err;
    }
    return data;
  }

  // ------------------------------------------------------------------
  // Open-Meteo - free, no key, and it has the UV index OpenWeatherMap lacks
  // ------------------------------------------------------------------
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Fetch wrapper for the Open-Meteo calls. Retries once after 750 ms because
  // their API occasionally hiccups, and tags errors with the service name so
  // the message on screen actually means something to the user.
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
    // current has the normal measurements. visibility and uv_index only exist
    // in the hourly block, so ask for one day of hourly data and pick the
    // current hour later. timezone=auto keeps that hour local to the city.
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

  // Only used when OpenWeatherMap failed, because then we have no coordinates
  // for Open-Meteo. It takes a city name and returns the best match.
  async function geocodeCity(city) {
    const params = new URLSearchParams({ name: city, count: "1", language: "en", format: "json" });
    const data = await fetchJson(`${OPEN_METEO_GEO_URL}?${params.toString()}`, "Location lookup");
    if (!data.results || data.results.length === 0) {
      throw new Error(`No location found for "${city}".`);
    }
    return data.results[0];
  }

  // ------------------------------------------------------------------
  // Normalising - both providers map to the same object shape, so the render
  // code below does not care where the numbers came from
  // ------------------------------------------------------------------

  // WMO code -> [label, emoji]. Open-Meteo sends the code number, not text.
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

  // 16-point compass. 360 / 16 = 22.5 degrees per sector, and the modulo keeps
  // 360 degrees wrapping back to N.
  function degToCompass(deg) {
    const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    return dirs[Math.round(deg / 22.5) % 16];
  }

  // Open-Meteo gives visibility and uv_index as hourly arrays, so the current
  // block does not include them. Match the observation time to the same
  // YYYY-MM-DDTHH slot. If that hour is missing take the next slot, and if we
  // are past the end of the array take the last one so something is returned.
  function hourlyValueIndex(hourly, isoTime) {
    if (!hourly || !Array.isArray(hourly.time) || !isoTime) return null;
    const key = String(isoTime).slice(0, 13); // YYYY-MM-DDTHH
    let idx = hourly.time.findIndex((t) => String(t).slice(0, 13) === key);
    if (idx < 0) idx = hourly.time.findIndex((t) => String(t) >= String(isoTime));
    if (idx < 0 && hourly.time.length) idx = hourly.time.length - 1;
    return idx >= 0 ? idx : null;
  }

  // OpenWeatherMap sends dt as Unix UTC seconds plus a timezone offset in
  // seconds. Shift the timestamp by the offset and read it back with UTC
  // getters, which gives the local clock time in the city without depending on
  // the visitor's own timezone.
  function formatLocalTime(unixSeconds, offsetSeconds) {
    if (unixSeconds == null) return "";
    const d = new Date((unixSeconds + (offsetSeconds || 0)) * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()) +
      " " + pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes());
  }

  // hint picks the parser: "openweathermap" or "open-meteo". Without it we
  // sniff the payload shape. place is only needed for Open-Meteo, because that
  // response has coordinates but no city name.
  function normalize(data, hint, place) {
    // OpenWeatherMap shape
    if (hint !== "open-meteo" && data && data.main && Array.isArray(data.weather)) {
      const w = data.weather[0] || {};
      const local = formatLocalTime(data.dt, data.timezone);
      return {
        source: "OpenWeatherMap",
        name: data.name || "Unknown",
        country: (data.sys && data.sys.country) || "",
        region: "",
        localtime: local,
        lat: numOrNull(data.coord && data.coord.lat),
        lon: numOrNull(data.coord && data.coord.lon),
        tempC: numOrNull(data.main.temp),
        feelsLikeC: numOrNull(data.main.feels_like),
        conditionText: w.description || "N/A",
        conditionEmoji: "",
        conditionIcon: w.icon ? `https://openweathermap.org/img/wn/${w.icon}@2x.png` : "",
        humidity: numOrNull(data.main.humidity),
        windKph: data.wind ? numOrNull(data.wind.speed * 3.6) : null,
        windDir: data.wind && data.wind.deg != null ? degToCompass(data.wind.deg) : "",
        pressureMb: numOrNull(data.main.pressure),
        visKm: data.visibility != null ? numOrNull(data.visibility / 1000) : null,
        uv: null,
        lastUpdated: local,
      };
    }
    // Open-Meteo shape
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
    // Unknown shape. Best effort: try the common field names, then give up.
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

  const MEASUREMENT_FIELDS = ["tempC", "feelsLikeC", "humidity", "windKph", "pressureMb", "visKm", "uv"];
  const FIELD_LABELS = {
    tempC: "temperature",
    feelsLikeC: "feels like temperature",
    humidity: "humidity",
    windKph: "wind speed",
    pressureMb: "pressure",
    visKm: "visibility",
    uv: "UV index",
  };

  function missingMeasurements(n) {
    return MEASUREMENT_FIELDS.filter((key) => n[key] == null);
  }

  // Start from the Open-Meteo values and overwrite with anything OpenWeatherMap
  // did give us. Name, country, condition and observation time stay from
  // OpenWeatherMap because it knows the city the user typed.
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
    merged.lastUpdated = primary.lastUpdated || supplement.lastUpdated;
    merged.source = "OpenWeatherMap + Open-Meteo (supplementary)";
    return merged;
  }

  // ------------------------------------------------------------------
  // Putting it together: OpenWeatherMap first, enrich if partial, fall back
  // ------------------------------------------------------------------
  async function loadWeather(city) {
    if (!getApiKey()) {
      throw new Error("No API key configured. Please save your OpenWeatherMap API key in Settings.");
    }

    let primary = null;
    let primaryError = null;

    try {
      primary = await fetchWeather(city);
      const n = normalize(primary, "openweathermap");
      if (n.tempC != null) {
        const missing = missingMeasurements(n);
        // UV is always missing from this endpoint, so normally we do make the
        // second call. If Open-Meteo is down we still return the OpenWeatherMap
        // data instead of throwing away a perfectly good response.
        if (missing.length && n.lat != null && n.lon != null) {
          try {
            const fb = await fetchOpenMeteo(n.lat, n.lon);
            const supplement = normalize(fb, "open-meteo", { name: n.name, country: n.country });
            const merged = mergeNormalized(n, supplement);
            return {
              data: primary,
              fbData: fb,
              n: merged,
              fallback: false,
              primaryOk: true,
              primaryData: primary,
              enriched: true,
              filledFields: missing.filter((key) => merged[key] != null),
            };
          } catch (fbErr) {
            return {
              data: primary,
              n,
              fallback: false,
              primaryOk: true,
              primaryData: primary,
              missingFields: missing,
              enrichmentError: fbErr.message,
            };
          }
        }
        return {
          data: primary,
          n,
          fallback: false,
          primaryOk: true,
          primaryData: primary,
          missingFields: missing,
        };
      }
      primaryError = new Error("OpenWeatherMap returned no temperature for this location.");
    } catch (e) {
      primaryError = e;
    }

    // OpenWeatherMap is unusable. Geocode the city and use Open-Meteo on its
    // own. A 404 here usually means the city name is wrong, but Open-Meteo's
    // location database is different, so give it a chance before giving up.
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
      if (primaryError && primaryError.status === 404) {
        throw new Error(`No city found named "${city}".`);
      }
      throw new Error(
        (primaryError ? primaryError.message + " " : "") + "Fallback also failed: " + fbErr.message
      );
    }
  }

  // ------------------------------------------------------------------
  // Rendering - nothing below here talks to the network
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

    // Say which service this is. Hiding a fallback would make the page look
    // like OpenWeatherMap worked when it did not.
    let notice = "";
    if (result.fallback) {
      const why = "OpenWeatherMap request failed" + (result.reason ? " (" + result.reason + ")" : "");
      notice = `<div class="mb-4 px-4 py-3 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 text-sm font-medium">
           ${escapeHtml(why)} - showing fallback data from Open-Meteo.
         </div>`;
    } else if (result.enriched && result.filledFields && result.filledFields.length) {
      const labels = result.filledFields.map((key) => FIELD_LABELS[key] || key);
      const list = labels.length === 1
        ? labels[0]
        : labels.slice(0, -1).join(", ") + " and " + labels[labels.length - 1];
      const verb = labels.length === 1 ? "that value is" : "those values are";
      notice = `<div class="mb-4 px-4 py-3 rounded-lg bg-blue-50 text-blue-800 border border-blue-200 text-sm font-medium">
           OpenWeatherMap does not return ${escapeHtml(list)} in its current weather response, so ${verb} filled from Open-Meteo.
         </div>`;
    } else if (result.missingFields && result.missingFields.length) {
      notice = `<div class="mb-4 px-4 py-3 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 text-sm font-medium">
           The weather service did not return every measurement for this location, so some details are shown as N/A.
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

    // Raw panel: when we merged, show both payloads so the split is obvious.
    // Otherwise show the response that produced the numbers on screen.
    const rawPanels = [];
    const rawPre = (obj) =>
      `<pre class="mt-1 text-xs bg-slate-100 p-3 rounded-lg overflow-x-auto">${escapeHtml(JSON.stringify(obj, null, 2))}</pre>`;

    if (result.primaryData && (result.enriched || result.fallback)) {
      rawPanels.push(
        `<p class="mt-3 text-xs font-semibold text-slate-500">OpenWeatherMap response (required endpoint):</p>` +
        rawPre(result.primaryData)
      );
    }
    if (result.enriched) {
      rawPanels.push(
        `<p class="mt-3 text-xs font-semibold text-slate-500">Open-Meteo supplementary response:</p>` +
        rawPre(result.fbData)
      );
    } else if (result.fallback) {
      rawPanels.push(
        `<p class="mt-3 text-xs font-semibold text-slate-500">Open-Meteo fallback response:</p>` +
        rawPre(data)
      );
    } else {
      rawPanels.push(
        `<p class="mt-3 text-xs font-semibold text-slate-500">OpenWeatherMap response:</p>` +
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

  // Menu toggle is inline in weather.html for the same reason as products.js:
  // two listeners toggling the same class cancel each other out.
})();
