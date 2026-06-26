import fs from "node:fs";

const INPUT = process.argv[2] || "all-khasra-output-clean.json";
const POINT_CSV = process.argv[3] || "khasra-google-map-points.csv";
const POINT_GEOJSON = process.argv[4] || "khasra-points.geojson";
const BBOX_GEOJSON = process.argv[5] || "khasra-bounding-boxes.geojson";
const POINT_KML = process.argv[6] || "khasra-google-earth-points.kml";

function utm43nToLngLat(easting, northing) {
  const a = 6378137;
  const e = 0.08181919084262149;
  const e1sq = 0.006739496742276434;
  const k0 = 0.9996;
  const zoneNumber = 43;
  const x = easting - 500000;
  const y = northing;
  const longOrigin = (zoneNumber - 1) * 6 - 180 + 3;

  const m = y / k0;
  const mu =
    m /
    (a *
      (1 -
        Math.pow(e, 2) / 4 -
        (3 * Math.pow(e, 4)) / 64 -
        (5 * Math.pow(e, 6)) / 256));

  const e1 = (1 - Math.sqrt(1 - e * e)) / (1 + Math.sqrt(1 - e * e));
  const j1 = (3 * e1) / 2 - (27 * Math.pow(e1, 3)) / 32;
  const j2 = (21 * Math.pow(e1, 2)) / 16 - (55 * Math.pow(e1, 4)) / 32;
  const j3 = (151 * Math.pow(e1, 3)) / 96;
  const j4 = (1097 * Math.pow(e1, 4)) / 512;

  const fp =
    mu +
    j1 * Math.sin(2 * mu) +
    j2 * Math.sin(4 * mu) +
    j3 * Math.sin(6 * mu) +
    j4 * Math.sin(8 * mu);

  const sinFp = Math.sin(fp);
  const cosFp = Math.cos(fp);
  const tanFp = Math.tan(fp);
  const c1 = e1sq * cosFp * cosFp;
  const t1 = tanFp * tanFp;
  const r1 =
    (a * (1 - e * e)) / Math.pow(1 - e * e * sinFp * sinFp, 1.5);
  const n1 = a / Math.sqrt(1 - e * e * sinFp * sinFp);
  const d = x / (n1 * k0);

  const q1 = n1 * tanFp / r1;
  const q2 = (d * d) / 2;
  const q3 =
    ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * e1sq) * Math.pow(d, 4)) / 24;
  const q4 =
    ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * e1sq - 3 * c1 * c1) *
      Math.pow(d, 6)) /
    720;
  const lat = fp - q1 * (q2 - q3 + q4);

  const q5 = d;
  const q6 = ((1 + 2 * t1 + c1) * Math.pow(d, 3)) / 6;
  const q7 =
    ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * e1sq + 24 * t1 * t1) *
      Math.pow(d, 5)) /
    120;
  const lng = (q5 - q6 + q7) / cosFp;

  return [longOrigin + (lng * 180) / Math.PI, (lat * 180) / Math.PI];
}

function projectedToLngLat(x, y) {
  return utm43nToLngLat(x, y);
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = String(value).replace(/\r?\n/g, " ").trim();
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function xmlEscape(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const rows = JSON.parse(fs.readFileSync(INPUT, "utf8")).filter((row) => row.ok && row.detail);

const pointRows = rows.map((row) => {
  const center = row.detail.center || {};
  const [lng, lat] = projectedToLngLat(center.x, center.y);
  return {
    khasra: row.plotno,
    owner: row.detail.ownerText,
    areaHectare: row.detail.areaHectare,
    khataNumber: row.detail.khataNumber,
    gisCode: row.detail.gisCode,
    latitude: lat,
    longitude: lng,
  };
});

const pointHeaders = [
  "khasra",
  "owner",
  "areaHectare",
  "khataNumber",
  "gisCode",
  "latitude",
  "longitude",
];
const pointCsv = [
  pointHeaders,
  ...pointRows.map((row) => pointHeaders.map((header) => row[header])),
]
  .map((row) => row.map(csvEscape).join(","))
  .join("\n");

const pointGeoJson = {
  type: "FeatureCollection",
  features: pointRows.map((row) => ({
    type: "Feature",
    properties: {
      khasra: row.khasra,
      owner: row.owner,
      areaHectare: row.areaHectare,
      khataNumber: row.khataNumber,
      gisCode: row.gisCode,
    },
    geometry: {
      type: "Point",
      coordinates: [row.longitude, row.latitude],
    },
  })),
};

const bboxGeoJson = {
  type: "FeatureCollection",
  features: rows.map((row) => {
    const extent = row.detail.extent || {};
    const sw = projectedToLngLat(extent.xmin, extent.ymin);
    const se = projectedToLngLat(extent.xmax, extent.ymin);
    const ne = projectedToLngLat(extent.xmax, extent.ymax);
    const nw = projectedToLngLat(extent.xmin, extent.ymax);
    return {
      type: "Feature",
      properties: {
        khasra: row.plotno,
        owner: row.detail.ownerText,
        areaHectare: row.detail.areaHectare,
        khataNumber: row.detail.khataNumber,
        gisCode: row.detail.gisCode,
      },
      geometry: {
        type: "Polygon",
        coordinates: [[sw, se, ne, nw, sw]],
      },
    };
  }),
};

const pointKml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Khasra Points</name>
    ${pointRows
      .map(
        (row) => `
    <Placemark>
      <name>${xmlEscape(row.khasra)}</name>
      <description>${xmlEscape(
        [
          `Owner: ${row.owner || ""}`,
          `Area: ${row.areaHectare || ""} Hectare`,
          `Khata: ${row.khataNumber || ""}`,
          `GIS Code: ${row.gisCode || ""}`,
        ].join("\n"),
      )}</description>
      <Point>
        <coordinates>${row.longitude},${row.latitude},0</coordinates>
      </Point>
    </Placemark>`,
      )
      .join("")}
  </Document>
</kml>
`;

fs.writeFileSync(POINT_CSV, `${pointCsv}\n`, "utf8");
fs.writeFileSync(POINT_GEOJSON, JSON.stringify(pointGeoJson, null, 2), "utf8");
fs.writeFileSync(BBOX_GEOJSON, JSON.stringify(bboxGeoJson, null, 2), "utf8");
fs.writeFileSync(POINT_KML, pointKml, "utf8");

console.log(`Rows exported: ${rows.length}`);
console.log(`Google My Maps CSV: ${POINT_CSV}`);
console.log(`Point GeoJSON: ${POINT_GEOJSON}`);
console.log(`Approximate bbox GeoJSON: ${BBOX_GEOJSON}`);
console.log(`Google Earth KML: ${POINT_KML}`);
