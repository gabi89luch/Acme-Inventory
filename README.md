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
- `weather.js` - Fetches weather data from OpenWeatherMap and renders it
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
1. Register for a free key at https://home.openweathermap.org/users/sign_up
2. Open the Weather page -> "API Key Settings" -> paste key -> Save
   (or set `WEATHER_API_KEY` in `config.js`)

New OpenWeatherMap keys can take a few minutes to activate. If the page says
the key is invalid, wait a little and try again.

The app makes a GET request to:
`https://api.openweathermap.org/data/2.5/weather?q=[CITY]&appid=[YOUR_API_KEY]&units=metric`
as required by the brief.

Before that request, the name is looked up with OpenWeatherMap's geocoding
endpoint so repeated names pick the right place. A bare "Dublin" would otherwise
come back as Dublin, California, so the lookup turns it into `q=Dublin,IE`. US
results use the two letter state code (`q=Dublin,OH,US`). If the lookup fails,
the typed text is used unchanged and the required request still happens. The
search box accepts a country or state as well, for example `Dublin, IE` or
`Dublin, Ohio`.

OpenWeatherMap is the only weather service used. The page renders temperature,
feels like, condition, humidity, wind, pressure and visibility from the JSON
response. If the request fails, the error message is shown on the page.

## Implementation notes
- The XML is parsed with `DOMParser`, including a `parsererror` check and
  per-product validation of data types (code format `###-##`, integer quantity
  >= 0, decimal unit price >= 0.00).
- Searching by product code uses an **XPath** query
  (`//product[@code="..."]`) against the loaded XML document.
- All rendered data is HTML-escaped; status and error messages use
  `aria-live` regions for screen-reader users.
