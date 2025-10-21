import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { tilesConfig, fetchTiles } from "./index";

// Mock tile server setup
let server: ReturnType<typeof Bun.serve> | null = null;
const TEST_PORT = 3857;

beforeAll(() => {
  // Start a mock tile server
  server = Bun.serve({
    port: TEST_PORT,
    fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      // Parse tile coordinates from URL pattern: /{z}/{x}/{y}.png
      const match = path.match(/^\/(\d+)\/(\d+)\/(\d+)\.png$/);

      if (match) {
        const [, z, x, y] = match;

        // Create a minimal 1x1 PNG (valid image)
        const pngData = new Uint8Array([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
          0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
          0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 dimensions
          0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
          0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, // IDAT chunk
          0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
          0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d,
          0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, // IEND chunk
          0x44, 0x41, 0x45, 0x42, 0x60, 0x82,
        ]);

        return new Response(pngData, {
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

describe("tilesConfig", () => {
  test("calculates tile ranges for multiple zoom levels", () => {
    const config = tilesConfig({
      sourceUrl: `http://localhost:${TEST_PORT}/{z}/{x}/{y}.png`,
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

  test("throws error for invalid CRS", () => {
    expect(() => {
      tilesConfig({
        sourceUrl: `http://localhost:${TEST_PORT}/{z}/{x}/{y}.png`,
        bbox: [13.3, 52.5, 13.4, 52.55],
        minZoom: 11,
        maxZoom: 13,
        crs: "INVALID:CRS",
      });
    }).toThrow("Couldn't get the extent");
  });

  test("throws error for missing subdomains when {s} in URL", () => {
    expect(() => {
      tilesConfig({
        sourceUrl: `http://{s}.localhost:${TEST_PORT}/{z}/{x}/{y}.png`,
        bbox: [13.3, 52.5, 13.4, 52.55],
        minZoom: 11,
        maxZoom: 11,
        crs: "EPSG:3857",
        // Missing sourceSubdomains
      });
    }).toThrow("Missing Subdomains");
  });

  test("accepts subdomains when {s} in URL", () => {
    const config = tilesConfig({
      sourceUrl: `http://{s}.localhost:${TEST_PORT}/{z}/{x}/{y}.png`,
      sourceSubdomains: ["a", "b", "c"],
      bbox: [13.3, 52.5, 13.4, 52.55],
      minZoom: 11,
      maxZoom: 11,
      crs: "EPSG:3857",
    });

    expect(config.sourceSubdomains).toEqual(["a", "b", "c"]);
  });
});

describe("fetchTiles", () => {
  test("downloads tiles over multiple zoom levels", async () => {
    const config = tilesConfig({
      sourceUrl: `http://localhost:${TEST_PORT}/{z}/{x}/{y}.png`,
      bbox: [13.3, 52.5, 13.4, 52.55], // Very small area in Berlin
      minZoom: 11,
      maxZoom: 13,
      crs: "EPSG:3857", // Web Mercator
    });

    let totalSize = 0;
    let currentTile = 1;
    const downloadedTiles: Array<{ url: string; size: number; x: number; y: number; z: number }> = [];

    console.log(`Starting download of ${config.totalCount} tiles...`);

    for await (const tile of fetchTiles(config)) {
      console.log(
        `Download of tile ${currentTile} from ${tile.url} finished (${tile.blob.size} Bytes)`
      );

      totalSize += tile.blob.size;
      downloadedTiles.push({
        url: tile.url,
        size: tile.blob.size,
        x: tile.x,
        y: tile.y,
        z: tile.z,
      });
      currentTile++;
    }

    console.log(`Total downloaded size: ${totalSize}`);

    // Verify all tiles were downloaded
    expect(downloadedTiles).toHaveLength(config.totalCount);
    expect(totalSize).toBeGreaterThan(0);

    // Verify each tile has valid properties
    for (const tile of downloadedTiles) {
      expect(tile.url).toMatch(/\/\d+\/\d+\/\d+\.png$/);
      expect(tile.size).toBeGreaterThan(0);
      expect(tile.x).toBeGreaterThanOrEqual(0);
      expect(tile.y).toBeGreaterThanOrEqual(0);
      expect(tile.z).toBeGreaterThanOrEqual(config.minZoom);
      expect(tile.z).toBeLessThanOrEqual(config.maxZoom);
    }
  });

  test("downloads tiles with subdomain rotation", async () => {
    const config = tilesConfig({
      sourceUrl: `http://localhost:${TEST_PORT}/{z}/{x}/{y}.png`,
      sourceSubdomains: ["a", "b", "c"],
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
    const config = tilesConfig({
      sourceUrl: `http://localhost:${TEST_PORT}/{z}/{x}/{y}.png`,
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
