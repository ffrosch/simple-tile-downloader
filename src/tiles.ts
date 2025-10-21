import { containsExtent } from "ol/extent";
import { get as getProjection, transformExtent } from "ol/proj";
import { createXYZ } from "ol/tilegrid";
import type {
  TargetArea,
  FetchedTile,
  UnfetchedTile,
  TileRange,
  FetchTilesConfig,
} from "./types";

export function tilesConfig(targetArea: TargetArea): FetchTilesConfig {
  const extent = getProjection(targetArea.crs)?.getExtent();

  if (!extent) {
    throw new Error(`Couldn't get the extent for ${targetArea.crs}`);
  } else if (!containsExtent(extent, targetArea.bbox)) {
    throw new Error(
      `The supplied bounding box exceeds the extent of ${targetArea.crs}`
    );
  }

  if (targetArea.sourceUrl.includes("{s}") && !targetArea.sourceSubdomains) {
    throw new Error(
      `Missing Subdomains argument for url ${targetArea.sourceUrl}`
    );
  }

  const tileGrid = createXYZ({
    extent: getProjection(targetArea.crs)?.getExtent(),
    maxZoom: targetArea.maxZoom,
    minZoom: targetArea.minZoom,
  });

  const tileRanges: TileRange[] = [];
  for (let zoom = targetArea.minZoom; zoom <= targetArea.maxZoom; zoom++) {
    const { minX, maxX, minY, maxY } = tileGrid.getTileRangeForExtentAndZ(
      transformExtent(targetArea.bbox, "EPSG:4326", targetArea.crs),
      zoom
    );
    const count = (maxX - minX + 1) * (maxY - minY + 1);
    tileRanges.push({ zoom, minX, maxX, minY, maxY, count });
  }
  const totalCount = tileRanges
    .map((range) => range.count)
    .reduce((previousCount, currentCount) => previousCount + currentCount);

  return {
    totalCount,
    tileRanges,
    bbox: targetArea.bbox,
    minZoom: targetArea.minZoom,
    maxZoom: targetArea.maxZoom,
    sourceUrl: targetArea.sourceUrl,
    sourceSubdomains: targetArea.sourceSubdomains,
  };
}

export async function fetchTile(
  unfetchedTile: UnfetchedTile
): Promise<FetchedTile> {
  return fetch(unfetchedTile.url)
    .then((response) => {
      if (response.ok) {
        return response.blob();
      } else {
        return Promise.reject(
          new Error(
            `GET ${response.url} failed with ${response.status} ${response.statusText}`
          )
        );
      }
    })
    .then((blob) => {
      // Verify it's an image
      if (!blob.type.startsWith("image/")) {
        return Promise.reject(new Error("Response is not an image"));
      } else {
        return { ...unfetchedTile, blob };
      }
    });
}

export async function* fetchTiles(
  FetchTilesConfig: FetchTilesConfig,
  options: { maxParallelDownloads: number } = { maxParallelDownloads: 6 }
): AsyncGenerator<FetchedTile, void, unknown> {
  const { tileRanges, sourceUrl, sourceSubdomains } = FetchTilesConfig;
  const pendingDownloads = new Set<Promise<FetchedTile>>();

  function* generateTileURLs(): Generator<UnfetchedTile, void, unknown> {
    let currentSubdomainIndex = 0;

    for (let i = 0; i < tileRanges.length; i++) {
      const { minX, maxX, minY, maxY, zoom } = tileRanges[i] as TileRange;
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          let url = sourceUrl
            .replace("{x}", x.toString())
            .replace("{y}", y.toString())
            // TMS has origin at bottom-left, need to invert
            .replace("{-y}", (Math.pow(2, zoom) - 1 - y).toString())
            .replace("{z}", zoom.toString())

          // Only cycle subdomains if array is not empty
          if (sourceSubdomains && sourceSubdomains.length > 0) {
            currentSubdomainIndex =
              (currentSubdomainIndex + 1) % sourceSubdomains.length;
            url = url.replace("{s}", sourceSubdomains[currentSubdomainIndex] ?? "");
          }

          yield { url, x, y, z: zoom };
        }
      }
    }
  }

  for (const unfetchedTile of generateTileURLs()) {
    const tile = fetchTile(unfetchedTile);
    pendingDownloads.add(tile);
    tile.then(() => pendingDownloads.delete(tile));

    while (pendingDownloads.size >= options.maxParallelDownloads) {
      yield Promise.race(pendingDownloads);
    }
  }

  while (pendingDownloads.size > 0) {
    yield Promise.race(pendingDownloads);
  }
}
