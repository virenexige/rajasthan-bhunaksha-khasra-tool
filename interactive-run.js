import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const DEFAULTS = {
  state: "08",
  districtCode: "18",
  tehsilCode: "092",
  riCode: "1867",
  halkaCode: "07470",
  villageCode: "29055",
  sheetNo: "001",
  from: "1",
  to: "5000",
  delayMs: "2000",
  retries: "2",
  retryDelayMs: "7000",
  stopAfterMisses: "200",
  outputDir: "outputs",
  outputName: "mendakwas-khasra",
};

function askDefault(rl, question, defaultValue) {
  return rl.question(`${question} [${defaultValue}]: `).then((answer) => {
    if (answer === undefined) throw new Error("Input stream closed before all questions were answered");
    return answer.trim() || defaultValue;
  });
}

function runNode(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${args[0]} exited with code ${code}`));
    });
  });
}

function splitKhasras(value) {
  return value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join(",");
}

async function main() {
  const rl = readline.createInterface({ input, output });

  try {
    console.log("\nRajasthan Bhunaksha Khasra Batch Runner\n");
    console.log("Enter location codes exactly as shown on Bhunaksha.\n");

    const state = await askDefault(rl, "State code", DEFAULTS.state);
    const districtCode = await askDefault(rl, "District code", DEFAULTS.districtCode);
    const tehsilCode = await askDefault(rl, "Tehsil code", DEFAULTS.tehsilCode);
    const riCode = await askDefault(rl, "RI code", DEFAULTS.riCode);
    const halkaCode = await askDefault(rl, "Halka code", DEFAULTS.halkaCode);
    const villageCode = await askDefault(rl, "Village code", DEFAULTS.villageCode);
    const sheetNo = await askDefault(rl, "Sheet no", DEFAULTS.sheetNo);
    const levels = `${districtCode},${tehsilCode},${riCode},${halkaCode},${villageCode},${sheetNo},`;

    console.log("\nChoose Khasra input:");
    console.log("  1. Range scan, for example 1 to 5000");
    console.log("  2. Comma-separated list, for example 1,2,3");
    console.log("  3. File path, one Khasra per line");
    const mode = await askDefault(rl, "Input mode", "1");

    const batchArgs = ["batch-khasra.js", "--state", state, "--levels", levels];

    if (mode === "2") {
      const khasras = splitKhasras(await rl.question("Khasra numbers: "));
      if (!khasras) throw new Error("At least one Khasra number is required");
      batchArgs.push("--khasras", khasras);
    } else if (mode === "3") {
      const file = await rl.question("Khasra input file path: ");
      if (!file.trim()) throw new Error("Input file path is required");
      batchArgs.push("--file", file.trim());
    } else {
      const from = await askDefault(rl, "Start Khasra number", DEFAULTS.from);
      const to = await askDefault(rl, "End Khasra number", DEFAULTS.to);
      const stopAfterMisses = await askDefault(
        rl,
        "Stop after how many consecutive missing Khasras",
        DEFAULTS.stopAfterMisses,
      );
      batchArgs.push("--from", from, "--to", to, "--stop-after-misses", stopAfterMisses);
    }

    const delayMs = await askDefault(rl, "Delay between requests in ms", DEFAULTS.delayMs);
    const retries = await askDefault(rl, "Retries per failed request", DEFAULTS.retries);
    const retryDelayMs = await askDefault(rl, "Delay before retry in ms", DEFAULTS.retryDelayMs);
    const outputDir = await askDefault(rl, "Output folder", DEFAULTS.outputDir);
    const outputName = await askDefault(rl, "Output file prefix", DEFAULTS.outputName);

    const resolvedOutputDir = path.resolve(outputDir);
    fs.mkdirSync(resolvedOutputDir, { recursive: true });

    const csvPath = path.join(resolvedOutputDir, `${outputName}.csv`);
    const jsonPath = path.join(resolvedOutputDir, `${outputName}.json`);
    const mapCsvPath = path.join(resolvedOutputDir, `${outputName}-google-map-points.csv`);
    const pointGeoJsonPath = path.join(resolvedOutputDir, `${outputName}-points.geojson`);
    const bboxGeoJsonPath = path.join(resolvedOutputDir, `${outputName}-bounding-boxes.geojson`);
    const kmlPath = path.join(resolvedOutputDir, `${outputName}-google-earth-points.kml`);

    batchArgs.push(
      "--delay-ms",
      delayMs,
      "--retries",
      retries,
      "--retry-delay-ms",
      retryDelayMs,
      "--out",
      csvPath,
      "--json-out",
      jsonPath,
    );

    console.log("\nStarting Bhunaksha batch fetch...\n");
    await runNode(batchArgs);

    console.log("\nGenerating map files...\n");
    await runNode([
      "export-map-files.js",
      jsonPath,
      mapCsvPath,
      pointGeoJsonPath,
      bboxGeoJsonPath,
      kmlPath,
    ]);

    console.log("\nDone. Files generated:");
    console.log(`  Batch CSV: ${csvPath}`);
    console.log(`  Batch JSON: ${jsonPath}`);
    console.log(`  Google My Maps CSV: ${mapCsvPath}`);
    console.log(`  Google Earth KML: ${kmlPath}`);
    console.log(`  Point GeoJSON: ${pointGeoJsonPath}`);
    console.log(`  Bounding box GeoJSON: ${bboxGeoJsonPath}`);
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exitCode = 1;
});
