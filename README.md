# Rajasthan Bhunaksha Khasra Batch Tool

This project fetches Khasra-wise land details from Rajasthan Bhunaksha and turns them into structured files that can be opened in spreadsheets, Google My Maps, and Google Earth.

Source site:

```text
https://bhunaksha.rajasthan.gov.in/Viewmap/
```

The tool currently supports Rajasthan state code `08`.

## What It Does

For a selected village/sheet, it can fetch details for one Khasra, a list of Khasras, or a numeric range.

For every found Khasra, it extracts:

- Khasra number
- Owner details
- Area in hectare
- Khata number
- GIS code
- Plot ID
- Map center
- Map extent
- Raw Bhunaksha response

It also converts Bhunaksha map coordinates into latitude/longitude, so the data can be used in:

- Google My Maps
- Google Earth
- GIS tools that support CSV, GeoJSON, or KML

## Requirements

Install Node.js 18 or newer.

Check:

```bash
node --version
```

No npm dependency install is required.

## Recommended Run: Interactive Mode

Run:

```bash
npm run run
```

The script will ask for:

- State code
- District code
- Tehsil code
- RI code
- Halka code
- Village code
- Sheet number
- Khasra input mode
- Output folder
- Output file prefix

You can choose one of three Khasra input modes:

1. Range scan, for example `1` to `5000`
2. Comma-separated list, for example `1,2,3`
3. File path, one Khasra per line

Default location values are set to:

```text
State    : 08 Rajasthan
District : 18
Tehsil   : 092
RI       : 1867
Halka    : 07470
Village  : 29055
Sheet No : 001
```

The interactive run writes all output files into the folder you choose.

## Output Files

For an output prefix like `mendakwas-khasra`, the tool generates:

```text
mendakwas-khasra.csv
mendakwas-khasra.json
mendakwas-khasra-google-map-points.csv
mendakwas-khasra-points.geojson
mendakwas-khasra-bounding-boxes.geojson
mendakwas-khasra-google-earth-points.kml
```

Main files:

- `*.csv`: full tabular Khasra details
- `*.json`: full structured data
- `*-google-map-points.csv`: import this into Google My Maps
- `*-points.geojson`: point layer for GIS tools
- `*-bounding-boxes.geojson`: approximate rectangles from Bhunaksha extents
- `*-google-earth-points.kml`: open this directly in Google Earth

Important: the tool can draw center points and approximate bounding boxes. Exact parcel boundaries need actual polygon geometry from Bhunaksha, which is not present in the detail response we are using.

## Google My Maps

1. Open [Google My Maps](https://www.google.com/mymaps)
2. Create a new map
3. Click **Import**
4. Upload:

```text
*-google-map-points.csv
```

5. Select location columns:

```text
latitude
longitude
```

6. Select marker title:

```text
khasra
```

Each marker will show owner, area, khata number, and GIS code.

## Google Earth

Use the KML file:

```text
*-google-earth-points.kml
```

### Google Earth Web

1. Open [Google Earth](https://earth.google.com/web/)
2. Open **Projects**
3. Click **New project**
4. Choose **Import KML file from computer**
5. Select the generated `*-google-earth-points.kml`

### Google Earth Pro

1. Open Google Earth Pro
2. Go to **File > Open**
3. Select the generated `*-google-earth-points.kml`

Google Earth is useful because you can inspect the Khasra points along with satellite imagery, roads, terrain, rivers, water paths, and nearby land context.

## Non-Interactive Batch Commands

Fetch a fixed list:

```bash
npm run batch -- --khasras 1,2,3 --out outputs/khasra.csv --json-out outputs/khasra.json
```

Fetch from a file:

```bash
npm run batch -- --file khasras.txt --out outputs/khasra.csv --json-out outputs/khasra.json
```

Fetch a range slowly and stop after a long missing tail:

```bash
npm run batch -- \
  --levels 18,092,1867,07470,29055,001 \
  --from 1 \
  --to 5000 \
  --delay-ms 2000 \
  --retries 2 \
  --retry-delay-ms 7000 \
  --stop-after-misses 200 \
  --out outputs/all-khasra.csv \
  --json-out outputs/all-khasra.json
```

Generate map files from an existing JSON:

```bash
npm run export-map -- \
  outputs/all-khasra.json \
  outputs/all-khasra-google-map-points.csv \
  outputs/all-khasra-points.geojson \
  outputs/all-khasra-bounding-boxes.geojson \
  outputs/all-khasra-google-earth-points.kml
```

## Location Codes

Bhunaksha needs six location levels:

```text
districtCode,tehsilCode,riCode,halkaCode,villageCode,sheetNo
```

Example:

```text
18,092,1867,07470,29055,001
```

The tool sends this to Bhunaksha as:

```text
18,092,1867,07470,29055,001,
```

The trailing comma is expected by the Bhunaksha endpoint.

## Reliability Notes

The Rajasthan Bhunaksha website can be slow and sometimes returns temporary failures like HTTP 502/503. The batch runner is intentionally slow and supports retries.

Useful options:

```text
--delay-ms 2000
--retries 2
--retry-delay-ms 7000
--stop-after-misses 200
```

For large village scans, keep the delay conservative.

## Existing API Server

The project also includes a small local API server:

```bash
npm start
```

Default URL:

```text
http://127.0.0.1:3000
```

Single Khasra lookup:

```bash
curl 'http://127.0.0.1:3000/api/khasra/detail?levels=18,092,1867,07470,29055,001,&plotno=1'
```

The interactive batch mode is usually easier for normal use.
