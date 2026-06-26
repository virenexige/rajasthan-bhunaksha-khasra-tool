import http from "node:http";
import { URL } from "node:url";

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const BHUNAKSHA_BASE_URL =
  process.env.BHUNAKSHA_BASE_URL || "https://bhunaksha.rajasthan.gov.in/Viewmap";
const DEFAULT_STATE = process.env.BHUNAKSHA_STATE || "08";
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 60000);

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end(body);
}

function sendText(res, status, body) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(body);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("Request body must be valid JSON");
    error.status = 400;
    throw error;
  }
}

function normalizeLevels(levels) {
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

function cleanHtml(value) {
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

function parsePlotInfo(info) {
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

async function bhunakshaGet(path, params) {
  const url = new URL(`${BHUNAKSHA_BASE_URL.replace(/\/$/, "")}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json,text/html,*/*",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125 Safari/537.36",
        referer: `${BHUNAKSHA_BASE_URL.replace(/\/$/, "")}/`,
      },
    });

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

async function bhunakshaPost(path, params) {
  const url = new URL(`${BHUNAKSHA_BASE_URL.replace(/\/$/, "")}/${path}`);
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) form.set(key, String(value));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      body: form,
      headers: {
        accept: "application/json,text/html,*/*",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125 Safari/537.36",
        referer: `${BHUNAKSHA_BASE_URL.replace(/\/$/, "")}/`,
        "x-requested-with": "XMLHttpRequest",
      },
    });

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

async function fetchKhasraDetail({ state = DEFAULT_STATE, levels, plotno }) {
  if (!plotno && plotno !== 0) throw new Error("plotno is required");

  const normalizedLevels = normalizeLevels(levels);
  const { url, body } = await bhunakshaGet("ScalarDatahandler", {
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

async function fetchLevelList({ state = DEFAULT_STATE, level, codes = "", hasmap = true }) {
  if (!level && level !== 0) throw new Error("level is required");
  const { body } = await bhunakshaPost("rest/Levels/ListsAfterLevel", {
    state,
    level,
    codes,
    hasmap,
  });

  try {
    return JSON.parse(body);
  } catch {
    const error = new Error("Bhunaksha level endpoint returned a non-JSON response");
    error.status = 502;
    error.details = body.slice(0, 500);
    throw error;
  }
}

async function handleRequest(req, res) {
  if (req.method === "OPTIONS") return sendJson(res, 204, {});

  const requestUrl = new URL(req.url, `http://${req.headers.host}`);

  if (requestUrl.pathname === "/health") {
    return sendJson(res, 200, { ok: true });
  }

  if (requestUrl.pathname === "/api/khasra/detail" && req.method === "GET") {
    const result = await fetchKhasraDetail({
      state: requestUrl.searchParams.get("state") || DEFAULT_STATE,
      levels: requestUrl.searchParams.get("levels"),
      plotno: requestUrl.searchParams.get("plotno"),
    });
    return sendJson(res, result.ok ? 200 : 404, result);
  }

  if (requestUrl.pathname === "/api/khasra/details" && req.method === "POST") {
    const body = await readJsonBody(req);
    const khasras = body.khasras || body.plotnos;
    if (!Array.isArray(khasras) || khasras.length === 0) {
      return sendJson(res, 400, { ok: false, error: "khasras must be a non-empty array" });
    }

    const results = [];
    for (const plotno of khasras) {
      results.push(
        await fetchKhasraDetail({
          state: body.state || DEFAULT_STATE,
          levels: body.levels,
          plotno,
        }),
      );
    }

    return sendJson(res, 200, {
      ok: results.every((item) => item.ok),
      count: results.length,
      results,
    });
  }

  if (requestUrl.pathname === "/api/levels" && req.method === "GET") {
    const data = await fetchLevelList({
      state: requestUrl.searchParams.get("state") || DEFAULT_STATE,
      level: requestUrl.searchParams.get("level"),
      codes: requestUrl.searchParams.get("codes") || "",
      hasmap: requestUrl.searchParams.get("hasmap") || "true",
    });
    return sendJson(res, 200, { ok: true, data });
  }

  return sendText(
    res,
    404,
    [
      "Available endpoints:",
      "GET  /health",
      "GET  /api/levels?state=08&level=1&codes=01,",
      "GET  /api/khasra/detail?levels=01,002,0745,02920,11035,001,&plotno=1",
      "POST /api/khasra/details",
    ].join("\n"),
  );
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    sendJson(res, error.status || 500, {
      ok: false,
      error: error.message,
      details: error.details,
    });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Khasra API listening on http://${HOST}:${PORT}`);
});
