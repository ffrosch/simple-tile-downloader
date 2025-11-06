import { describe, expect, test } from "bun:test";
import xyz from "./xyz";
import EXTENT from "../tests/fixtures/extent";

describe("makeTileCollection", () => {
  test("calculate tile ranges for multiple zoom levels", () => {
    const tileCollection = xyz(
      {
        url: "http://localhost/{z}/{x}/{y}.png",
        projection: "EPSG:3857",
      },
      {
        minZoom: 11,
        maxZoom: 13,
        targetExtent: EXTENT.extent,
        targetProjection: EXTENT.projection,
      }
    );

    expect(tileCollection.totalCount).toBeGreaterThan(0);
    expect(tileCollection.tileRanges).toHaveLength(3); // Zoom levels 11, 12, 13
  });

  test("throw error for invalid CRS", () => {
    expect(() =>
      xyz(
        {
          url: "http://localhost/{z}/{x}/{y}.png",
          projection: "INVALID:CRS",
        },
        {
          minZoom: 11,
          maxZoom: 13,
          targetExtent: EXTENT.extent,
          targetProjection: EXTENT.projection,
        }
      )
    ).toThrow();
  });
});
