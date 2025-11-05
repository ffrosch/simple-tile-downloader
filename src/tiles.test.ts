import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { fetchTiles } from "./tiles";
import xyz from "./xyz";
import EXTENT from "../tests/fixtures/extent";

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

describe("fetchTiles", async () => {
  test("download correct tiles for one zoom level", async () => {
    const tileCollection = xyz(
      {
        url: `http://localhost:${TEST_PORT}/{z}/{x}/{y}.png`,
        minZoom: 11,
        maxZoom: 11,
        projection: "EPSG:3857",
      },
      EXTENT
    )
    
    console.log(`Starting download of ${tileCollection.totalCount} tiles...`);
    const downloadedTiles: Array<{ url: string; size: number; x: number; y: number; z: number }> = [];
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
    expect(new Set(downloadedTiles.map(tile => tile.url))).toHaveLength(tileCollection.totalCount);
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
      expect(tile.z).toBe(tileCollection.minZoom);
      expect(tile.z).toBe(tileCollection.maxZoom);
    }
  });

  test("download correct tiles for multiple zoom levels", async () => {
    const tileCollection = xyz(
      {
        url: `http://localhost:${TEST_PORT}/{z}/{x}/{y}.png`,
        minZoom: 11,
        maxZoom: 13,
        projection: "EPSG:3857",
      },
      EXTENT
    )

    const downloadedTiles: Array<{ url: string; size: number; x: number; y: number; z: number }> = [];
    for await (const tile of fetchTiles(tileCollection)) {
      downloadedTiles.push({
        url: tile.url,
        size: tile.blob.size,
        x: tile.x,
        y: tile.y,
        z: tile.z,
      });
    }

    // All tiles were downloaded
    expect(downloadedTiles).toHaveLength(tileCollection.totalCount);
    // Total size of downloaded tiles is correct
    expect(downloadedTiles.reduce((prevSize, tile) => prevSize + tile.size, 0)).toBe(downloadedTiles.length * 70);
    // URLs are unique
    expect(new Set(downloadedTiles.map(tile => tile.url))).toHaveLength(tileCollection.totalCount);
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
      expect(tile.z).toBeGreaterThanOrEqual(tileCollection.minZoom);
      expect(tile.z).toBeLessThanOrEqual(tileCollection.maxZoom);
    }
  });

  test("handles single zoom level", async () => {
    const tileCollection = xyz(
      {
        url: `http://localhost:${TEST_PORT}/{z}/{x}/{y}.png`,
        minZoom: 11,
        maxZoom: 11,
        projection: "EPSG:3857",
      },
      EXTENT
    );

    const tiles: Array<{ z: number }> = [];
    for await (const tile of fetchTiles(tileCollection)) {
      tiles.push({ z: tile.z });
    }

    expect(tiles.length).toBe(tileCollection.totalCount);
    expect(tiles.every((t) => t.z === 11)).toBe(true);
  });
});
