#!/usr/bin/env node

// src/card/render.ts
import { existsSync } from "fs";
import { createRequire } from "module";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

// src/card/svg.ts
var CARD_WIDTH = 1200;
var CARD_HEIGHT = 675;
var CARD_FONT_FAMILY = "Geist";
var COLOR = {
  background: "#07080b",
  frame: "#1b1f26",
  rule: "#1f242c",
  ink: "#f1f3f6",
  secondary: "#a2a9b4",
  lime: "#c2fb03",
  amber: "#f2b84b"
};
function escapeXml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
var NOT_DRAWN = /[\u0000-\u001F\u007F-\u009F\u00AD\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFE00-\uFE0F\uFEFF]/g;
var DRAWN = /[ -~\u00A0-\u024F\u0259\u02B0-\u02FF\u0370-\u03FF\u0400-\u04FF\u1E00-\u1EFF\u2010-\u2027\u2030-\u205E\u20A0-\u20C0\u2100-\u214F\u2190-\u2199\u2212]/u;
function cardText(value) {
  let out = "";
  for (const ch of value.toWellFormed().replace(NOT_DRAWN, "")) if (DRAWN.test(ch)) out += ch;
  return out.replace(/\s+/g, " ").trim();
}
function wrap(text2, maxWidth, size, weight, maxLines, measure, letterSpacing = 0) {
  const fits = (s) => measure(s, size, weight, letterSpacing) <= maxWidth;
  const words = text2.split(" ").filter(Boolean);
  const lines = [];
  let current = "";
  let i = 0;
  for (; i < words.length; i += 1) {
    const word = words[i];
    const next = current ? `${current} ${word}` : word;
    if (fits(next)) {
      current = next;
      continue;
    }
    if (current) {
      lines.push(current);
      current = "";
      if (lines.length === maxLines) break;
    }
    if (fits(word)) current = word;
    else {
      let part = "";
      for (const ch of word) {
        if (fits(part + ch)) part += ch;
        else {
          lines.push(part);
          if (lines.length === maxLines) break;
          part = ch;
        }
      }
      if (lines.length === maxLines) break;
      current = part;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
    current = "";
  }
  const cut = i < words.length || current !== "";
  if (cut && lines.length > 0) {
    let last = lines[lines.length - 1];
    while (last.length > 1 && !fits(`${last}\u2026`)) last = [...last].slice(0, -1).join("").trimEnd();
    lines[lines.length - 1] = `${last.replace(/[\s,;:.·—-]+$/u, "")}\u2026`;
  }
  return lines;
}
function sizeToFit(text2, maxWidth, sizes, weight, measure, ls) {
  for (const size of sizes) if (measure(text2, size, weight, ls(size)) <= maxWidth) return size;
  return null;
}
function textEl(content, o) {
  const anchor = o.anchor === "end" ? ' text-anchor="end"' : "";
  const ls = o.letterSpacing ? ` letter-spacing="${o.letterSpacing}"` : "";
  return `<text x="${o.x}" y="${o.y}" font-family="${CARD_FONT_FAMILY}" font-size="${o.size}" font-weight="${o.weight}" fill="${o.fill}"${anchor}${ls} xml:space="preserve">${escapeXml(content)}</text>`;
}
var PAD = 80;
var RIGHT = CARD_WIDTH - PAD;
var CONTENT = RIGHT - PAD;
function buildCardSvg(model, measure) {
  const parts = [];
  const titleLs = (s) => -Math.round(s * 0.03);
  parts.push(
    `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${COLOR.background}"/>`,
    `<rect x="24" y="24" width="${CARD_WIDTH - 48}" height="${CARD_HEIGHT - 48}" rx="28" fill="none" stroke="${COLOR.frame}" stroke-width="2"/>`,
    `<rect x="${PAD}" y="77" width="14" height="14" rx="3" fill="${COLOR.lime}"/>`,
    textEl("HEY RESEARCH LAB \xB7 DEV CHECK", {
      x: PAD + 28,
      y: 91,
      size: 22,
      weight: 600,
      fill: COLOR.secondary,
      letterSpacing: 2.4
    }),
    textEl("Robinhood Chain", {
      x: RIGHT,
      y: 91,
      size: 22,
      weight: 400,
      fill: COLOR.secondary,
      anchor: "end"
    })
  );
  const title = cardText(model.title) || "Untitled";
  let y;
  const one = sizeToFit(title, CONTENT, [92, 84, 76, 68], 700, measure, titleLs);
  if (one !== null) {
    y = 196;
    parts.push(
      textEl(title, {
        x: PAD,
        y,
        size: one,
        weight: 700,
        fill: COLOR.ink,
        letterSpacing: titleLs(one)
      })
    );
  } else {
    const lines = wrap(title, CONTENT, 64, 700, 2, measure, titleLs(64));
    y = 176;
    lines.forEach(
      (line, i) => parts.push(
        textEl(line, {
          x: PAD,
          y: y + i * 70,
          size: 64,
          weight: 700,
          fill: COLOR.ink,
          letterSpacing: titleLs(64)
        })
      )
    );
    y += (lines.length - 1) * 70;
  }
  const twoLineTitle = one === null;
  const ticker = model.ticker ? cardText(model.ticker) : "";
  const hasRow = ticker !== "" || model.pill !== null;
  if (hasRow) {
    y += 70;
    let x = PAD;
    if (ticker) {
      const t = wrap(ticker, 360, 36, 600, 1, measure)[0] ?? "";
      parts.push(textEl(t, { x, y, size: 36, weight: 600, fill: COLOR.secondary }));
      x += measure(t, 36, 600) + 28;
    }
    if (model.pill) {
      const pillLabel = cardText(model.pill.label);
      const pillText = 26;
      const pillW = measure(pillLabel, pillText, 600) + 30 + 26 + 26;
      const pillH = 50;
      const pillY = y - 37;
      const lime = model.pill.tone === "lime";
      const pillFill = lime ? "rgba(194,251,3,0.10)" : "rgba(162,169,180,0.08)";
      const pillStroke = lime ? COLOR.lime : "#3a404a";
      const pillInk = lime ? COLOR.lime : COLOR.secondary;
      parts.push(
        `<rect x="${x}" y="${pillY}" width="${Math.round(pillW)}" height="${pillH}" rx="${pillH / 2}" fill="${pillFill}" stroke="${pillStroke}" stroke-width="2"/>`,
        `<circle cx="${x + 28}" cy="${pillY + pillH / 2}" r="7" fill="${pillInk}"/>`,
        textEl(pillLabel, { x: x + 48, y: pillY + 34, size: pillText, weight: 600, fill: pillInk })
      );
    }
  }
  y += hasRow ? twoLineTitle ? 88 : 96 : 98;
  const headline = cardText(model.headline);
  const hSize = sizeToFit(headline, CONTENT, [62, 56, 50, 44], 700, measure, (s) => -Math.round(s * 0.02)) ?? 44;
  const hLines = wrap(headline, CONTENT, hSize, 700, 1, measure, -Math.round(hSize * 0.02));
  parts.push(
    textEl(hLines[0] ?? "", {
      x: PAD,
      y,
      size: hSize,
      weight: 700,
      fill: COLOR.ink,
      letterSpacing: -Math.round(hSize * 0.02)
    })
  );
  const ruleY = 562;
  parts.push(
    `<line x1="${PAD}" y1="${ruleY}" x2="${RIGHT}" y2="${ruleY}" stroke="${COLOR.rule}" stroke-width="2"/>`
  );
  const checked = cardText(model.checkedOn);
  const checkedW = measure(checked, 22, 400);
  const urlMax = CONTENT - checkedW - 32;
  const url = cardText(model.footerUrl);
  const urlSize = sizeToFit(url, urlMax, [26, 24, 22, 20], 600, measure, () => 0) ?? 20;
  parts.push(
    textEl(wrap(url, urlMax, urlSize, 600, 1, measure)[0] ?? "", {
      x: PAD,
      y: 606,
      size: urlSize,
      weight: 600,
      fill: COLOR.ink
    }),
    textEl(checked, {
      x: RIGHT,
      y: 606,
      size: 22,
      weight: 400,
      fill: COLOR.secondary,
      anchor: "end"
    }),
    textEl("Builder evidence, not a safety verdict or investment advice.", {
      x: PAD,
      y: 640,
      size: 22,
      weight: 400,
      fill: COLOR.secondary
    })
  );
  const facts = model.facts.map(cardText).filter(Boolean);
  const factsY = ruleY - 34;
  const bottom = facts.length > 0 ? factsY - 44 : ruleY - 22;
  if (facts.length > 0) {
    const joined = facts.join("   \xB7   ");
    const fSize = sizeToFit(joined, CONTENT, [28, 26, 24], 400, measure, () => 0) ?? 22;
    const line = wrap(joined, CONTENT, fSize, 400, 1, measure)[0] ?? "";
    parts.push(textEl(line, { x: PAD, y: factsY, size: fSize, weight: 400, fill: COLOR.ink }));
  }
  if (model.notice) {
    const top = y + 36;
    const inner = CONTENT - 56;
    const lineH = 36;
    const foot = cardText(model.notice.foot);
    const footH = foot ? 40 : 0;
    const room = Math.max(1, Math.floor((bottom - top - 54 - footH) / lineH));
    const body = wrap(cardText(model.notice.body), inner, 26, 400, Math.min(3, room), measure);
    const boxH = 54 + body.length * lineH + footH + (foot ? 14 : 6);
    parts.push(
      `<rect x="${PAD}" y="${top}" width="${CONTENT}" height="${boxH}" rx="18" fill="rgba(242,184,75,0.08)" stroke="${COLOR.amber}" stroke-width="2"/>`,
      textEl(cardText(model.notice.heading).toUpperCase(), {
        x: PAD + 28,
        y: top + 40,
        size: 20,
        weight: 700,
        fill: COLOR.amber,
        letterSpacing: 2
      })
    );
    body.forEach(
      (line, i) => parts.push(
        textEl(line, {
          x: PAD + 28,
          y: top + 80 + i * lineH,
          size: 26,
          weight: 400,
          fill: COLOR.ink
        })
      )
    );
    if (foot) {
      parts.push(
        textEl(wrap(foot, inner, 22, 400, 1, measure)[0] ?? "", {
          x: PAD + 28,
          y: top + 80 + (body.length - 1) * lineH + 40,
          size: 22,
          weight: 400,
          fill: COLOR.secondary
        })
      );
    }
  } else if (model.detail) {
    const detail = cardText(model.detail);
    const first = y + 56;
    const lineH = 42;
    const room = Math.max(0, Math.floor((bottom - first) / lineH) + 1);
    const lines = wrap(detail, CONTENT, 31, 400, Math.min(2, room), measure);
    lines.forEach(
      (line, i) => parts.push(
        textEl(line, {
          x: PAD,
          y: first + i * lineH,
          size: 31,
          weight: 400,
          fill: COLOR.secondary
        })
      )
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">${parts.join("")}</svg>`;
}

// src/card/render.ts
var FONT_FILES = ["Geist-Regular.ttf", "Geist-SemiBold.ttf", "Geist-Bold.ttf"];
function defaultFontDir() {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 4; i += 1) {
    const candidate = join(dir, "assets", "fonts");
    if (existsSync(join(candidate, FONT_FILES[0]))) return candidate;
    dir = dirname(dir);
  }
  throw new Error("The card font (assets/fonts/Geist-*.ttf) is missing from this install.");
}
var resvgModule;
function loadResvg(load = createRequire(import.meta.url)) {
  if (resvgModule) return resvgModule;
  try {
    resvgModule = load("@resvg/resvg-js");
  } catch (error) {
    const reason = error instanceof Error ? error.message.split("\n")[0] ?? "" : String(error);
    throw new Error(
      `the card renderer (@resvg/resvg-js) could not load on ${process.platform}-${process.arch}; run with --no-card for the text answer (${reason})`,
      { cause: error }
    );
  }
  return resvgModule;
}
function loadFonts(fontDir = defaultFontDir()) {
  const files = FONT_FILES.map((f) => join(fontDir, f));
  for (const file of files) {
    if (!existsSync(file)) throw new Error(`The card font ${file} is missing from this install.`);
  }
  return { files };
}
function options(fonts) {
  return {
    font: {
      fontFiles: fonts.files,
      loadSystemFonts: false,
      defaultFontFamily: CARD_FONT_FAMILY
    },
    fitTo: { mode: "original" },
    shapeRendering: 2,
    textRendering: 1,
    imageRendering: 0
  };
}
var escapeForMeasure = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function createMeasure(fonts) {
  const cache = /* @__PURE__ */ new Map();
  return (text2, size, weight, letterSpacing = 0) => {
    const key = `${size}|${weight}|${letterSpacing}|${text2}`;
    const hit = cache.get(key);
    if (hit !== void 0) return hit;
    const svg = (t) => `<svg xmlns="http://www.w3.org/2000/svg" width="8000" height="400"><text x="0" y="300" font-family="${CARD_FONT_FAMILY}" font-size="${size}" font-weight="${weight}" letter-spacing="${letterSpacing}" xml:space="preserve">${escapeForMeasure(t)}</text></svg>`;
    const { Resvg } = loadResvg();
    const width = (t) => new Resvg(svg(t), options(fonts)).getBBox()?.width ?? 0;
    const bars = width("||");
    const value = text2 === "" ? 0 : Math.max(0, width(`|${text2}|`) - bars);
    cache.set(key, value);
    return value;
  };
}
function renderPng(svg, fonts) {
  const { Resvg } = loadResvg();
  return new Resvg(svg, options(fonts)).render().asPng();
}

// src/run.ts
import { isAbsolute, relative } from "path";
import { parseArgs } from "util";

// src/chain.ts
var CHAIN_NAME = "Robinhood Chain";
var CHAIN_ID = 4663;
var CAIP2 = "eip155:4663";

// src/exit-codes.ts
var EXIT = {
  /** HEY answered: a published project, with its builder evidence. */
  OK: 0,
  /** The answer printed, but the card could not be written (bad path, symlink, no permission). */
  CARD_FAILED: 1,
  /** Usage error: a bad flag, input that is not an address/ticker/name/handle, `unsupported_chain`. */
  USAGE: 2,
  /** HEY refused the request (an `invalid_request` other than `ambiguous`, a 4xx other than 404/429). */
  REFUSED: 3,
  /** HEY holds no published project for the input (`not_found`). */
  NOT_FOUND: 4,
  /** Rate limited (429): retry after the printed delay. */
  RATE_LIMITED: 5,
  /** Network failure, timeout, redirect, an unreadable or oversized answer, or a HEY 5xx. */
  NETWORK: 6,
  /** More than one published project matches: HEY lists them and does not guess; pick one. */
  AMBIGUOUS: 7
};

// src/errors.ts
var CheckError = class extends Error {
  constructor(code2, message, exitCode2, details = {}) {
    super(message);
    this.code = code2;
    this.exitCode = exitCode2;
    this.details = details;
    this.name = "CheckError";
  }
  code;
  exitCode;
  details;
};
var usageError = (code2, message) => new CheckError(code2, message, EXIT.USAGE);
var networkError = (code2, message, details = {}) => new CheckError(code2, message, EXIT.NETWORK, { retryable: true, ...details });

// src/evm.ts
var ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
var ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
var DEAD_ADDRESS = "0x000000000000000000000000000000000000dead";

// src/version.ts
var CHECK_VERSION = true ? "0.1.0" : "0.0.0-dev";

// src/http.ts
var DEFAULT_BASE_URL = "https://heyresearch.xyz";
var MAX_RESPONSE_BYTES = 1024 * 1024;
var TIMEOUT_MS = 15e3;
var MAX_REQUESTS = 2;
var USER_AGENT = `hey-check/${CHECK_VERSION} (+https://github.com/hey-research-lab/hey-check)`;
var FORBIDDEN_KEYS = /* @__PURE__ */ new Set(["__proto__", "constructor", "prototype"]);
function forbiddenKeyPath(value, path = "$", depth = 0) {
  if (depth > 64) return path;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const hit = forbiddenKeyPath(value[i], `${path}[${i}]`, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_KEYS.has(key)) return `${path}.${key}`;
      const hit = forbiddenKeyPath(
        value[key],
        `${path}.${key}`,
        depth + 1
      );
      if (hit) return hit;
    }
  }
  return null;
}
async function readCapped(response, max) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) throw tooLarge(max);
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => void 0);
      throw tooLarge(max);
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
}
var tooLarge = (max) => new CheckError(
  "response_too_large",
  `HEY's answer was larger than ${max} bytes; hey-check does not read it.`,
  EXIT.NETWORK,
  { retryable: false }
);
function parseBaseUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new CheckError("invalid_base_url", "The base URL is not a URL.", EXIT.USAGE);
  }
  const local = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  const bare = url.pathname === "/" && !url.search && !url.hash && !raw.includes("#");
  if (url.protocol !== "https:" && !local || url.username || url.password || !bare) {
    throw new CheckError(
      "invalid_base_url",
      "The base URL must be an https origin (or http on localhost) with no path or query.",
      EXIT.USAGE
    );
  }
  return url.origin;
}
var HeyHttp = class {
  constructor(fetchImpl, baseUrl = DEFAULT_BASE_URL) {
    this.fetchImpl = fetchImpl;
    this.baseUrl = baseUrl;
  }
  fetchImpl;
  baseUrl;
  requests = [];
  async getJson(path, params) {
    if (this.requests.length >= MAX_REQUESTS) {
      throw new CheckError(
        "request_budget",
        "hey-check makes at most two requests a run.",
        EXIT.NETWORK
      );
    }
    const url = `${this.baseUrl}${path}?${new URLSearchParams(params).toString()}`;
    const record = { url, status: null, requestId: null };
    this.requests.push(record);
    let response;
    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        redirect: "manual",
        credentials: "omit",
        headers: {
          accept: "application/json",
          "user-agent": USER_AGENT,
          "x-hey-integration": `hey-check/${CHECK_VERSION}`
        },
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        throw networkError("timeout", `HEY did not answer within ${TIMEOUT_MS / 1e3} seconds.`);
      }
      throw networkError("network", "Could not reach heyresearch.xyz. Check your connection.");
    }
    record.status = response.status;
    record.requestId = response.headers.get("x-request-id");
    const requestId = record.requestId ?? void 0;
    const details = requestId ? { requestId } : {};
    if (response.status === 0 || response.status >= 300 && response.status < 400) {
      throw networkError("redirect", "HEY answered with a redirect; hey-check follows none.", {
        ...details,
        retryable: false
      });
    }
    if (response.status === 429) {
      const header = Number(response.headers.get("retry-after"));
      const retryAfterSeconds = Number.isFinite(header) && header > 0 ? Math.ceil(header) : 60;
      throw new CheckError(
        "rate_limited",
        `HEY is rate limiting requests from here. Wait ${retryAfterSeconds} seconds and try again.`,
        EXIT.RATE_LIMITED,
        { ...details, retryable: true, retryAfterSeconds }
      );
    }
    if (response.status >= 500) {
      throw networkError(
        "server_error",
        `HEY answered ${response.status}. Try again shortly.`,
        details
      );
    }
    const text2 = await readCapped(response, MAX_RESPONSE_BYTES);
    let body;
    try {
      body = JSON.parse(text2);
    } catch {
      throw networkError("invalid_response", `HEY's answer (${response.status}) was not JSON.`, {
        ...details,
        retryable: false
      });
    }
    const bad = forbiddenKeyPath(body);
    if (bad) {
      throw networkError("invalid_response", `HEY's answer carries a forbidden key at ${bad}.`, {
        ...details,
        retryable: false
      });
    }
    return { status: response.status, body, requestId: record.requestId };
  }
};

