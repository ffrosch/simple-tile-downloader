import { describe, test, expect, beforeEach } from "bun:test";
import { fetchCRSFromEPSG, transformExtent, getCRSExtent } from "./crs";
import type { Extent } from "./types";
import {
  get as getProjection,
  transformExtent as olTransformExtent,
} from "ol/proj";

describe("fetchCRSFromEPSG", () => {
  test("fetch expected values", async () => {
    const { bboxWGS84, proj4String, name } = await fetchCRSFromEPSG(
      "EPSG:3857"
    );

    expect(bboxWGS84).toBeArrayOfSize(4);
    expect(bboxWGS84).toStrictEqual([-180, -85.06, 180, 85.06]);
    expect(name).toBe("WGS 84 / Pseudo-Mercator");
    expect(proj4String).toBe(
      "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs +type=crs"
    );
  });
});

describe("transformExtent", () => {
  let bboxBerlinWGS84: Extent;
  let bboxBerlinMercator: Extent;

  let extentWGS84: Extent;

  beforeEach(() => {
    bboxBerlinWGS84 = [13.3, 52.5, 13.4, 52.55];
    // prettier-ignore
    bboxBerlinMercator = [1480549.2275505385, 6891041.723891583, 1491681.1766298658, 6900190.041139638];

    extentWGS84 = [-180, -85, 180, 85];
  });

  test("transform small extent matches OL", () => {
    let bboxMercator = transformExtent(
      bboxBerlinWGS84,
      "EPSG:4326",
      "EPSG:3857"
    );
    let bboxMercatorOL = olTransformExtent(
      bboxBerlinWGS84,
      "EPSG:4326",
      "EPSG:3857"
    );

    // slight deviations in the last digits -> shouldn't make a difference
    bboxMercator = bboxMercator.map((num) => Number(num.toFixed(6))) as Extent;
    bboxMercatorOL = bboxMercatorOL.map((num) => Number(num.toFixed(6)));

    bboxBerlinMercator = bboxBerlinMercator.map((num) =>
      Number(num.toFixed(6))
    ) as Extent;
    expect(bboxMercator).toStrictEqual(bboxBerlinMercator);
    expect(bboxMercatorOL).toStrictEqual(bboxBerlinMercator);
  });

  test("transform large extent matches OL", () => {
    let bboxMercator = transformExtent(extentWGS84, "EPSG:4326", "EPSG:3857");
    let bboxMercatorOL = olTransformExtent(
      extentWGS84,
      "EPSG:4326",
      "EPSG:3857"
    );

    // slight deviations in the last digits -> shouldn't make a difference
    bboxMercator = bboxMercator.map((num) => Number(num.toFixed(6))) as Extent;
    bboxMercatorOL = bboxMercatorOL.map((num) => Number(num.toFixed(6)));

    expect(bboxMercator).toStrictEqual(bboxMercatorOL as Extent);
  });
});

describe("getCRSExtent", () => {
  test("extent for EPSG:3857 matches OL", async () => {
    const extent = await getCRSExtent("EPSG:3857");
    const extentOL = getProjection("EPSG:3857")?.getExtent() as Extent;

    expect(extentOL).toBeDefined();
    expect(extent).toStrictEqual(extentOL);
  });
});
