// Weather page.
//
// One GET request to OpenWeatherMap, as Section 2 of the brief asks, plus a
// quick geocoding lookup so a repeated name like Dublin does not land in the
// wrong country.
(function () {
  "use strict";

  const form = document.getElementById("weatherForm");
  const cityInput = document.getElementById("cityInput");
  const weatherBtn = document.getElementById("weatherBtn");
  const formError = document.getElementById("formError");
  const resultCard = document.getElementById("resultCard");
  const loading = document.getElementById("loading");
  const weatherResult = document.getElementById("weatherResult");
  const weatherError = document.getElementById("weatherError");
  const apiKeyInput = document.getElementById("apiKeyInput");
  const saveKeyBtn = document.getElementById("saveKeyBtn");
  const keyNotice = document.getElementById("keyNotice");

  const STORAGE_KEY = "openWeatherMapApiKey";
  const WEATHER_URL = "https://api.openweathermap.org/data/2.5/weather";
  const GEO_URL = "https://api.openweathermap.org/geo/1.0/direct";
  const PLACEHOLDERS = ["", "YOUR_API_KEY", "YOUR_API_KEY_HERE"];

  // Saved key first, then config.js. The placeholder counts as no key.
  function getKey() {
    const saved = (localStorage.getItem(STORAGE_KEY) || "").trim();
    if (saved && PLACEHOLDERS.indexOf(saved) === -1) return saved;
    const config = ((window.APP_CONFIG && window.APP_CONFIG.WEATHER_API_KEY) || "").trim();
    return PLACEHOLDERS.indexOf(config) === -1 ? config : "";
  }

  function refreshKeyNotice() {
    if (keyNotice) keyNotice.hidden = !!getKey();
  }

  if (getKey()) apiKeyInput.value = getKey();
  refreshKeyNotice();

  saveKeyBtn.addEventListener("click", () => {
    const key = apiKeyInput.value.trim();
    if (!key) return showFormError("Please enter an API key.");
    localStorage.setItem(STORAGE_KEY, key);
    showFormError("");
    refreshKeyNotice();
  });

  function showFormError(message) {
    formError.hidden = !message;
    formError.textContent = message || "";
  }

  const CITY_PATTERN = /^[\p{L}][\p{L}\s'\-,.\u00C0-\u024F]*$/u;

  function validateCity(city) {
    if (!city) return "City name is required.";
    if (city.length < 2) return "City name must be at least 2 characters.";
    if (city.length > 60) return "City name must be 60 characters or fewer.";
    if (!CITY_PATTERN.test(city)) return "City name can only contain letters, spaces, hyphens, apostrophes, full stops or commas.";
    return "";
  }

  // The weather endpoint reads a bare "Dublin" as Dublin, California. The
  // geocoder ranks the same name better, so we use its first match and send the
  // weather request as q=Dublin,IE. US results need the state code because
  // q=Dublin,OH alone is rejected.
  const US_STATES = {
    ALABAMA: "AL", ALASKA: "AK", ARIZONA: "AZ", ARKANSAS: "AR", CALIFORNIA: "CA",
    COLORADO: "CO", CONNECTICUT: "CT", DELAWARE: "DE", "DISTRICT OF COLUMBIA": "DC",
    FLORIDA: "FL", GEORGIA: "GA", HAWAII: "HI", IDAHO: "ID", ILLINOIS: "IL",
    INDIANA: "IN", IOWA: "IA", KANSAS: "KS", KENTUCKY: "KY", LOUISIANA: "LA",
    MAINE: "ME", MARYLAND: "MD", MASSACHUSETTS: "MA", MICHIGAN: "MI",
    MINNESOTA: "MN", MISSISSIPPI: "MS", MISSOURI: "MO", MONTANA: "MT",
    NEBRASKA: "NE", NEVADA: "NV", "NEW HAMPSHIRE": "NH", "NEW JERSEY": "NJ",
    "NEW MEXICO": "NM", "NEW YORK": "NY", "NORTH CAROLINA": "NC",
    "NORTH DAKOTA": "ND", OHIO: "OH", OKLAHOMA: "OK", OREGON: "OR",
    PENNSYLVANIA: "PA", "RHODE ISLAND": "RI", "SOUTH CAROLINA": "SC",
    "SOUTH DAKOTA": "SD", TENNESSEE: "TN", TEXAS: "TX", UTAH: "UT",
    VERMONT: "VT", VIRGINIA: "VA", WASHINGTON: "WA", "WEST VIRGINIA": "WV",
    WISCONSIN: "WI", WYOMING: "WY",
  };

  const COUNTRY_ALIASES = { UK: "GB", USA: "US", "UNITED STATES": "US" };

  function stateCode(state) {
    return US_STATES[String(state || "").toUpperCase()] || "";
  }

  function countryName(code) {
    try {
      return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || "";
    } catch (e) {
      return "";
    }
  }

  // Returns the most specific q value we can build. If anything fails, the
  // typed text goes to the weather request unchanged.
  async function resolveCity(city) {
    const parts = city.split(",").map((part) => part.trim()).filter(Boolean);
    const key = getKey();
    if (!key || !parts.length) return city;

    try {
      const params = new URLSearchParams({ q: parts[0], limit: "5", appid: key });
      const res = await fetch(`${GEO_URL}?${params.toString()}`);
      if (!res.ok) return city;
      const list = await res.json();
      if (!Array.isArray(list) || !list.length) return city;

      const filters = parts.slice(1).map((part) => part.toUpperCase().replace(/\./g, ""));
      const match = list.find((place) => {
        const names = [
          place.country,
          countryName(place.country),
          place.state,
          stateCode(place.state),
        ].filter(Boolean).map((value) => String(value).toUpperCase());
        return filters.every((filter) => names.indexOf(COUNTRY_ALIASES[filter] || filter) !== -1);
      });
      if (!match) return city;

      return [match.name, stateCode(match.state), match.country].filter(Boolean).join(",");
    } catch (e) {
      return city;
    }
  }

  async function getWeather(city) {
    const key = getKey();
    if (!key) throw new Error("No API key configured. Add one in API Key Settings.");

    const query = await resolveCity(city);
    const params = new URLSearchParams({ q: query, appid: key, units: "metric" });
    const base = (window.APP_CONFIG && window.APP_CONFIG.WEATHER_BASE_URL) || WEATHER_URL;
    const res = await fetch(`${base}?${params.toString()}`);
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }

    if (!res.ok || !data || String(data.cod) !== "200") {
      throw new Error((data && data.message) || `Request failed with HTTP ${res.status}.`);
    }
    return data;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function render(data) {
    const main = data.main || {};
    const wind = data.wind || {};
    const weather = (data.weather && data.weather[0]) || {};
    const icon = weather.icon ? `https://openweathermap.org/img/wn/${weather.icon}@2x.png` : "";
    const fmt = (value, suffix) => (value == null ? "N/A" : Math.round(value) + (suffix || ""));
    const windText = wind.speed == null ? "N/A" : Math.round(wind.speed * 3.6) + " km/h";
    const stat = (label, value) => `
      <div class="bg-slate-50 rounded-xl p-4 border border-slate-200">
        <div class="text-xs uppercase tracking-wide text-slate-500">${escapeHtml(label)}</div>
        <div class="font-semibold text-slate-800">${value}</div>
      </div>`;

    weatherResult.innerHTML = `
      <div class="rounded-2xl bg-gradient-to-br from-brand-600 to-indigo-800 text-white p-6 flex items-center gap-6">
        ${icon ? `<img src="${escapeHtml(icon)}" alt="" class="w-24 h-24">` : ""}
        <div>
          <div class="text-sm uppercase tracking-widest text-blue-200">${escapeHtml(data.name)}, ${escapeHtml(data.sys && data.sys.country)}</div>
          <div class="text-6xl font-extrabold mt-1">${fmt(main.temp, "°C")}</div>
          <div class="text-xl text-blue-100 capitalize">${escapeHtml(weather.description || "N/A")}</div>
          <div class="text-sm text-blue-200">Feels like ${fmt(main.feels_like, "°C")}</div>
        </div>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6">
        ${stat("Humidity", fmt(main.humidity, "%"))}
        ${stat("Wind", escapeHtml(windText))}
        ${stat("Pressure", fmt(main.pressure, " mb"))}
        ${stat("Visibility", data.visibility == null ? "N/A" : fmt(data.visibility / 1000, " km"))}
      </div>`;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const city = cityInput.value.trim().replace(/\s+/g, " ");
    const error = validateCity(city);
    if (error) {
      showFormError(error);
      cityInput.focus();
      return;
    }

    showFormError("");
    resultCard.hidden = false;
    loading.hidden = false;
    weatherResult.innerHTML = "";
    weatherError.hidden = true;
    weatherBtn.disabled = true;

    try {
      render(await getWeather(city));
    } catch (e) {
      weatherError.hidden = false;
      weatherError.textContent = "Could not retrieve weather: " + e.message;
    } finally {
      loading.hidden = true;
      weatherBtn.disabled = false;
    }
  });
})();
