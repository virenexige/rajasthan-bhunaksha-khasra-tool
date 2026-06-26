const BHUNAKSHA_BASE_URL =
  process.env.BHUNAKSHA_BASE_URL || "https://bhunaksha.rajasthan.gov.in/Viewmap";
const DEFAULT_STATE = process.env.BHUNAKSHA_STATE || "08";
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 60000);

export function normalizeLevels(levels) {
  if (Array.isArray(levels)) {
    if (levels.length === 0) throw new Error("levels array cannot be empty");
    return `${levels.map(String).join(",")},`;
  }

  if (typeof levels === "string" && levels.trim()) {
    const value = levels.trim();
    return value.endsWith(",") ? value : `${value},`;
  }

  throw new Error("levels is required as an array or comma-separated string");
}

export function splitLevels(levels) {
  return normalizeLevels(levels)
    .split(",")
    .filter(Boolean);
}

export function cleanHtml(value) {
  if (!value) return "";
  return String(value)
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function parsePlotInfo(info) {
  const text = String(info || "").replace(/\r\n/g, "\n");
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const areaMatch = text.match(/क्षेत्रफल\s*:\s*([0-9.]+)/);
  const khataMatch = text.match(/खाता संख्या\s*:\s*([^\n]+)/);
  const ownerLines = lines
    .filter((line) => !line.startsWith("क्षेत्रफल") && !line.startsWith("खाता संख्या"))
    .map((line) => line.replace(/^\d+\.\)\s*/, "").trim())
    .filter(Boolean);

  return {
    text,
    lines,
    ownerText: ownerLines.join(" | "),
    areaHectare: areaMatch ? Number(areaMatch[1]) : null,
    khataNumber: khataMatch ? khataMatch[1].trim() : null,
  };
}

async function bhunakshaRequest(path, params, method = "GET") {
  const url = new URL(`${BHUNAKSHA_BASE_URL.replace(/\/$/, "")}/${path}`);
  const headers = {
    accept: "application/json,text/html,*/*",
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125 Safari/537.36",
    referer: `${BHUNAKSHA_BASE_URL.replace(/\/$/, "")}/`,
  };

  const options = { method, headers };
  if (method === "POST") {
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) form.set(key, String(value));
    }
    options.body = form;
    headers["content-type"] = "application/x-www-form-urlencoded; charset=UTF-8";
    headers["x-requested-with"] = "XMLHttpRequest";
  } else {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  options.signal = controller.signal;

  try {
    const response = await fetch(url, options);
    const body = await response.text();
    if (!response.ok) {
      const error = new Error(`Bhunaksha request failed with HTTP ${response.status}`);
      error.status = 502;
      error.details = body.slice(0, 500);
      throw error;
    }
    return { url: url.toString(), body };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchKhasraDetail({ state = DEFAULT_STATE, levels, plotno }) {
  if (!plotno && plotno !== 0) throw new Error("plotno is required");

  const normalizedLevels = normalizeLevels(levels);
  const levelParts = splitLevels(normalizedLevels);
  const { url, body } = await bhunakshaRequest("ScalarDatahandler", {
    OP: "5",
    state,
    levels: normalizedLevels,
    plotno,
  });

  let raw;
  try {
    raw = JSON.parse(body);
  } catch {
    const error = new Error("Bhunaksha returned a non-JSON response");
    error.status = 502;
    error.details = body.slice(0, 500);
    throw error;
  }

  const hasData = raw?.has_data === "Y";
  const parsedInfo = parsePlotInfo(raw?.info);

  return {
    ok: hasData,
    state,
    levels: normalizedLevels,
    location: {
      districtCode: levelParts[0] || "",
      tehsilCode: levelParts[1] || "",
      riCode: levelParts[2] || "",
      halkaCode: levelParts[3] || "",
      villageCode: levelParts[4] || "",
      sheetNo: levelParts[5] || "",
    },
    plotno: String(plotno),
    sourceUrl: url,
    detail: hasData
      ? {
          plotNo: raw.plotNo,
          id: raw.ID,
          gisCode: raw.gisCode,
          pniu: raw.PNIU ?? null,
          areaHectare: parsedInfo.areaHectare,
          khataNumber: parsedInfo.khataNumber,
          ownerText: parsedInfo.ownerText,
          infoText: parsedInfo.text,
          infoLines: parsedInfo.lines,
          plotInfoLinksText: cleanHtml(raw.plotInfoLinks),
          extent: {
            xmin: raw.xmin,
            ymin: raw.ymin,
            xmax: raw.xmax,
            ymax: raw.ymax,
          },
          center: {
            x: raw.center_x,
            y: raw.center_y,
          },
          raw,
        }
      : null,
    error: hasData ? null : `Khasra ${plotno} was not found for the supplied village levels`,
  };
}

export async function fetchLevelList({ state = DEFAULT_STATE, level, codes = "", hasmap = true }) {
  if (!level && level !== 0) throw new Error("level is required");
  const { body } = await bhunakshaRequest(
    "rest/Levels/ListsAfterLevel",
    { state, level, codes, hasmap },
    "POST",
  );

  try {
    return JSON.parse(body);
  } catch {
    const error = new Error("Bhunaksha level endpoint returned a non-JSON response");
    error.status = 502;
    error.details = body.slice(0, 500);
    throw error;
  }
}
