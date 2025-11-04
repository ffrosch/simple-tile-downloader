import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { processTilesConfig, fetchTiles } from "./tiles";

// Mock tile server setup
let server: ReturnType<typeof Bun.serve> | null = null;
const TEST_PORT = 3857;
const MINIMAL_TILE_PATH = "../tests/fixtures/minimal-tile.png";

beforeAll(async () => {
  // Load minimal PNG fixture
  const tileFile = Bun.file(new URL(MINIMAL_TILE_PATH, import.meta.url));
  const tilePng = await tileFile.arrayBuffer();

  // Start a mock tile server
  server = Bun.serve({
    port: TEST_PORT,
    fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      // Parse tile coordinates from URL pattern: /{z}/{x}/{y}.png
      const match = path.match(/^\/(\d+)\/(\d+)\/(\d+)\.png$/);

      if (match) {
        // const [, z, x, y] = match;

        return new Response(tilePng, {
          headers: { "Content-Type": "image/png" },
        });
      }

      return new Response("Not Found", { status: 404 });
    },
  });
});

afterAll(() => {
  server?.stop();
});

describe("processTilesConfig", () => {
  test("calculates tile ranges for multiple zoom levels", async () => {
    const config = await processTilesConfig({
      url: `http://localhost:${TEST_PORT}/{z}/{x}/{y}.png`,
      bbox: [13.3, 52.5, 13.4, 52.55], // Very small area in Berlin
      minZoom: 11,
      maxZoom: 13,
      crs: "EPSG:3857", // Web Mercator
    });

    expect(config.totalCount).toBeGreaterThan(0);
    expect(config.tileRanges).toHaveLength(3); // Zoom levels 11, 12, 13
    expect(config.minZoom).toBe(11);
    expect(config.maxZoom).toBe(13);
  });

  test("throws error for invalid CRS", async () => {
    await expect(async () => {
      await processTilesConfig({
        url: `http://localhost:${TEST_PORT}/{z}/{x}/{y}.png`,
        bbox: [13.3, 52.5, 13.4, 52.55],
        minZoom: 11,
        maxZoom: 13,
        crs: "INVALID:CRS",
      });
    }).toThrow();
  });

  test("throws error for missing subdomains when {s} in URL", async () => {
    await expect(async () => {
      await processTilesConfig({
        url: `http://{s}.localhost:${TEST_PORT}/{z}/{x}/{y}.png`,
        bbox: [13.3, 52.5, 13.4, 52.55],
        minZoom: 11,
        maxZoom: 11,
        crs: "EPSG:3857",
        // Missing subdomains
      });
    }).toThrow("Missing Subdomains");
  });

  test("accepts subdomains when {s} in URL", async () => {
    const config = await processTilesConfig({
      url: `http://{s}.localhost:${TEST_PORT}/{z}/{x}/{y}.png`,
      subdomains: ["a", "b", "c"],
      bbox: [13.3, 52.5, 13.4, 52.55],
      minZoom: 11,
      maxZoom: 11,
      crs: "EPSG:3857",
    });

    expect(config.subdomains).toEqual(["a", "b", "c"]);
  });
});

