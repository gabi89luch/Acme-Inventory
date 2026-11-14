// Front-end config.
// WEATHER_API_KEY is the key used for the required OpenWeatherMap request. Grab
// one at https://home.openweathermap.org/users/sign_up
// Anything typed into the Settings panel on the weather page is saved to
// localStorage and wins over this value, which is handy for testing a different
// key without editing the file.
window.APP_CONFIG = {
  WEATHER_API_KEY: "41a3d1d0734d12fbc4464c70cb4562f1",
  WEATHER_BASE_URL: "https://api.openweathermap.org/data/2.5/weather"
};