// src/input.ts
var MAX_INPUT_LENGTH = 200;
var HANDLE = /^[A-Za-z0-9_]{1,15}$/;
var TICKER = /^\$[A-Za-z0-9][A-Za-z0-9._-]{0,19}$/;
var NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._'&+-]{0,79}$/u;
var X_RESERVED = /* @__PURE__ */ new Set([
  "home",
  "i",
  "intent",
  "share",
  "search",
  "explore",
  "hashtag",
  "settings",
  "messages",
  "notifications",
  "login",
  "signup",
  "tos",
  "privacy"
]);
var X_HOSTS = /* @__PURE__ */ new Set([
  "x.com",
  "www.x.com",
  "mobile.x.com",
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com"
]);
var HELP = "hey-check takes a Robinhood Chain contract address (0x + 40 hex), a $TICKER, a project name or slug, an @handle, or an x.com profile URL.";
var EMPTY_HINT = "A $TICKER must be quoted with single quotes in a shell ('$CHIT'): unquoted or in double quotes, the shell replaces it with nothing.";
var WRAPPED_IN_QUOTES = /^(['"\u2018\u2019\u201C\u201D]).+(['"\u2018\u2019\u201C\u201D])$/u;
function handleFromXUrl(raw) {
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    throw usageError("invalid_input", `That is not a URL hey-check can read. ${HELP}`);
  }
  if (!X_HOSTS.has(url.hostname.toLowerCase()) || url.username || url.password || url.port) {
    throw usageError(
      "invalid_input",
      `hey-check reads x.com and twitter.com profile URLs only. ${HELP}`
    );
  }
  const first = url.pathname.split("/").filter(Boolean)[0] ?? "";
  if (!HANDLE.test(first) || X_RESERVED.has(first.toLowerCase())) {
    throw usageError("invalid_input", "That x.com URL does not name a profile (x.com/<handle>).");
  }
  return first;
}
function parseInput(value) {
  if (value === void 0) throw usageError("missing_argument", `Nothing to check. ${HELP}`);
  if (/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/.test(value)) {
    throw usageError("invalid_input", "The input carries control or invisible characters.");
  }
  const raw = value.trim();
  if (raw === "") throw usageError("missing_argument", `Nothing to check. ${EMPTY_HINT}`);
  if (raw.length > MAX_INPUT_LENGTH) {
    throw usageError("invalid_input", `The input is longer than ${MAX_INPUT_LENGTH} characters.`);
  }
  if (WRAPPED_IN_QUOTES.test(raw)) {
    throw usageError(
      "invalid_input",
      `The input arrived with its quotes (${raw}). Your shell passed them on as part of it \u2014 cmd.exe does \u2014 so leave them out there: hey-check ${raw.slice(1, -1)}`
    );
  }
  const caip = /^eip155:(\d+):(.+)$/i.exec(raw);
  if (caip) {
    if (Number(caip[1]) !== CHAIN_ID || caip[1] !== String(CHAIN_ID)) {
      throw usageError(
        "unsupported_chain",
        `HEY supports Robinhood Chain (4663) only; chain ${caip[1]} is not supported.`
      );
    }
    return parseAddress(raw, caip[2] ?? "");
  }
  if (/^0x/i.test(raw)) return parseAddress(raw, raw);
  if (/^(https?:\/\/)?([a-z0-9-]+\.)*(x|twitter)\.com(\/|$)/i.test(raw)) {
    const handle = handleFromXUrl(raw);
    return { kind: "x_profile", raw, q: `@${handle}` };
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.includes("/")) {
    throw usageError("invalid_input", `hey-check does not read that kind of URL. ${HELP}`);
  }
  if (raw.startsWith("@")) {
    const handle = raw.slice(1);
    if (!HANDLE.test(handle)) {
      throw usageError("invalid_input", "An @handle is 1\u201315 letters, digits or underscores.");
    }
    return { kind: "handle", raw, q: `@${handle}` };
  }
  if (raw.startsWith("$")) {
    if (!TICKER.test(raw)) {
      throw usageError("invalid_input", "A $TICKER is $ followed by 1\u201320 letters or digits.");
    }
    return { kind: "ticker", raw, q: raw };
  }
  if (!NAME.test(raw)) throw usageError("invalid_input", `That does not look like a name. ${HELP}`);
  return { kind: "name", raw, q: raw };
}
function parseAddress(raw, candidate) {
  const normalised = /^0X/.test(candidate) ? `0x${candidate.slice(2)}` : candidate;
  if (!ADDRESS_RE.test(normalised)) {
    throw usageError(
      "invalid_address",
      "A contract address is 0x followed by exactly 40 hexadecimal characters."
    );
  }
  const address2 = normalised.toLowerCase();
  if (address2 === ZERO_ADDRESS || address2 === DEAD_ADDRESS) {
    throw usageError(
      "not_a_contract_identity",
      "The zero and burn addresses are not a contract identity."
    );
  }
  return { kind: "address", raw, address: address2 };
}
function queryFor(input) {
  return input.kind === "address" ? { key: "address", value: input.address } : { key: "q", value: input.q };
}

// src/text.ts
var CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;
var INVISIBLE = /[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\u3164\uFE00-\uFE0F\uFEFF\uFFA0\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}]/gu;
var WHITESPACE = /\s+/g;
function cleanText(value, max = 280) {
  const folded = value.toWellFormed().replace(/[\t\n\r]/g, " ").replace(CONTROL, "").replace(INVISIBLE, "").replace(/\uFFFD/g, "").replace(WHITESPACE, " ").trim();
  const chars = [...folded];
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}\u2026` : folded;
}
function cleanUrl(value) {
  if (typeof value !== "string" || value.length > 600) return null;
  const cleaned = cleanText(value, 600);
  if (!/^https:\/\/\S+$/.test(cleaned)) return null;
  try {
    const url = new URL(cleaned);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return cleaned;
  } catch {
    return null;
  }
}
function firstSentence(text2) {
  const match = /^(.+?[.!?])(?=\s|$)/u.exec(text2);
  return (match?.[1] ?? text2).trim();
}
var plainStyle = { strong: (s) => s, dim: (s) => s };
var ansiStyle = {
  strong: (s) => `\x1B[1m${s}\x1B[22m`,
  dim: (s) => `\x1B[2m${s}\x1B[22m`
};

// src/hey.ts
var RESEARCH_PATH = "/api/agent/research_project";
var SCAN_PATH = "/api/v1/scan";
var SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/;
var obj = (v) => v !== null && typeof v === "object" && !Array.isArray(v) ? v : null;
var arr = (v) => Array.isArray(v) ? v : [];
var rawStr = (v) => typeof v === "string" ? v : null;
var text = (v, max = 280) => {
  const s = rawStr(v) ?? rawStr(obj(v)?.text);
  if (s === null) return null;
  const cleaned = cleanText(s, max);
  return cleaned === "" ? null : cleaned;
};
var code = (v) => typeof v === "string" && /^[A-Z][A-Z0-9_]{0,40}$/.test(v) ? v : null;
var lowerCode = (v) => typeof v === "string" && /^[a-z][a-z0-9_]{0,60}$/.test(v) ? v : null;
var instant = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2}))?$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null;
var address = (v) => typeof v === "string" && ADDRESS_RE.test(v) ? v.toLowerCase() : null;
var slug = (v) => typeof v === "string" && SLUG.test(v) ? v : null;
var count = (v) => typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;
var evidenceId = (v) => typeof v === "string" && /^[a-z0-9]{2,20}:[A-Za-z0-9:._-]{1,200}$/.test(v) ? v : null;
function disclaimerOf(body) {
  return text(obj(body.boundaries)?.disclaimer, 600);
}
function parseAnswered(body, input) {
  const data = obj(body.data);
  const identity = obj(data?.identity);
  const subject = obj(obj(body.subject)?.project);
  const projectSlug = slug(identity?.slug) ?? slug(subject?.slug);
  if (!data || !identity || !projectSlug) {
    throw networkError("invalid_response", "HEY's answer did not carry the project it names.", {
      retryable: false
    });
  }
  const page = cleanUrl(obj(body.links)?.page) ?? cleanUrl(identity.url) ?? `https://heyresearch.xyz/project/${projectSlug}`;
  const state = obj(data.builderState);
  const change = obj(data.latestMeaningfulChange);
  const evidence = obj(arr(change?.evidence)[0]);
  const token = obj(obj(data.contractIdentity)?.token);
  const tokenAddress = address(token?.address);
  const seen = /* @__PURE__ */ new Set();
  const unknowns = [];
  for (const entry of arr(body.unknowns)) {
    const u = obj(entry);
    const category = code(u?.category);
    const statement = text(u?.statement);
    if (!u || !category || !statement) continue;
    const key = `${category}|${statement}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unknowns.push({
      category,
      dimension: rawStr(u.dimension) ? cleanText(String(u.dimension), 60) : null,
      text: statement,
      reason: lowerCode(u.reason)
    });
  }
  const asked = input.kind === "address" ? input.address : null;
  const answerText = text(body.answer, 1200);
  return {
    outcome: "answered",
    answer: answerText ? firstSentence(answerText) : null,
    project: {
      slug: projectSlug,
      name: text(identity.name, 120) ?? text(subject?.name, 120) ?? projectSlug,
      symbol: text(identity.symbol, 24),
      url: cleanUrl(identity.url) ?? page,
      researchLevel: code(identity.researchLevel),
      catalogStatus: code(identity.catalogStatus)
    },
    builder: {
      activityStatus: code(state?.activityStatus) ?? "UNKNOWN",
      activityMeasured: typeof state?.activityMeasured === "boolean" ? state.activityMeasured : null,
      lastMeaningfulShipAt: instant(state?.lastMeaningfulShipAt),
      meaningfulEvents30d: count(state?.meaningfulEvents30d)
    },
    latestShip: change ? {
      id: evidenceId(change.id),
      title: text(change.summary, 200),
      occurredAt: instant(change.occurredAt),
      precision: code(change.precision),
      sourceUrl: cleanUrl(evidence?.sourceUrl) ?? cleanUrl(obj(change.summary)?.sourceUrl),
      receiptUrl: cleanUrl(evidence?.receiptUrl)
    } : null,
    contract: tokenAddress ? { address: tokenAddress, verification: code(token?.verification) } : null,
    askedAddress: asked && asked !== tokenAddress ? asked : null,
    unknowns,
    citation: text(obj(body.citation)?.text, 400),
    page,
    asOf: instant(body.asOf),
    disclaimer: disclaimerOf(body)
  };
}
function parseAmbiguous(body, error) {
  const candidates = [];
  for (const entry of arr(error.candidates)) {
    const c = obj(entry);
    const s = slug(c?.slug);
    if (!c || !s) continue;
    const token = obj(c.token);
    candidates.push({
      slug: s,
      name: text(c.name, 120),
      symbol: text(c.symbol, 24),
      url: cleanUrl(c.url),
      activityStatus: code(c.activityStatus),
      catalogStatus: code(c.catalogStatus),
      tokenAddress: token && token.chainId === CHAIN_ID ? address(token.address) : null
    });
  }
  const total = obj(error.candidatesTotal);
  const totalCount = count(total?.count);
  return {
    outcome: "ambiguous",
    message: text(error.message, 1200) ?? "More than one published project matches. HEY does not guess: pick one.",
    candidates,
    candidatesTotal: totalCount === null ? null : { count: totalCount, atLeast: total?.atLeast === true },
    asOf: instant(body.asOf),
    disclaimer: disclaimerOf(body)
  };
}
function parseNamesakes(scan) {
  const block = obj(obj(scan)?.publishedNamesakes);
  if (!block) return null;
  const items = [];
  for (const entry of arr(block.items)) {
    const n = obj(entry);
    const name = text(n?.name, 120);
    if (!n || !name) continue;
    items.push({
      name,
      slug: slug(n.slug),
      symbol: text(n.symbol, 24),
      contractAddress: address(n.contractAddress),
      shares: lowerCode(n.shares),
      sharesAddressEnding: typeof n.sharesAddressEnding === "boolean" ? n.sharesAddressEnding : null,
      url: cleanUrl(n.url)
    });
  }
  const total = count(block.total) ?? items.length;
  if (total === 0 && items.length === 0) return null;
  return { total, items, line: text(block.line, 600) };
}
function bodyOf(answer) {
  const body = obj(answer.body);
  if (!body || typeof body.status !== "string") {
    throw networkError("invalid_response", "HEY's answer was not an agent answer.", {
      retryable: false
    });
  }
  return body;
}
async function check(input, http) {
  const first = queryFor(input);
  let body = bodyOf(await http.getJson(RESEARCH_PATH, { [first.key]: first.value }));
  if (body.status === "invalid_request" && obj(body.error)?.code === "ambiguous") {
    const typed = input.kind === "name" ? input.q.toLowerCase() : null;
    const exact = typed && SLUG.test(typed) ? arr(obj(body.error)?.candidates).some((c) => obj(c)?.slug === typed) : false;
    if (typed && exact) {
      body = bodyOf(await http.getJson(RESEARCH_PATH, { project: typed }));
    }
  }
  const error = obj(body.error);
  switch (body.status) {
    case "ok":
      return parseAnswered(body, input);
    case "invalid_request":
      if (error?.code === "ambiguous") return parseAmbiguous(body, error);
      throw new CheckError(
        lowerCode(error?.code) ?? "invalid_request",
        text(error?.message, 600) ?? "HEY refused the request.",
        EXIT.REFUSED
      );
    case "not_found": {
      const message = text(error?.message, 1200) ?? text(body.answer, 1200) ?? "HEY holds no published project for that.";
      if (input.kind !== "address") {
        return {
          outcome: "not_found",
          message,
          address: null,
          scanUrl: null,
          namesakes: null,
          namesakesRead: false,
          asOf: instant(body.asOf),
          disclaimer: disclaimerOf(body)
        };
      }
      let scanBody = null;
      try {
        const scan = await http.getJson(SCAN_PATH, {
          chain: String(CHAIN_ID),
          token: input.address
        });
        scanBody = scan.status < 400 ? obj(scan.body) : null;
      } catch {
        scanBody = null;
      }
      return {
        outcome: "not_found",
        message,
        address: input.address,
        scanUrl: cleanUrl(scanBody?.scan_url) ?? `https://heyresearch.xyz/scan/${input.address}`,
        namesakes: parseNamesakes(scanBody),
        namesakesRead: scanBody !== null,
        asOf: instant(body.asOf),
        disclaimer: disclaimerOf(body)
      };
    }
    case "unavailable":
      throw networkError(
        "unavailable",
        text(error?.message, 600) ?? "HEY could not answer right now. Try again shortly."
      );
    case "moved":
      throw new CheckError(
        "moved",
        text(body.answer, 600) ?? "HEY says this project moved; check its new name or slug.",
        EXIT.REFUSED
      );
    default:
      throw networkError("invalid_response", `HEY answered an unknown status.`, {
        retryable: false
      });
  }
}

// src/words.ts
var STATUS_LABEL = {
  SHIPPING: "Shipping",
  ACTIVE: "Active",
  RESUMED: "Resumed",
  QUIET: "Quiet",
  DORMANT: "Dormant",
  UNKNOWN: "Unknown"
};
var statusLabel = (code2) => STATUS_LABEL[code2] ?? "Unknown";
var isBuilding = (code2) => code2 === "SHIPPING" || code2 === "ACTIVE" || code2 === "RESUMED";
var BOUNDARY = "Builder evidence, not a safety verdict or investment advice.";
var shortAddress = (address2) => `${address2.slice(0, 6)}\u2026${address2.slice(-4)}`;
var HOUR = 36e5;
var DAY = 24 * HOUR;
function ago(at, now) {
  const ms = now.getTime() - Date.parse(at);
  if (!Number.isFinite(ms) || ms < HOUR) return ms < 0 ? "just now" : "under an hour ago";
  if (ms < DAY) {
    const h = Math.floor(ms / HOUR);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  const d = Math.floor(ms / DAY);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}
var isoDay = (at) => new Date(Date.parse(at)).toISOString().slice(0, 10);
var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function humanDay(at) {
  return `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]} ${at.getUTCFullYear()}`;
}
function lastShipLine(builder, now) {
  if (builder.lastMeaningfulShipAt) return `Last shipped ${ago(builder.lastMeaningfulShipAt, now)}`;
  if (builder.meaningfulEvents30d === 0) return "No meaningful ship recorded in 30 days";
  return "Last ship not known to HEY";
}
function eventsLine(n) {
  if (n === null) return "Meaningful events in 30 days: not measured";
  return `${n} meaningful event${n === 1 ? "" : "s"} in 30 days`;
}
function verificationWords(v) {
  switch (v) {
    case "VERIFIED":
      return "token verified";
    case "UNVERIFIED":
      return "token not verified";
    case "MISMATCH":
      return "token mismatch: the project's own site names another contract";
    default:
      return "token verification unknown";
  }
}
function sharesPhrase(shares) {
  switch (shares) {
    case "name_and_ticker":
      return "carries the same name and ticker";
    case "name":
      return "carries the same name";
    case "ticker":
      return "carries the same ticker";
    default:
      return "carries its name or ticker";
  }
}
function namesakeSentence(n) {
  const where = n.contractAddress ? `on a different contract, ${shortAddress(n.contractAddress)}` : "on a different contract";
  const ending = n.sharesAddressEnding ? ", and its address ends in the same four characters" : "";
  return `${n.name} is published on HEY ${where}; this token ${sharesPhrase(n.shares)}${ending}.`;
}
var CONTRACT_IS_IDENTITY = "On chain a token is its contract, never its name or ticker.";

// src/card/model.ts
var host = (url) => url.replace(/^https:\/\//, "").replace(/\/$/, "");
function cardModel(result, input, now) {
  const checkedOn = `Checked ${humanDay(now)} UTC`;
  switch (result.outcome) {
    case "answered": {
      const { project, builder, contract } = result;
      const facts = [eventsLine(builder.meaningfulEvents30d)];
      if (contract) {
        facts.push(
          `${shortAddress(contract.address)}${contract.verification === "VERIFIED" ? ` \xB7 ${verificationWords("VERIFIED")}` : ""}`
        );
      }
      return {
        // A name the card's font cannot draw at all (emoji, CJK …) falls back to the slug.
        title: cardText(project.name) ? project.name : project.slug,
        ticker: project.symbol ? `$${project.symbol.replace(/^\$/, "")}` : null,
        pill: {
          label: statusLabel(builder.activityStatus),
          tone: isBuilding(builder.activityStatus) ? "lime" : "grey"
        },
        headline: lastShipLine(builder, now),
        detail: result.latestShip?.title ?? null,
        facts,
        notice: null,
        footerUrl: host(result.page),
        checkedOn
      };
    }
    case "not_found": {
      if (result.address) {
        const n = result.namesakes?.items[0];
        const others = (result.namesakes?.total ?? 0) - 1;
        return {
          title: shortAddress(result.address),
          ticker: null,
          pill: null,
          headline: "Not a published project on HEY",
          detail: n ? null : "HEY holds no published project for this contract. That is a statement about HEY's index, not about the token.",
          facts: [],
          notice: n ? {
            heading: "Same name on another contract",
            body: `${namesakeSentence(n)}${others > 0 ? ` ${others} more published project${others === 1 ? "" : "s"} share it.` : ""}`,
            foot: CONTRACT_IS_IDENTITY
          } : null,
          footerUrl: host(result.scanUrl ?? `https://heyresearch.xyz/scan/${result.address}`),
          checkedOn
        };
      }
      return {
        title: input.raw,
        ticker: null,
        pill: null,
        headline: "Not a published project on HEY",
        detail: "HEY holds no published project matching that name or ticker. That is a statement about HEY's index, not about the project.",
        facts: [],
        notice: null,
        footerUrl: "heyresearch.xyz",
        checkedOn
      };
    }
    case "ambiguous":
      return null;
  }
}

// src/card/write.ts
import { closeSync, constants, lstatSync, openSync, statSync, writeSync } from "fs";
import { dirname as dirname2, resolve } from "path";
var cardError = (message) => new CheckError("card_not_written", message, EXIT.CARD_FAILED);
function defaultCardName(result, input) {
  let stem;
  if (result.outcome === "answered") stem = result.project.slug;
  else if (input.kind === "address")
    stem = `${input.address.slice(0, 6)}-${input.address.slice(-4)}`;
  else {
    stem = input.q.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  }
  return `hey-check-${stem || "result"}.png`;
}
function writeCard(path, png, cwd) {
  if (!path.toLowerCase().endsWith(".png")) throw cardError("The card path must end in .png.");
  const target = resolve(cwd, path);
  let parent;
  try {
    parent = statSync(dirname2(target));
  } catch {
    throw cardError(`The directory ${dirname2(target)} does not exist.`);
  }
  if (!parent.isDirectory()) throw cardError(`${dirname2(target)} is not a directory.`);
  let existing;
  try {
    existing = lstatSync(target);
  } catch {
    existing = null;
  }
  if (existing?.isSymbolicLink()) {
    throw cardError(`${target} is a symbolic link; hey-check does not write through links.`);
  }
  if (existing && !existing.isFile()) throw cardError(`${target} exists and is not a file.`);
  const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
  let fd;
  try {
    fd = openSync(
      target,
      constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | noFollow,
      420
    );
  } catch (error) {
    const code2 = error.code;
    if (code2 === "ELOOP")
      throw cardError(`${target} is a symbolic link; hey-check does not write through links.`);
    throw cardError(`Could not write ${target}${code2 ? ` (${code2})` : ""}.`);
  }
  try {
    writeSync(fd, png);
  } finally {
    closeSync(fd);
  }
  return target;
}

// src/json.ts
var JSON_SCHEMA = "hey.check/v1";
function emptyDocument(now, input, requests) {
  const sent = input ? queryFor(input) : null;
  return {
    schema: JSON_SCHEMA,
    ok: false,
    outcome: null,
    chain: { name: CHAIN_NAME, chainId: CHAIN_ID, caip2: CAIP2 },
    input: input && sent ? { raw: input.raw, kind: input.kind, sent: { [sent.key]: sent.value } } : null,
    answer: null,
    project: null,
    builder: null,
    latestShip: null,
    contract: null,
    unknowns: null,
    candidates: null,
    candidatesTotal: null,
    notFound: null,
    citation: null,
    page: null,
    card: null,
    tweet: null,
    boundary: BOUNDARY,
    disclaimer: null,
    error: null,
    source: { requests, asOf: null, fetchedAt: now.toISOString() }
  };
}
function resultDocument(result, base, extra) {
  const doc = {
    ...base,
    ok: true,
    outcome: result.outcome,
    card: extra.cardPath ? { path: extra.cardPath } : null,
    tweet: extra.tweet,
    disclaimer: result.disclaimer,
    source: { ...base.source, asOf: result.asOf }
  };
  switch (result.outcome) {
    case "answered":
      return {
        ...doc,
        answer: result.answer,
        project: { ...result.project },
        builder: { ...result.builder, activityLabel: statusLabel(result.builder.activityStatus) },
        latestShip: result.latestShip ? { ...result.latestShip } : null,
        contract: result.contract ? { ...result.contract } : null,
        unknowns: result.unknowns.map((u) => ({ ...u })),
        citation: result.citation,
        page: result.page
      };
    case "ambiguous":
      return {
        ...doc,
        answer: result.message,
        candidates: result.candidates.map((c) => ({ ...c })),
        candidatesTotal: result.candidatesTotal
      };
    case "not_found":
      return {
        ...doc,
        answer: result.message,
        notFound: {
          message: result.message,
          address: result.address,
          scanUrl: result.scanUrl,
          namesakesRead: result.namesakesRead,
          namesakes: result.namesakes ? {
            total: result.namesakes.total,
            line: result.namesakes.line,
            items: result.namesakes.items.map((n) => ({ ...n }))
          } : null
        },
        page: result.scanUrl
      };
  }
}
function errorDocument(error, base) {
  return {
    ...base,
    error: {
      code: error.code,
      message: error.message,
      retryable: error.details.retryable ?? false,
      ...error.details.requestId ? { requestId: error.details.requestId } : {},
      ...error.details.retryAfterSeconds !== void 0 ? { retryAfterSeconds: error.details.retryAfterSeconds } : {}
    }
  };
}

// src/terminal.ts
var LABEL_WIDTH = 14;
var row = (s, label, value) => `  ${s.dim(label.padEnd(LABEL_WIDTH))}${value}`;
var more = (value) => `  ${" ".repeat(LABEL_WIDTH)}${value}`;
function answered(r, ctx) {
  const s = ctx.style;
  const lines = [];
  if (r.answer) lines.push(s.strong(r.answer), "");
  const ticker = r.project.symbol ? `  $${r.project.symbol.replace(/^\$/, "")}` : "";
  lines.push(`  ${s.strong(r.project.name)}${ticker}`);
  lines.push(row(s, "Status", s.strong(statusLabel(r.builder.activityStatus))));
  const at = r.builder.lastMeaningfulShipAt;
  if (at) {
    const title = r.latestShip?.title ? ` \u2014 ${r.latestShip.title}` : "";
    lines.push(row(s, "Last ship", `${ago(at, ctx.now)} (${isoDay(at)})${title}`));
    if (r.latestShip?.sourceUrl) lines.push(more(s.dim(r.latestShip.sourceUrl)));
  } else {
    lines.push(row(s, "Last ship", lastShipLine(r.builder, ctx.now)));
  }
  const n = r.builder.meaningfulEvents30d;
  lines.push(
    row(
      s,
      "Last 30 days",
      n === null ? "not measured" : `${n} meaningful event${n === 1 ? "" : "s"}`
    )
  );
  if (r.contract) {
    const v = r.contract.verification;
    lines.push(
      row(s, "Contract", `${r.contract.address} \xB7 ${verificationWords(v)}${v ? ` (${v})` : ""}`)
    );
  } else {
    lines.push(row(s, "Contract", "no token on HEY\u2019s record for this project"));
  }
  if (r.askedAddress) lines.push(row(s, "You asked", r.askedAddress));
  const shown = r.unknowns.slice(0, 2);
  shown.forEach((u, i) => {
    const value = `${u.category} \u2014 ${u.text}`;
    lines.push(i === 0 ? row(s, "Unknowns", value) : more(value));
  });
  if (r.unknowns.length > shown.length) {
    lines.push(more(s.dim(`+${r.unknowns.length - shown.length} more (--json lists them all)`)));
  }
  lines.push(row(s, "Page", r.page));
  if (ctx.cardPath) lines.push(row(s, "Card", ctx.cardPath));
  lines.push("");
  if (r.citation) lines.push(s.dim(r.citation));
  lines.push(s.dim(BOUNDARY));
  return lines;
}
function ambiguous(r, ctx) {
  const s = ctx.style;
  const lines = [s.strong("More than one published project matches. HEY does not guess."), ""];
  const width = Math.min(44, Math.max(12, ...r.candidates.map((c) => c.slug.length)));
  for (const c of r.candidates) {
    const name = c.name ?? c.slug;
    const sym = c.symbol ? ` ($${c.symbol.replace(/^\$/, "")})` : "";
    const status = c.activityStatus ? ` \xB7 ${statusLabel(c.activityStatus)}` : "";
    const token = c.tokenAddress ? ` \xB7 ${shortAddress(c.tokenAddress)}` : "";
    lines.push(`  ${s.strong(c.slug.padEnd(width))}  ${name}${sym}${status}${token}`);
  }
  const total = r.candidatesTotal;
  if (total && total.count > r.candidates.length) {
    lines.push(
      "",
      s.dim(
        `  Showing ${r.candidates.length} of ${total.atLeast ? "at least " : ""}${total.count} matches.`
      )
    );
  }
  const example = r.candidates[0]?.slug ?? "<slug>";
  lines.push(
    "",
    `Pick one: hey-check ${example}   (or pass the token's 0x contract address)`,
    "",
    s.dim(BOUNDARY)
  );
  return lines;
}
function notFound(r, ctx) {
  const s = ctx.style;
  const subject = r.address ?? ctx.input.raw;
  const lines = [s.strong(`${subject} is not a published project on HEY.`), "", `  ${r.message}`];
  if (r.namesakes && r.namesakes.items.length > 0) {
    lines.push("", `  ${s.strong("Same name or ticker on another contract")}`);
    if (!/different contract/i.test(r.message)) {
      lines.push(`  ${r.namesakes.line ?? namesakeSentence(r.namesakes.items[0])}`);
    }
    for (const n of r.namesakes.items) {
      const sym = n.symbol ? ` ($${n.symbol.replace(/^\$/, "")})` : "";
      const addr = n.contractAddress ? ` \xB7 ${n.contractAddress}` : "";
      lines.push(`    ${n.name}${sym}${addr}${n.url ? ` \xB7 ${n.url}` : ""}`);
    }
    if (r.namesakes.total > r.namesakes.items.length) {
      lines.push(`    ${s.dim(`+${r.namesakes.total - r.namesakes.items.length} more`)}`);
    }
  } else if (r.address && !r.namesakesRead) {
    lines.push("", s.dim("  HEY\u2019s list of published namesakes could not be read this time."));
  }
  lines.push("");
  if (r.scanUrl) lines.push(row(s, "Scan", r.scanUrl));
  if (ctx.cardPath) lines.push(row(s, "Card", ctx.cardPath));
  if (r.scanUrl || ctx.cardPath) lines.push("");
  if (r.address && !r.message.includes(CONTRACT_IS_IDENTITY))
    lines.push(s.dim(CONTRACT_IS_IDENTITY));
  lines.push(s.dim(BOUNDARY));
  return lines;
}
function renderTerminal(result, ctx) {
  switch (result.outcome) {
    case "answered":
      return answered(result, ctx);
    case "ambiguous":
      return ambiguous(result, ctx);
    case "not_found":
      return notFound(result, ctx);
  }
}
function quietLine(result, now) {
  switch (result.outcome) {
    case "answered":
      return `${result.project.slug}	${statusLabel(result.builder.activityStatus)}	${lastShipLine(result.builder, now)}`;
    case "ambiguous":
      return result.candidates.map((c) => c.slug).join("\n");
    case "not_found":
      return "not_published";
  }
}

// src/tweet.ts
var TWEET_LIMIT = 280;
var TWEET_URL_WEIGHT = 23;
var URL_RE = /https?:\/\/\S+/g;
function tweetLength(text2) {
  let total = 0;
  const rest = text2.replace(URL_RE, () => {
    total += TWEET_URL_WEIGHT;
    return "";
  });
  for (const ch of rest) {
    const cp = ch.codePointAt(0) ?? 0;
    const light = cp <= 4351 || cp >= 8192 && cp <= 8205 || cp >= 8208 && cp <= 8223 || cp >= 8242 && cp <= 8247;
    total += light ? 1 : 2;
  }
  return total;
}
function fit(build, name) {
  let n = [...name];
  let out = build(name);
  while (tweetLength(out) > TWEET_LIMIT && n.length > 4) {
    n = n.slice(0, -1);
    out = build(`${n.join("").trimEnd()}\u2026`);
  }
  return out;
}
function tweetText(result, input, now) {
  switch (result.outcome) {
    case "answered": {
      const { project, builder } = result;
      const sym = project.symbol ? ` ($${project.symbol.replace(/^\$/, "")})` : "";
      const label = statusLabel(builder.activityStatus);
      const facts = `${lastShipLine(builder, now)}; ${eventsLine(builder.meaningfulEvents30d)}.`;
      return fit(
        (name) => `Dev check on ${name}${sym}, Robinhood Chain: ${label}. ${facts}

Builder evidence from HEY Research Lab, not a safety verdict: ${result.page}`,
        project.name
      );
    }
    case "not_found": {
      if (result.address) {
        const n = result.namesakes?.items[0];
        const namesake = n ? ` ${n.name} is published on a different contract${n.contractAddress ? `, ${shortAddress(n.contractAddress)}` : ""}. On chain a token is its contract, never its name or ticker.` : "";
        const url = result.scanUrl ?? `https://heyresearch.xyz/scan/${result.address}`;
        return fit(
          (name) => `Dev check on ${shortAddress(result.address)}, Robinhood Chain: not a published project on HEY Research Lab.${name}

${url}`,
          namesake
        );
      }
      return fit(
        (name) => `Dev check on "${name}", Robinhood Chain: no published project on HEY Research Lab matches it. That is a statement about HEY's index, not a verdict.

https://heyresearch.xyz`,
        input.raw
      );
    }
    case "ambiguous":
      return null;
  }
}

// src/run.ts
var OPTIONS = {
  json: { type: "boolean" },
  quiet: { type: "boolean" },
  tweet: { type: "boolean" },
  "no-card": { type: "boolean" },
  out: { type: "string", short: "o" },
  "no-color": { type: "boolean" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" }
};
var NETWORK_FLAGS = /^--(chain|chain-id|chainid|network|net|rpc|rpc-url)(=|$)/i;
var HELP2 = `hey-check \u2014 a dev check for a Robinhood Chain token or project

Is anyone building it, and what did they ship? Answered from HEY Research Lab's public record
(heyresearch.xyz), printed here and drawn as a 1200\xD7675 PNG card.

Usage
  hey-check <input> [options]

Input
  0x\u2026                    a token or contract address (0x + 40 hex)
  $TICKER                a ticker, e.g. $CHIT (in a shell, quote it: '$CHIT')
  name or slug           a project name, e.g. loom
  @handle                an X handle
  https://x.com/<handle> an X profile URL

Options
  --json                 print one JSON document (schema hey.check/v1) on stdout
  --no-card              do not draw the PNG card
  -o, --out <file.png>   where to write the card (default ./hey-check-<slug>.png)
  --tweet                print a ready-to-post text (under 280 characters) instead of the report
  --quiet                print one line
  --no-color             no ANSI styling (also NO_COLOR)
  -h, --help             this help
  -v, --version          the version

Exit codes
  0 answered \xB7 1 card not written \xB7 2 bad input \xB7 3 HEY refused \xB7 4 not published on HEY
  5 rate limited \xB7 6 network or HEY error \xB7 7 more than one match (pick one)

Builder evidence, not a safety verdict or investment advice. Robinhood Chain (4663) only.
HEY Research Lab is independent and not affiliated with Robinhood.`;
async function run(argv, io) {
  const wantsJson = argv.includes("--json");
  let input = null;
  let http = null;
  const fail = (error) => {
    if (wantsJson) {
      const doc = errorDocument(error, emptyDocument(io.now(), input, http?.requests ?? []));
      io.stdout(`${JSON.stringify(doc, null, 2)}
`);
    } else {
      io.stderr(`hey-check: ${error.message} (${error.code})
`);
      if (error.details.requestId) io.stderr(`hey-check: request id ${error.details.requestId}
`);
      if (error.exitCode === EXIT.USAGE) io.stderr("hey-check: see `hey-check --help`\n");
    }
    return error.exitCode;
  };
  try {
    if (argv.some((a) => NETWORK_FLAGS.test(a))) {
      throw usageError(
        "unsupported_chain",
        "HEY supports Robinhood Chain (4663) only, and it is implicit: hey-check takes no chain or network option."
      );
    }
    let parsed;
    try {
      parsed = parseArgs({
        args: [...argv],
        options: OPTIONS,
        allowPositionals: true,
        strict: true
      });
    } catch (error) {
      throw usageError("invalid_option", error instanceof Error ? error.message : String(error));
    }
    const { values, positionals } = parsed;
    if (values.version) {
      io.stdout(`${CHECK_VERSION}
`);
      return EXIT.OK;
    }
    if (values.help) {
      io.stdout(`${HELP2}
`);
      return EXIT.OK;
    }
    if (positionals.length === 0) {
      if (wantsJson)
        throw usageError("missing_argument", "Nothing to check; see `hey-check --help`.");
      io.stderr(`${HELP2}
`);
      return EXIT.USAGE;
    }
    if (positionals.length > 1) {
      positionals.splice(0, positionals.length, positionals.join(" "));
    }
    if (values.out !== void 0 && values["no-card"]) {
      throw usageError("invalid_option", "--out and --no-card cannot be used together.");
    }
    if (values.out !== void 0 && !values.out.toLowerCase().endsWith(".png")) {
      throw usageError("invalid_option", "--out takes a path ending in .png.");
    }
    input = parseInput(positionals[0]);
    const baseUrl = io.env.HEY_BASE_URL ? parseBaseUrl(io.env.HEY_BASE_URL) : DEFAULT_BASE_URL;
    http = new HeyHttp(io.fetchImpl, baseUrl);
    const now = io.now();
    const result = await check(input, http);
    let cardPath = null;
    let cardFailure = null;
    const model = values["no-card"] ? null : cardModel(result, input, now);
    if (model) {
      try {
        const renderer2 = io.cardRenderer();
        const png = renderer2.render(buildCardSvg(model, renderer2.measure));
        const written = writeCard(values.out ?? defaultCardName(result, input), png, io.cwd);
        const rel = relative(io.cwd, written);
        cardPath = rel && !rel.startsWith("..") && !isAbsolute(rel) ? `./${rel}` : written;
      } catch (error) {
        cardFailure = error instanceof CheckError ? error : new CheckError(
          "card_not_written",
          `The card could not be drawn: ${error instanceof Error ? error.message : String(error)}`,
          EXIT.CARD_FAILED
        );
      }
    }
    const tweet = values.tweet ? tweetText(result, input, now) : null;
    const exitCode2 = result.outcome === "ambiguous" ? EXIT.AMBIGUOUS : result.outcome === "not_found" ? EXIT.NOT_FOUND : cardFailure ? EXIT.CARD_FAILED : EXIT.OK;
    if (values.json) {
      let doc = resultDocument(result, emptyDocument(now, input, http.requests), {
        cardPath,
        tweet
      });
      if (cardFailure) doc = { ...errorDocument(cardFailure, doc), ok: true };
      io.stdout(`${JSON.stringify(doc, null, 2)}
`);
      return exitCode2;
    }
    if (cardFailure) io.stderr(`hey-check: ${cardFailure.message} (${cardFailure.code})
`);
    if (values.tweet) {
      if (tweet) io.stdout(`${tweet}
`);
      else io.stderr("hey-check: nothing to post until one project is picked.\n");
      if (cardPath) io.stderr(`hey-check: card written to ${cardPath}
`);
      if (result.outcome === "ambiguous") {
        io.stderr(
          `${renderTerminal(result, { input, now, style: plainStyle, cardPath }).join("\n")}
`
        );
      }
      return exitCode2;
    }
    if (values.quiet) {
      io.stdout(`${quietLine(result, now)}
`);
      return exitCode2;
    }
    const colour = io.isTTY && !values["no-color"] && !(io.env.NO_COLOR !== void 0 && io.env.NO_COLOR !== "");
    const lines = renderTerminal(result, {
      input,
      now,
      style: colour ? ansiStyle : plainStyle,
      cardPath
    });
    io.stdout(`${lines.join("\n")}
`);
    return exitCode2;
  } catch (error) {
    if (error instanceof CheckError) return fail(error);
    return fail(
      new CheckError(
        "internal_error",
        error instanceof Error ? error.message : String(error),
        EXIT.NETWORK,
        { retryable: false }
      )
    );
  }
}

// src/cli.ts
var renderer = null;
var exitCode = await run(process.argv.slice(2), {
  fetchImpl: (input, init) => fetch(input, init),
  stdout: (text2) => process.stdout.write(text2),
  stderr: (text2) => process.stderr.write(text2),
  env: process.env,
  isTTY: process.stdout.isTTY === true,
  now: () => /* @__PURE__ */ new Date(),
  cwd: process.cwd(),
  cardRenderer: () => {
    if (!renderer) {
      const fonts = loadFonts();
      renderer = { measure: createMeasure(fonts), render: (svg) => renderPng(svg, fonts) };
    }
    return renderer;
  }
});
process.exitCode = exitCode;