describe("fetchTiles", () => {
  test("download correct tiles for one zoom level", async () => {
    const config = await processTilesConfig({
      url: `http://localhost:${TEST_PORT}/{z}/{x}/{y}.png`,
      bbox: [13.3, 52.5, 13.4, 52.55], // Very small area in Berlin
      minZoom: 11,
      maxZoom: 11,
      crs: "EPSG:3857", // Web Mercator
    });
    
    console.log(`Starting download of ${config.totalCount} tiles...`);
    const downloadedTiles: Array<{ url: string; size: number; x: number; y: number; z: number }> = [];
    for await (const tile of fetchTiles(config)) {
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
    expect(downloadedTiles).toHaveLength(config.totalCount);
    // URLs are unique
    expect(new Set(downloadedTiles.map(tile => tile.url))).toHaveLength(config.totalCount);
    // URLs were generated with the correct z-values
    expect(new Set(downloadedTiles.map(tile => Number(tile.url.split('/').at(-3))))).toEqual(new Set([11]))
    // URLs were generated with the correct x-values
    expect(new Set(downloadedTiles.map(tile => Number(tile.url.split('/').at(-2))))).toEqual(new Set([1099, 1100]))
    // URLs were generated with the correct y-values
    expect(new Set(downloadedTiles.map(tile => Number(tile.url.split('/').at(-1)?.split('.')[0])))).toEqual(new Set([671]))

    // Verify each tile has valid properties
    for (const tile of downloadedTiles) {
      expect(tile.url).toMatch(/\/\d+\/\d+\/\d+\.png$/);
      expect(tile.size).toBe(70);
      expect(tile.x).toBeOneOf([1099, 1100]);
      expect(tile.y).toBe(671);
      expect(tile.z).toBe(config.minZoom);
      expect(tile.z).toBe(config.maxZoom);
    }
  });

  test("download correct tiles for multiple zoom levels", async () => {
    const config = await processTilesConfig({
      url: `http://localhost:${TEST_PORT}/{z}/{x}/{y}.png`,
      bbox: [13.3, 52.5, 13.4, 52.55], // Very small area in Berlin
      minZoom: 11,
      maxZoom: 13,
      crs: "EPSG:3857", // Web Mercator
    });

    const downloadedTiles: Array<{ url: string; size: number; x: number; y: number; z: number }> = [];
    for await (const tile of fetchTiles(config)) {
      downloadedTiles.push({
        url: tile.url,
        size: tile.blob.size,
        x: tile.x,
        y: tile.y,
        z: tile.z,
      });
    }

    // All tiles were downloaded
    expect(downloadedTiles).toHaveLength(config.totalCount);
    // Total size of downloaded tiles is correct
    expect(downloadedTiles.reduce((prevSize, tile) => prevSize + tile.size, 0)).toBe(downloadedTiles.length * 70);
    // URLs are unique
    expect(new Set(downloadedTiles.map(tile => tile.url))).toHaveLength(config.totalCount);
    // URLs were generated with the correct z-values
    expect(new Set(downloadedTiles.map(tile => Number(tile.url.split('/').at(-3))))).toEqual(new Set([11, 12, 13]))
    // URLs were generated with the correct x-values
    expect(new Set(downloadedTiles.map(tile => Number(tile.url.split('/').at(-2))))).toEqual(new Set([1099, 1100, 2199, 2200, 4398, 4399, 4400]))
    // URLs were generated with the correct y-values
    expect(new Set(downloadedTiles.map(tile => Number(tile.url.split('/').at(-1)?.split('.')[0])))).toEqual(new Set([671, 1342, 1343, 2685, 2686, 2687]))

    // Verify each tile has valid properties
    for (const tile of downloadedTiles) {
      expect(tile.url).toMatch(/\/\d+\/\d+\/\d+\.png$/);
      expect(tile.size).toBe(70);
      expect(tile.x).toBeGreaterThanOrEqual(0);
      expect(tile.y).toBeGreaterThanOrEqual(0);
      expect(tile.z).toBeGreaterThanOrEqual(config.minZoom);
      expect(tile.z).toBeLessThanOrEqual(config.maxZoom);
    }
  });

  test("download tiles with subdomain rotation", async () => {
    const config = await processTilesConfig({
      url: `http://localhost:${TEST_PORT}/{z}/{x}/{y}.png`,
      subdomains: ["a", "b", "c"],
      bbox: [13.3, 52.5, 13.32, 52.51], // Very small area
      minZoom: 12,
      maxZoom: 12,
      crs: "EPSG:3857",
    });

    const tiles: string[] = [];
    for await (const tile of fetchTiles(config)) {
      tiles.push(tile.url);
      expect(tile.blob.type).toBe("image/png");
    }

    // Verify we got tiles
    expect(tiles.length).toBeGreaterThan(0);
  });

  test("handles single zoom level", async () => {
    const config = await processTilesConfig({
      url: `http://localhost:${TEST_PORT}/{z}/{x}/{y}.png`,
      bbox: [13.3, 52.5, 13.35, 52.525],
      minZoom: 11,
      maxZoom: 11, // Single zoom level
      crs: "EPSG:3857",
    });

    const tiles: Array<{ z: number }> = [];
    for await (const tile of fetchTiles(config)) {
      tiles.push({ z: tile.z });
    }

    expect(tiles.length).toBe(config.totalCount);
    expect(tiles.every((t) => t.z === 11)).toBe(true);
  });
});
