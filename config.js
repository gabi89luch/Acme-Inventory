// Front-end config.
// WEATHER_API_KEY is the key used for the required WeatherAPI request. Grab one
// at https://www.weatherapi.com/signup.aspx
// Anything typed into the Settings panel on the weather page is saved to
// localStorage and wins over this value, which is handy for testing a different
// key without editing the file.
window.APP_CONFIG = {
  WEATHER_API_KEY: "5e1fe2730b3a42e889f180735261211",
  WEATHER_BASE_URL: "https://api.weatherapi.com/v1/current.json"
};
