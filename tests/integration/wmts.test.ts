import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import makeWMTSTileCollection, {
  fetchCapabilities,
  optionsFromCapabilities,
} from "../../src/wmts";
import EXTENT from "../fixtures/extent";
import SERVERS from "../fixtures/servers";
import { get } from "ol/proj";

const { qgisServer } = SERVERS;
const optionsZoom1 = {
  minZoom: 11,
  maxZoom: 11,
  targetExtent: EXTENT.extent,
  targetProjection: EXTENT.projection,
};
const capUrl = qgisServer.baseUrl + qgisServer.wmtsUrl + "&REQUEST=GetCapabilities";
const layers = qgisServer.wmtsLayers;
const matrixSets = qgisServer.wmtsMatrixSets;

let originalFetch: typeof globalThis.fetch;

// Register happy-dom for local access to DOMParser
beforeAll(async () => {
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

describe("fetchCapabilities", async () => {
  test("fetches capabilities", async () => {
    const cap = await fetchCapabilities(capUrl);
    expect(cap["ServiceIdentification"]["ServiceType"]).toBe("OGC WMTS");
    expect(cap["ServiceProvider"]).toContainKey("ProviderName");
    expect(cap["OperationsMetadata"]).toContainKeys(["GetCapabilities", "GetTile"]);
    expect(cap["Contents"]["Layer"]).not.toBeArrayOfSize(0);
    expect(cap["Contents"]["TileMatrixSet"]).not.toBeArrayOfSize(0);
  });
});

describe("optionsFromCapabilities", async () => {
  test("should fail if matrixSet not found ", async () => {
    const getOptions = optionsFromCapabilities(capUrl, {
      layer: layers[0],
      matrixSet: "INVALID MATRIX SET",
    });
    await expect(getOptions).rejects.toThrow(/not found/i);
  });

  test("should fail if projection not found ", async () => {
    const getOptions = optionsFromCapabilities(capUrl, {
      layer: layers[0],
      projection: "INVALID PROJECTION",
    });
    await expect(getOptions).rejects.toThrow(/not found/i);
  });
});

describe("makeWMTSTileCollection", async () => {
  test("zoom1", async () => {
    const tileCollection = await makeWMTSTileCollection(
      { layer: layers[0], matrixSet: matrixSets[0] },
      optionsZoom1,
      capUrl
    );

    expect(tileCollection.totalCount).toBe(2);
  });
});
