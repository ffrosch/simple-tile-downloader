import type { ProjectionLike } from "ol/proj";
import { transformExtent } from "ol/proj";
import ImageTile, { type UrlLike } from "ol/source/ImageTile";
import WMTS from "ol/source/WMTS.js";
import type {
  Extent,
  FetchedTile,
  TileCollection,
  TileRanges,
  UnfetchedTile,
} from "./types";
import { partial } from "lodash";

export async function* fetchTiles(
  tileCollection: TileCollection,
  options: { maxParallelDownloads: number } = { maxParallelDownloads: 6 }
): AsyncGenerator<FetchedTile, void, unknown> {
  const pendingDownloads = new Set<Promise<FetchedTile>>();

  for (const unfetchedTile of tileCollection.tileLoaders) {
    const tile = unfetchedTile.load();
    pendingDownloads.add(tile);
    tile.finally(() => pendingDownloads.delete(tile));

    while (pendingDownloads.size >= options.maxParallelDownloads) {
      yield Promise.race(pendingDownloads);
    }
  }

  while (pendingDownloads.size > 0) {
    yield Promise.race(pendingDownloads);
  }
}

export function makeTileCollectionFromSource(options: {
  url: UrlLike;
  load: (tileRanges: TileRanges) => Generator<UnfetchedTile, void, unknown>;
  source: WMTS | ImageTile;
  minZoom: number;
  maxZoom: number;
  targetExtent: Extent;
  targetProjection?: ProjectionLike;
}): TileCollection {
  const { url, load, source, minZoom, maxZoom, targetExtent, targetProjection } = options;

  const tileGrid = source.getTileGrid();
  if (!tileGrid) {
    throw new Error("Missing tileGrid");
  }

  const sourceProjection = source.getProjection()?.getCode();
  const extent = targetProjection
    ? transformExtent(targetExtent, targetProjection, sourceProjection || "EPSG:3857")
    : targetExtent;

  // Calculate TileRanges
  let totalCount: number = 0;
  const tileRanges: TileRanges = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const tileRange = tileGrid.getTileRangeForExtentAndZ(extent, z);
    const count = tileRange.getHeight() * tileRange.getWidth();
    tileRanges.push({ z, count, tileRange });
    totalCount += count;
  }

  const tileLoaders = load(tileRanges);

  return {
    url,
    extent,
    minZoom,
    maxZoom,
    totalCount,
    tileRanges,
    tileLoaders,
    projection: sourceProjection,
  };
}

export function makeTileLoader(urlFunction: (z: number, x: number, y: number) => string) {
  async function loader(z: number, x: number, y: number): Promise<FetchedTile> {
    const url = urlFunction(z, x, y);
    console.log(url)
    return fetch(url)
      .then((response) => {
        if (response.ok) {
          return response.blob();
        } else {
          return Promise.reject(new Error("Image failed to load"));
        }
      })
      .then((blob) => {
        return { x, y, z, blob, url };
      });
  }
  return loader
}

export function makeGeneratorFromTileLoader(
  loader: (
    z: number,
    x: number,
    y: number,
  ) => Promise<FetchedTile>
): (tileRanges: TileRanges) => Generator<UnfetchedTile, void, unknown> {
  function* generator(tileRanges: TileRanges) {
    for (const { z, tileRange } of tileRanges) {
      const { minX, maxX, minY, maxY } = tileRange;
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          const load = partial(loader, z, x, y);
          yield { x, y, z, load };
        }
      }
    }
  }
  return generator;
}