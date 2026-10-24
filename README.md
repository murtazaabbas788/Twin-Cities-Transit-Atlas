# Twin Cities Transit Atlas

An interactive Web GIS application that maps public transport in **Islamabad and Rawalpindi, Pakistan**. It retrieves live data from free public APIs with JavaScript `fetch()` and displays it on a Leaflet map.

**Live demo:** https://twincitiestransit.vercel.app/

> Course: Web GIS Application, Assignment No. 2 (API-Based Web GIS Application)
> Topic: Public transport and mobility
> Author: Sheikh Murtaza bin Abbas (FA23-BRG-052)

## Features

- Live data for bus stops, Metrobus stations, bus terminals, railway stations and taxi stands
- Vehicle-icon markers with clustering, plus a collapsible legend
- Filter by area (Islamabad or Rawalpindi) and by stop type; counts update as you filter
- Search with live suggestions as you type, keyboard navigation, and zoom-to-stop
- Details panel for each stop: all mapped attributes, the four nearest stops, and links to Google Maps directions and the OpenStreetMap record
- "Near me" and distance from your location to any stop, with road distance, drive time and a route drawn on the map
- **Get directions** opens Google Maps from your current location to the selected stop
- **Refresh button** in the header: fetches fresh data from the live API and reports how many stops were added or removed
- **Buffer tool:** pick a point (or use your location), choose 500 m to 10 km, and see how many stops fall inside the circle, split by type. The centre can be dragged
- **Data check:** counts of named stops, stops with amenity details and possible duplicates, with a link to verify the count on Overpass Turbo and a button to download the data as `stops.json`
- Optional Metrobus line and all-bus-routes layers
- Three basemaps: Streets, Satellite and Terrain
- Live clock (Pakistan time) and live cursor coordinates in the footer
- Loading banner, automatic retries, error messages with a retry button, and a saved-data fallback
- Responsive layout for desktop and mobile; the sidebar is closed by default

## APIs used

All services are free and public. No API key is needed, so no secrets are stored in this repository.

| Service | Purpose | Notes |
|---|---|---|
| [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) | Transport features from OpenStreetMap | Four public instances are queried at once and the first complete answer wins |
| [OSRM public demo server](https://project-osrm.org) | Road distance, drive time and route geometry | Used only for the distance feature |
| OpenStreetMap, Esri and OpenTopoMap tiles | Basemaps | Attribution is shown in the footer |
| Google Maps URL | Directions | A plain link, no API or key. It opens Google Maps with the stop as the destination |

### The query

One Overpass request covers the study area (33.45–33.80°N, 72.80–73.25°E):

```
[out:json][timeout:25];
(
  node["highway"="bus_stop"](bbox);
  nwr["amenity"="bus_station"](bbox);
  nwr["public_transport"~"^(platform|station)$"]["bus"="yes"](bbox);
  nwr["railway"~"^(station|halt)$"](bbox);
  node["amenity"="taxi"](bbox);
);
out tags center;
```

### Data fields

Overpass returns JSON with an `elements` array. Each element has an id, a type (`node` or `way`), coordinates (`lat` and `lon`, or `center` for areas) and a `tags` object.

| Tag | Meaning | Used for |
|---|---|---|
| `highway=bus_stop` | Bus stop | Bus stop category |
| `amenity=bus_station` | Bus terminal | Bus terminal category |
| `public_transport=platform` or `station` with `bus=yes` | Platform or station for buses | Bus stop or terminal category |
| `railway=station` or `halt` | Railway station | Railway category |
| `amenity=taxi` | Taxi stand | Taxi category |
| `name`, `name:en` | Place name | Search and titles |
| `network`, `operator` | Network or operator, for example Metro | Metrobus classification |
| `trolleybus=yes` | Tag used on Metrobus platforms | Metrobus classification |
| `ref`, `route_ref` | Reference number and routes served | Details panel, and numbered Metrobus stations |
| `shelter`, `bench`, `bin`, `lit`, `wheelchair`, `opening_hours` | Amenities and access | Details panel |
| `addr:city` | Address city | City assignment when present |

OSRM returns `routes[0].distance` (metres), `routes[0].duration` (seconds) and `routes[0].geometry` (GeoJSON line).

## How it works

1. On load, the app looks for saved data: first in the browser (`localStorage`), then in `stops.json` in this repository. If found, it is shown at once.
2. If there is no saved data, the app sends the Overpass query with `fetch()` to four public servers at the same time. Incomplete answers (a server that ran out of time) are rejected, and failed requests are retried.
3. If the saved data is more than a day old, the app refreshes it from the live API in the background.
4. The JSON response is parsed. Each element is classified into a stop type from its tags and assigned to Islamabad or Rawalpindi.
5. Features are drawn as clustered Leaflet markers with vehicle icons.
6. Selecting a feature opens the details panel and, if location is available, requests road distance from OSRM.
7. Filters, search and the buffer tool re-draw the map from the in-memory list, so they need no further API calls.
8. The Refresh button repeats the live request on demand and shows what changed.

## Project structure

```
index.html   page structure, header, sidebar, footer
style.css    all styling, including the responsive layout
app.js       API calls, data processing, map and interface logic
stops.json   saved snapshot of the stop data, for an instant first load
README.md    this file
```

Optional files `routes-metro.json` and `routes-all.json` can hold saved copies of the bus route data.

## Fast first load

The app shows data in this order: a copy saved in the browser, then `stops.json`, then the live Overpass API. To regenerate the snapshot, open the sidebar, go to **Data check** and click **Download data copy (stops.json)**, then commit the file to the repository root. Visiting the site with `?snapshot` at the end of the address also downloads the data files.

## Run locally

Any static server works. For example:

```bash
python -m http.server 8000
```

Then open http://localhost:8000. With VS Code, the Live Server extension also works.

## Deployment

The live demo is hosted on [Vercel](https://vercel.com) and deploys straight from this repository, with no build step. To deploy your own copy:

1. Import the repository on Vercel, leave the framework preset as **Other** and the build command empty, then click **Deploy**.
2. Alternatively, use **GitHub Pages**: open **Settings, then Pages**, choose **Deploy from a branch**, select **main** and **/ (root)**, and save.

Both options serve the site over HTTPS, which the location features need.

## Limitations

- Data depends on volunteer mapping in OpenStreetMap. Some stops are unnamed or lack attributes, and this is not an official timetable.
- Bus route lines are thin, because few routes are mapped.
- The Islamabad and Rawalpindi split is approximate. It uses the `addr:city` tag when present, otherwise a dividing line.
- Public Overpass and OSRM servers can be slow or busy. The app retries and falls back to saved data. Without `stops.json` in the repository, a first visit with no saved copy needs a working connection.
- The saved snapshot can be older than the live data until it is refreshed. Use the Refresh button to update it.
- Road distance and time are estimates by car from the OSRM demo server, not by bus.

## Attribution

- Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the ODbL
- Satellite tiles © Esri, terrain tiles © OpenTopoMap (CC-BY-SA)
- Built with [Leaflet](https://leafletjs.com) and [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster)
- Routing by [OSRM](https://project-osrm.org)
