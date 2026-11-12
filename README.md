# Part A - Web Application

Web application for the H6WAD Continuous Assessment (Part A).

## Structure
- `index.html` - Product Inventory page (XML technology, Section 1)
- `products.xml` - XML product data (12 products)
- `products.xsd` - XML Schema formally defining the structure and data types
- `products.js` - XML parsing & rendering; search by product code using XPath
- `products-fallback.js` - embedded copy of `products.xml`, used only when the
  page is opened directly via `file://`
- `weather.html` - Weather page (JSON technology, Section 2)
- `weather.js` - Fetches weather data from WeatherAPI and renders it
- `config.js` - Configuration (API key)
- `favicon.svg` - Browser tab icon
- `images/` - Category and hero images

## Running
Serve the folder with any static HTTP server, e.g.:
```
python3 -m http.server 8000
```
Then open http://localhost:8000

Opening `index.html` directly from disk (`file://`) also works: browsers block
`fetch()` of local files, so `products.js` automatically falls back to the
embedded copy in `products-fallback.js`. Serving over HTTP is still preferred,
because it reads `products.xml` directly.

If you edit `products.xml`, regenerate the embedded copy:

```
python3 -c "x=open('products.xml').read(); open('products-fallback.js','w').write('window.PRODUCTS_XML_FALLBACK = `'+x+'`;\n')"
```

## Weather API key
1. Register for a free key at https://www.weatherapi.com/signup.aspx
2. Open the Weather page -> "API Key Settings" -> paste key -> Save
   (or set `WEATHER_API_KEY` in `config.js`)

The app makes a GET request to:
`https://api.weatherapi.com/v1/current.json?key=[YOUR_API_KEY]&q=[CITY]`
as required by the brief.

If WeatherAPI returns a complete response it is used on its own. If the key is
restricted and the response omits measurements (some keys return only rain/snow
probabilities), the missing fields are filled from Open-Meteo using the
coordinates WeatherAPI reported. Open-Meteo supplies visibility and UV index
from its hourly series, so every card is populated. If the WeatherAPI request
fails entirely, the app falls back to Open-Meteo and geocodes the city name.
The data source is always labelled, and both raw JSON responses are visible
under "Show raw JSON response".

## Implementation notes
- The XML is parsed with `DOMParser`, including a `parsererror` check and
  per-product validation of data types (code format `###-##`, integer quantity
  >= 0, decimal unit price >= 0.00).
- Searching by product code uses an **XPath** query
  (`//product[@code="..."]`) against the loaded XML document.
- All rendered data is HTML-escaped; status and error messages use
  `aria-live` regions for screen-reader users.
