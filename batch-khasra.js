import fs from "node:fs";
import { fetchKhasraDetail, normalizeLevels } from "./bhunaksha-client.js";

const DEFAULT_LEVELS = "18,092,1867,07470,29055,001,";

function parseArgs(argv) {
  const args = {
    state: "08",
    levels: DEFAULT_LEVELS,
    out: "khasra-output.csv",
    jsonOut: "khasra-output.json",
    delayMs: 1500,
    retries: 2,
    retryDelayMs: 5000,
    stopAfterMisses: 200,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--state") args.state = argv[++i];
    else if (arg === "--levels") args.levels = argv[++i];
    else if (arg === "--file") args.file = argv[++i];
    else if (arg === "--khasras") args.khasras = argv[++i];
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--json-out") args.jsonOut = argv[++i];
    else if (arg === "--delay-ms") args.delayMs = Number(argv[++i]);
    else if (arg === "--retries") args.retries = Number(argv[++i]);
    else if (arg === "--retry-delay-ms") args.retryDelayMs = Number(argv[++i]);
    else if (arg === "--stop-after-misses") args.stopAfterMisses = Number(argv[++i]);
    else if (arg === "--from") args.from = Number(argv[++i]);
    else if (arg === "--to") args.to = Number(argv[++i]);
    else if (arg === "--help") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function usage() {
  return `
Batch Bhunaksha Khasra fetcher

Default location from your screenshot:
  District: 18 Jalore
  Tehsil: 092 Jalore
  RI: 1867 Sayla
  Halkas: 07470 Mendakwas
  Village: 29055 Mendakwas (Chalu)
  Sheet No: 001 Digitized

Usage:
  node batch-khasra.js --file khasras.txt
  node batch-khasra.js --khasras 1,2,3
  node batch-khasra.js --from 1 --to 5000 --stop-after-misses 200
  node batch-khasra.js --levels 18,092,1867,07470,29055,001 --file khasras.txt --out output.csv

Input file format:
  One Khasra number per line, or comma-separated values.
`.trim();
}

function readKhasras(args) {
  if (Number.isFinite(args.from) || Number.isFinite(args.to)) {
    if (!Number.isInteger(args.from) || !Number.isInteger(args.to) || args.from > args.to) {
      throw new Error("--from and --to must be valid integers, with --from <= --to");
    }
    const khasras = [];
    for (let value = args.from; value <= args.to; value += 1) khasras.push(String(value));
    return khasras;
  }

  let raw = "";
  if (args.file) raw = fs.readFileSync(args.file, "utf8");
  else if (args.khasras) raw = args.khasras;
  else throw new Error("Provide --file khasras.txt, --khasras 1,2,3, or --from 1 --to 1000");

  return raw
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = String(value).replace(/\r?\n/g, " ").trim();
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(results) {
  const headers = [
    "districtCode",
    "tehsilCode",
    "riCode",
    "halkaCode",
    "villageCode",
    "sheetNo",
    "khasra",
    "found",
    "areaHectare",
    "khataNumber",
    "owner",
    "ownerAndInfo",
    "gisCode",
    "plotId",
    "centerX",
    "centerY",
    "xmin",
    "ymin",
    "xmax",
    "ymax",
    "error",
  ];

  const rows = results.map((result) => {
    const detail = result.detail || {};
    const extent = detail.extent || {};
    const center = detail.center || {};
    return [
      result.location.districtCode,
      result.location.tehsilCode,
      result.location.riCode,
      result.location.halkaCode,
      result.location.villageCode,
      result.location.sheetNo,
      result.plotno,
      result.ok ? "Y" : "N",
      detail.areaHectare,
      detail.khataNumber,
      detail.ownerText,
      detail.infoText,
      detail.gisCode,
      detail.id,
      center.x,
      center.y,
      extent.xmin,
      extent.ymin,
      extent.xmax,
      extent.ymax,
      result.error,
    ];
  });

  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n") + "\n";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const levels = normalizeLevels(args.levels);
  const khasras = readKhasras(args);
  const results = [];

  console.log(`Levels: ${levels}`);
  console.log(`Fetching ${khasras.length} Khasra record(s)...`);
  console.log(`Delay: ${args.delayMs}ms, retries on failed requests: ${args.retries}`);
  if (Number.isFinite(args.from) || Number.isFinite(args.to)) {
    console.log(`Range scan will stop after ${args.stopAfterMisses} consecutive missing records.`);
  }

  let consecutiveMisses = 0;
  for (let i = 0; i < khasras.length; i += 1) {
    const plotno = khasras[i];
    let result;

    for (let attempt = 0; attempt <= args.retries; attempt += 1) {
      try {
        result = await fetchKhasraDetail({ state: args.state, levels, plotno });
        break;
      } catch (error) {
        if (attempt < args.retries) {
          console.log(
            `${i + 1}/${khasras.length} ${plotno}: failed (${error.message}), retry ${attempt + 1}/${args.retries}`,
          );
          await sleep(args.retryDelayMs);
          continue;
        }

        result = {
          ok: false,
          state: args.state,
          levels,
          location: {
            districtCode: levels.split(",")[0] || "",
            tehsilCode: levels.split(",")[1] || "",
            riCode: levels.split(",")[2] || "",
            halkaCode: levels.split(",")[3] || "",
            villageCode: levels.split(",")[4] || "",
            sheetNo: levels.split(",")[5] || "",
          },
          plotno: String(plotno),
          detail: null,
          error: error.message,
        };
      }
    }

    results.push(result);
    console.log(`${i + 1}/${khasras.length} ${plotno}: ${result.ok ? "found" : result.error || "not found"}`);
    fs.writeFileSync(args.out, toCsv(results), "utf8");
    fs.writeFileSync(args.jsonOut, JSON.stringify(results, null, 2), "utf8");

    if (Number.isFinite(args.from) || Number.isFinite(args.to)) {
      consecutiveMisses = result.ok ? 0 : consecutiveMisses + 1;
      if (consecutiveMisses >= args.stopAfterMisses) {
        console.log(`Stopping after ${consecutiveMisses} consecutive missing records.`);
        break;
      }
    }

    if (args.delayMs > 0 && i < khasras.length - 1) await sleep(args.delayMs);
  }

  fs.writeFileSync(args.out, toCsv(results), "utf8");
  fs.writeFileSync(args.jsonOut, JSON.stringify(results, null, 2), "utf8");
  console.log(`CSV written: ${args.out}`);
  console.log(`JSON written: ${args.jsonOut}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
