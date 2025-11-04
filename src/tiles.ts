import partial from "lodash.partial";
import { containsExtent } from "ol/extent";
import { get as getProjection, transformExtent } from "ol/proj";
import type { TileImage } from "ol/source";
import { createXYZ } from "ol/tilegrid";
import type {
  FetchedTile,
  FetchTilesConfig,
  Selection,
  TileRanges,
  TilesConfig,
  TileUrls,
  UnfetchedTile,
  WMTSConfig,
} from "./types";

async function processXYZTilesConfig(config: TilesConfig): Promise<FetchTilesConfig> {
  const { crs, bbox, url, subdomains, maxZoom, minZoom } = config;
  const extent = getProjection(crs)?.getExtent();

  // Fail early
  if (url.includes("{s}") && !subdomains) {
    throw new Error(`Missing Subdomains argument for url ${url}`);
  }
  if (!extent) {
    throw new Error(`Couldn't get the extent for ${crs}`);
  } else if (!containsExtent(extent, bbox)) {
    throw new Error(`The supplied bounding box exceeds the extent of ${crs}`);
  }

  // Calculate TileRanges
  let totalCount: number = 0;
  const tileRanges: TileRanges = [];

  const tileGrid = createXYZ({ extent, minZoom, maxZoom });
  const targetCrsBbox = transformExtent(bbox, "EPSG:4326", crs);

  for (let zoom = minZoom; zoom <= maxZoom; zoom++) {
    const tileRange = tileGrid.getTileRangeForExtentAndZ(targetCrsBbox, zoom);
    const count = tileRange.getHeight() * tileRange.getWidth();
    tileRanges.push({ zoom, count, tileRange });
    totalCount += count;
  }

  return {
    ...config,
    totalCount,
    tileRanges,
  };
}

async function processWMTSTilesConfig({
  config,
  options,
}: WMTSConfig): Promise<FetchTilesConfig> {
  const { bbox, minZoom, maxZoom } = config;
  const crs = getProjection(options.projection)?.getCode();
  const extent = getProjection(options.projection)?.getExtent();

  // Fail early
  if (!options.url && !options.urls) {
    throw new Error("Missing URL");
  } else if (!crs) {
    throw new Error("Couldn't get a valid EPSG-code");
  } else if (!extent) {
    throw new Error(`Couldn't get the extent for ${crs}`);
  } else if (!containsExtent(extent, bbox)) {
    throw new Error(`The supplied bounding box exceeds the extent of ${crs}`);
  }

  // Calculate TileRanges
  let totalCount: number = 0;
  const tileRanges: TileRanges = [];

  const url = options.url || (options.urls ? options.urls[0] ?? "" : "");
  const tileGrid = options.tileGrid;
  const targetCrsBbox = transformExtent(bbox, "EPSG:4326", crs);

  for (let zoom = minZoom; zoom <= maxZoom; zoom++) {
    const tileRange = tileGrid.getTileRangeForExtentAndZ(targetCrsBbox, zoom);
    const count = tileRange.getHeight() * tileRange.getWidth();
    tileRanges.push({ zoom, count, tileRange });
    totalCount += count;
  }

  return {
    crs,
    bbox,
    minZoom,
    maxZoom,
    totalCount,
    tileRanges,
    url,
  };
}

export async function processTilesConfig(
  config: TilesConfig | WMTSConfig
): Promise<FetchTilesConfig> {
  if ("options" in config) {
    return processWMTSTilesConfig(config);
  } else {
    return processXYZTilesConfig(config);
  }
}

export async function fetchTile(unfetchedTile: UnfetchedTile): Promise<FetchedTile> {
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

function* generateTileURLs({
  url,
  tileRanges,
  subdomains,
}: FetchTilesConfig): Generator<UnfetchedTile, void, unknown> {
  let currentSubdomainIndex = 0;

  for (const { zoom, tileRange } of tileRanges) {
    const { minX, maxX, minY, maxY } = tileRange;

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        // Generate XYZ URL (existing logic)
        url = url
          .replace("{x}", x.toString())
          .replace("{y}", y.toString())
          // TMS has origin at bottom-left, need to invert
          .replace("{-y}", (Math.pow(2, zoom) - 1 - y).toString())
          .replace("{z}", zoom.toString());

        // Only cycle subdomains if array is not empty
        if (subdomains && subdomains.length > 0) {
          currentSubdomainIndex = (currentSubdomainIndex + 1) % subdomains.length;
          url = url.replace("{s}", subdomains[currentSubdomainIndex] ?? "");
        }

        yield { url, x, y, z: zoom };
      }
    }
  }
}

export function* getTileUrls(
  source: TileImage,
  options: Selection
): Generator<TileUrls, void, unknown> {
  const tilegrid = source.getTileGrid();
  const getUrl = source.getTileUrlFunction();
  const extent = tilegrid?.getExtent();
  const projection = source.getProjection();
  const bbox = transformExtent(options.bbox, "EPSG:4326", projection?.getCode());

  if (!extent) throw new Error("No extent found");
  if (!projection) throw new Error("No projection specified");
  if (!containsExtent(extent, options.bbox)) throw new Error("BBOX exceeds valid bounds");
  if (!tilegrid) throw new Error("No tilegrid found");

  for (let zoom = options.minZoom; zoom <= options.maxZoom; zoom++) {
    let count: number = 0;
    const urls: string[] = [];

    tilegrid.forEachTileCoord(bbox, zoom, (tilecoord) => {
      const url = getUrl(tilecoord, zoom, projection);
      if (url) {
        urls.push(url);
        count++;
      }
    });

    const tileUrls: TileUrls = { zoom, count, urls };
    yield tileUrls;
  }
}

export async function* fetchTiles(
  config: FetchTilesConfig,
  options: { maxParallelDownloads: number } = { maxParallelDownloads: 6 }
): AsyncGenerator<FetchedTile, void, unknown> {
  const pendingDownloads = new Set<Promise<FetchedTile>>();
  const tileUrls = generateTileURLs(config);

  for (const unfetchedTile of tileUrls) {
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

export default class Tiles implements FetchTilesConfig {
  readonly url;
  readonly subdomains;
  readonly bbox;
  readonly minZoom;
  readonly maxZoom;
  readonly crs;
  readonly totalCount;
  readonly tileRanges;
  fetch;

  private constructor(fetchConfig: FetchTilesConfig) {
    this.url = fetchConfig.url;
    this.subdomains = fetchConfig.subdomains;
    this.bbox = fetchConfig.bbox;
    this.minZoom = fetchConfig.minZoom;
    this.maxZoom = fetchConfig.maxZoom;
    this.crs = fetchConfig.crs;
    this.totalCount = fetchConfig.totalCount;
    this.tileRanges = fetchConfig.tileRanges;
    this.fetch = partial(fetchTiles, fetchConfig);
  }

  /**
   * Create a new Tiles instance asynchronously
   */
  static async create(config: TilesConfig | WMTSConfig): Promise<Tiles> {
    const fetchConfig = await processTilesConfig(config);
    return new Tiles(fetchConfig);
  }
}
