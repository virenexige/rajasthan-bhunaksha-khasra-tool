# Rajasthan Bhunaksha Khasra Tool

A Node.js command-line tool to fetch Rajasthan Bhunaksha Khasra details in batch and generate spreadsheet, Google My Maps, Google Earth, and GeoJSON outputs.

Source website:

```text
https://bhunaksha.rajasthan.gov.in/Viewmap/
```

The tool is designed for village-level Khasra lookup where manual searching on the Bhunaksha website is slow and repetitive.

## Project Structure

```text
rajasthan-bhunaksha-khasra-tool/
├── src/
│   ├── interactive-run.js      # Guided CLI workflow
│   ├── batch-khasra.js         # Batch fetcher
│   ├── bhunaksha-client.js     # Bhunaksha request/parser logic
│   ├── export-map-files.js     # CSV, GeoJSON, KML map export
│   └── server.js               # Optional local API server
├── inputs/
│   └── khasras.txt             # Example Khasra input file
├── outputs/                    # Generated run output, ignored by Git
├── package.json
└── README.md
```

`outputs/` is intentionally ignored by Git because the generated files can become large.

## What It Fetches

For every found Khasra, the batch output includes:

- Khasra number
- Owner details
- Area in hectare
- Khata number
- GIS code
- Plot ID
- Projected map center and extent
- Raw Bhunaksha response
- Error status for missing/failed records

The map export also converts Bhunaksha projected coordinates to latitude/longitude for Google tools.

## Run The Guided Workflow

Use this for normal use:

```bash
npm run run
```

It asks for:

- State code
- District code
- Tehsil code
- RI code
- Halka code
- Village code
- Sheet number
- Khasra input mode
- Output root folder
- Run name

Default location values are currently set to:

```text
State    : 08 Rajasthan
District : 18
Tehsil   : 092
RI       : 1867
Halka    : 07470
Village  : 29055
Sheet No : 001
```

## Output Folder Structure

Every guided run creates a new folder using this pattern:

```text
outputs/<run-name>/<yyyy-mm-dd>/
├── csv/
│   └── <run-name>.csv
├── json/
│   └── <run-name>.json
└── maps/
    ├── <run-name>-google-map-points.csv
    ├── <run-name>-google-earth-points.kml
    ├── <run-name>-points.geojson
    └── <run-name>-bounding-boxes.geojson
```

Example:

```text
outputs/mendakwas-khasra/2026-06-26/
```

Each run for the same project and date writes into the same date folder. Change the run name if you want a separate folder on the same day.

## Input Modes

The guided workflow supports three modes.

### 1. Range Scan

Example: scan `1` to `5000`, slowly, and stop after a long missing tail.

Useful when you want to discover all available Khasra records for a village.

### 2. Comma-Separated List

Example:

```text
1,2,3,10,15
```

Useful when you only need specific Khasras.

### 3. File Input

Create a file like:

```text
inputs/khasras.txt
```

With one Khasra per line:

```text
1
2
3
```

Then select file input mode and provide the file path.

## Non-Interactive Commands

Fetch a specific list:

```bash
npm run batch -- \
  --levels 18,092,1867,07470,29055,001 \
  --khasras 1,2,3 \
  --out outputs/manual/example.csv \
  --json-out outputs/manual/example.json
```

Fetch from a file:

```bash
npm run batch -- \
  --levels 18,092,1867,07470,29055,001 \
  --file inputs/khasras.txt \
  --out outputs/manual/example.csv \
  --json-out outputs/manual/example.json
```

Range scan:

```bash
npm run batch -- \
  --levels 18,092,1867,07470,29055,001 \
  --from 1 \
  --to 5000 \
  --delay-ms 2000 \
  --retries 2 \
  --retry-delay-ms 7000 \
  --stop-after-misses 200 \
  --out outputs/manual/all-khasra.csv \
  --json-out outputs/manual/all-khasra.json
```

Generate map files from an existing JSON:

```bash
npm run export-map -- \
  outputs/manual/all-khasra.json \
  outputs/manual/all-khasra-google-map-points.csv \
  outputs/manual/all-khasra-points.geojson \
  outputs/manual/all-khasra-bounding-boxes.geojson \
  outputs/manual/all-khasra-google-earth-points.kml
```

## Google My Maps

Use the generated file:

```text
maps/<run-name>-google-map-points.csv
```

Steps:

1. Open https://www.google.com/mymaps
2. Create a new map
3. Click **Import**
4. Upload the `*-google-map-points.csv` file
5. Choose `latitude` and `longitude` as location columns
6. Choose `khasra` as the marker title

Each marker contains owner, area, khata number, and GIS code.

## Google Earth

Use the generated file:

```text
maps/<run-name>-google-earth-points.kml
```

### Google Earth Web

1. Open https://earth.google.com/web/
2. Go to **Projects**
3. Create a new project
4. Import the KML file from your computer

### Google Earth Pro

1. Open Google Earth Pro
2. Select **File > Open**
3. Choose the generated KML file

Google Earth helps view Khasra points with satellite imagery, roads, terrain, rivers, water paths, and nearby land context.

## Important Mapping Note

The tool can draw:

- Khasra center points
- Approximate bounding boxes from Bhunaksha extents

It cannot draw exact parcel boundaries unless Bhunaksha polygon geometry is available. The current detail endpoint gives center and extent, not full parcel polygons.

## Reliability Notes

The Rajasthan Bhunaksha site can be slow or intermittently return HTTP 502/503. The batch runner is intentionally conservative.

Recommended large-run settings:

```text
Delay between requests: 2000 ms
Retries per failed request: 2
Retry delay: 7000 ms
Stop after missing Khasras: 200
```

## Optional Local API

Start the API server:

```bash
npm start
```

Single lookup example:

```bash
curl 'http://127.0.0.1:3000/api/khasra/detail?levels=18,092,1867,07470,29055,001,&plotno=1'
```
