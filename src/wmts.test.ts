import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { getOptions, getWMTSUrls } from "./wmts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { processTilesConfig } from "./tiles";
import { Extent } from "./types";

const CAPABILITIES_PATH = "../tests/fixtures/wmts-capabilities.xml";
const MINIMAL_TILE_PATH = "../tests/fixtures/minimal-tile.png";

let capabilitiesXml: string;
let tilePng: ArrayBuffer;
let originalFetch: typeof globalThis.fetch;

// Register happy-dom for local access to DOMParser
beforeAll(async () => {
  // Load fixtures
  const capabilitiesFile = Bun.file(new URL(CAPABILITIES_PATH, import.meta.url));
  capabilitiesXml = await capabilitiesFile.text();
  const tileFile = Bun.file(new URL(MINIMAL_TILE_PATH, import.meta.url));
  tilePng = await tileFile.arrayBuffer();

  // Save original fetch before happy-dom overrides it
  originalFetch = globalThis.fetch;

  // Register happy-dom
  GlobalRegistrator.register({
    settings: { fetch: { disableSameOriginPolicy: true } },
  });

  // Override fetch with our mock that works correctly
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const urlObj = new URL(url);
    const params = urlObj.searchParams;

    // Handle GetCapabilities request
    if (params.get("REQUEST") === "GetCapabilities") {
      return new Response(capabilitiesXml, {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      });
    }

    // Handle GetTile request
    if (params.get("REQUEST") === "GetTile") {
      return new Response(tilePng, {
        status: 200,
        headers: { "Content-Type": "image/png" },
      });
    }

    return new Response("Not Found", { status: 404 });
  };
});

// De-Register happy-dom so that no other test files are influenced accidentally
afterAll(async () => {
  globalThis.fetch = originalFetch;
  await GlobalRegistrator.unregister();
});

const url = "http://localhost:8081/ogc/wmts?SERVICE=WMTS&REQUEST=GetCapabilities";
const layer = "group";
const matrixSet = "EPSG:3857";

describe("getOptions", () => {
  test("gets options", async () => {
    const options = await getOptions(url, { layer, matrixSet });

    expect(options?.matrixSet).toBe(matrixSet);
    expect(options?.layer).toBe(layer);
  });
});

describe("processWMTSTilesConfig", () => {
  test("process WMTS config", async () => {
    const config = {
      bbox: [13.3, 52.5, 13.4, 52.55] as Extent,
      minZoom: 11,
      maxZoom: 12,
    };
    const options = await getOptions(url, { layer, matrixSet });
    const result = await processTilesConfig({ config, options });

    expect(result.crs).toBe(matrixSet);
  });
});

describe("getTileUrls", () => {
  test("get tile urls for one zoom level", async () => {
      const options = await getOptions(url, { layer, matrixSet });
    const tileUrls = getWMTSUrls({
      bbox: [13.3, 52.5, 13.4, 52.55] as Extent,
      minZoom: 11,
      maxZoom: 11,
      ...options,
    });
    
    const result = Array.from(tileUrls)
    expect(result.length).toBe(1);
    // Correct number of zoom levels
    expect(new Set(result.map(tile => tile.zoom))).toEqual(new Set([11]));
    // Correct number of tile per zoom level
    expect(new Set(result.map(tile => tile.count))).toEqual(new Set([2]));
    // Correct number of URLs
    expect(result.map(tile => tile.urls).flat()).toHaveLength(2);
    // URLs are unique
    expect(new Set(result.map(tile => tile.urls).flat())).toHaveLength(2);

    console.log(result.map(tile => tile.urls).flat())
  })

  test("get tile urls for multiple zoom levels", async () => {
    const options = await getOptions(url, { layer, matrixSet });
    const tileUrls = getWMTSUrls({
      bbox: [13.3, 52.5, 13.4, 52.55] as Extent,
      minZoom: 11,
      maxZoom: 12,
      ...options,
    });

    const result = Array.from(tileUrls)
    expect(result.length).toBe(2);
    // Correct number of zoom levels
    expect(new Set(result.map(tile => tile.zoom))).toEqual(new Set([11, 12]));
    // Correct number of tile per zoom level
    expect(new Set(result.map(tile => tile.count))).toEqual(new Set([2, 4]));
    // Correct number of URLs
    expect(result.map(tile => tile.urls).flat()).toHaveLength(6);
    // URLs are unique
    expect(new Set(result.map(tile => tile.urls).flat())).toHaveLength(6);
  });
});
