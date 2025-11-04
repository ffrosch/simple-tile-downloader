import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { getOptions, getWMTSUrls } from "./wmts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { processTilesConfig } from "./tiles";
import { Extent } from "./types";

// Register happy-dom for local access to DOMParser
beforeAll(() => {
  GlobalRegistrator.register({
    settings: { fetch: { disableSameOriginPolicy: true } },
  });
});

// De-Register happy-dom so that no other test files are influenced accidentally
afterAll(async () => {
  await GlobalRegistrator.unregister();
});

const url = "http://localhost/ogc/?SERVICE=WMTS&REQUEST=GetCapabilities";
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
  test("gets all tile urls", async () => {
    const options = await getOptions(url, { layer, matrixSet });
    const tileUrls = getWMTSUrls({
      bbox: [13.3, 52.5, 13.4, 52.55] as Extent,
      minZoom: 11,
      maxZoom: 12,
      ...options,
    });

    const result = Array.from(tileUrls)
    expect(result.length).toBe(2);
    expect(result.reduce((prev, cur) => prev + cur.urls.length, 0)).toBe(6);
    console.log(result);
  });
});
