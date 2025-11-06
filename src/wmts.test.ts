import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import makeWMTSTileCollection from "./wmts";
import EXTENT from "../tests/fixtures/extent";
import { fetchTiles } from "./tiles";

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
});

// De-Register happy-dom so that no other test files are influenced accidentally
afterAll(async () => {
  globalThis.fetch = originalFetch;
  await GlobalRegistrator.unregister();
});

describe("makeWMTSTileCollection", () => {
  beforeAll(() => {
    // Override fetch with our mock that works correctly
    // @ts-ignore
    globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
          ? input.toString()
          : input.url;
      const urlObj = new URL(url);
      const params = urlObj.searchParams;

      // Handle GetCapabilities request
      if (params.get("REQUEST") === "GetCapabilities") {
        return new Response(capabilitiesXml, {
          status: 200,
          headers: { "Content-Type": "application/xml" },
        });
      }

      return new Response("Not Found", { status: 404 });
    };
  });

  // De-Register mock-fetch so that no other test files are influenced accidentally
  afterAll(async () => {
    globalThis.fetch = originalFetch;
  });

  const capUrl = "http://mock-request/ogc/wmts?SERVICE=WMTS&REQUEST=GetCapabilities";
  const layer = "group";
  const matrixSet = "EPSG:3857";

  test("get tileCollection for one zoom level", async () => {
    const tileCollection = await makeWMTSTileCollection(
      { layer, matrixSet },
      {
        minZoom: 11,
        maxZoom: 11,
        targetExtent: EXTENT.extent,
        targetProjection: EXTENT.projection,
      },
      capUrl
    );

    // One Zoom level
    expect(tileCollection.tileRanges.length).toBe(1);
    // Two tiles
    expect(tileCollection.totalCount).toBe(2);
  });

  test("get tileCollection for multiple zoom levels", async () => {
    const tileCollection = await makeWMTSTileCollection(
      { layer, matrixSet },
      {
        minZoom: 11,
        maxZoom: 12,
        targetExtent: EXTENT.extent,
        targetProjection: EXTENT.projection,
      },
      capUrl
    );

    // Two Zoom level
    expect(tileCollection.tileRanges.length).toBe(2);
    // Six tiles
    expect(tileCollection.totalCount).toBe(6);
  });
});

describe("fetch WMTS tiles", async () => {
  const capUrl = "http://localhost/ogc/wmts?SERVICE=WMTS&REQUEST=GetCapabilities";
  const layer = "group";
  const matrixSet = "EPSG:3857";

  test("download correct tiles for one zoom level", async () => {
    const tileCollection = await makeWMTSTileCollection(
      { layer, matrixSet },
      {
        minZoom: 11,
        maxZoom: 11,
        targetExtent: EXTENT.extent,
        targetProjection: EXTENT.projection,
      },
      capUrl
    );

    console.log(`Starting download of ${tileCollection.totalCount} tiles...`);
    const downloadedTiles: Array<{
      url: string;
      size: number;
      x: number;
      y: number;
      z: number;
    }> = [];
    for await (const tile of fetchTiles(tileCollection)) {
      downloadedTiles.push({
        url: tile.url,
        size: tile.blob.size,
        x: tile.x,
        y: tile.y,
        z: tile.z,
      });
      console.log(`Download from ${tile.url} finished (${tile.blob.size} Bytes)`);
    }

    // All tiles were downloaded
    expect(downloadedTiles).toHaveLength(tileCollection.totalCount);
    // URLs are unique
    expect(new Set(downloadedTiles.map((tile) => tile.url))).toHaveLength(
      tileCollection.totalCount
    );
    // URLs were generated with the correct z-values
    expect(
      new Set(downloadedTiles.map((tile) => {
        const urlObj = new URL(tile.url);
        const z = urlObj.searchParams.get("TileMatrix")
        return Number(z)
      }))
    ).toEqual(new Set([11]));
    // URLs were generated with the correct x-values
    expect(
      new Set(downloadedTiles.map((tile) => {
        const urlObj = new URL(tile.url);
        const z = urlObj.searchParams.get("TileCol")
        return Number(z)
      }))
    ).toEqual(new Set([2199, 2200]));
    // URLs were generated with the correct y-values
    expect(
      new Set(downloadedTiles.map((tile) => {
        const urlObj = new URL(tile.url);
        const z = urlObj.searchParams.get("TileRow")
        return Number(z)
      }))
    ).toEqual(new Set([426]));

    // Verify each tile has valid properties
    for (const tile of downloadedTiles) {
      expect(tile.size).toBeOneOf([20999, 21279]);
      expect(tile.x).toBeOneOf([2199, 2200]);
      expect(tile.y).toBe(426);
      expect(tile.z).toBe(tileCollection.minZoom);
      expect(tile.z).toBe(tileCollection.maxZoom);
    }
  });
});
