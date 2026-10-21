# Twin Cities Transit Atlas

An interactive Web GIS application that maps public transport in **Islamabad and Rawalpindi, Pakistan**. It retrieves live data from free public APIs with JavaScript `fetch()` and displays it on a Leaflet map.

**Live demo:** https://twincitiestransit.vercel.app/

> Course: Web GIS Application, Assignment No. 2 (API-Based Web GIS Application)
> Topic: Public transport and mobility
> Author: Sheikh Murtaza bin Abbas (FA23-BRG-052)

## Features

- Live data for bus stops, Metrobus stations, bus terminals, railway stations and taxi stands
- Vehicle-icon markers with clustering, plus a collapsible legend with counts
- Filter by area (Islamabad or Rawalpindi) and by stop type; counts update as you filter
- Search with live suggestions as you type, keyboard navigation, and zoom-to-stop
- Details panel for each stop: all mapped attributes, nearest stops, directions and a link to the OpenStreetMap record
- "Near me" and distance from your location to any stop, with road distance, drive time and a route drawn on the map
- Optional Metrobus line and all-bus-routes layers
- Three basemaps: Streets, Satellite and Terrain
- Live clock (Pakistan time) and live cursor coordinates
- Loading states, automatic retries, error messages and a saved-data fallback
- Responsive layout for desktop and mobile

## APIs used

All services are free and public. No API key is needed, so no secrets are stored in this repository.

| Service | Purpose | Notes |
|---|---|---|
| [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) | Transport features from OpenStreetMap | Several public instances are queried at once and the first answer wins |
| [OSRM public demo server](https://project-osrm.org) | Road distance, drive time and route geometry | Used only for the distance feature |
| OpenStreetMap, Esri and OpenTopoMap tiles | Basemaps | Attribution is shown in the footer |

### Data fields

Overpass returns JSON with an `elements` array. Each element has an `id`, a `type` (`node` or `way`), coordinates (`lat` and `lon`, or `center` for areas) and a `tags` object.

| Tag | Meaning | Used for |
|---|---|---|
| `highway=bus_stop` | Bus stop | Bus stop category |
| `amenity=bus_station` | Bus terminal | Bus terminal category |
| `railway=station` or `halt` | Railway station | Railway category |
| `amenity=taxi` | Taxi stand | Taxi category |
| `name`, `name:en` | Place name | Search and titles |
| `network`, `operator` | Network or operator, for example Metro | Metrobus classification |
| `ref`, `route_ref` | Reference number and routes served | Details panel |
| `shelter`, `bench`, `bin`, `lit`, `wheelchair`, `opening_hours` | Amenities and access | Details panel |
| `addr:city` | Address city | City assignment when present |

OSRM returns `routes[0].distance` (metres), `routes[0].duration` (seconds) and `routes[0].geometry` (GeoJSON line).

## How it works

1. On load, the app sends one Overpass query for the study-area bounding box (33.45–33.80°N, 72.80–73.25°E) using `fetch()`.
2. The JSON response is parsed. Each element is classified into a stop type from its tags and assigned to Islamabad or Rawalpindi.
3. Features are drawn as clustered Leaflet markers with vehicle icons.
4. Selecting a feature opens the details panel and, if location is available, requests road distance from OSRM.
5. Filters and search re-render the map from the in-memory list, so interaction needs no further API calls.
6. A copy of the data is kept in the browser's `localStorage`, so the map still loads if the public servers are busy.

## Project structure

```
index.html   page structure, header, sidebar, footer
style.css    all styling, including the responsive layout
app.js       API calls, data processing, map and interface logic
README.md    this file
```

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
- The Islamabad and Rawalpindi split is approximate. It uses the `addr:city` tag when present, otherwise a dividing line.
- Public Overpass and OSRM servers can be slow or busy. The app retries and falls back to saved data, but the first load with no saved copy needs a working connection.
- Road distance and time are estimates by car from the OSRM demo server, not by bus.

## Attribution

- Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the ODbL
- Satellite tiles © Esri, terrain tiles © OpenTopoMap (CC-BY-SA)
- Built with [Leaflet](https://leafletjs.com) and [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster)
- Routing by [OSRM](https://project-osrm.org)
