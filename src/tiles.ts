import { getCRSExtent, containsExtent } from "./crs";
import { createXYZTileGrid, getTileRangeForExtentAndZ } from "./tilegrid";
import type {
  TilesConfig,
  FetchedTile,
  UnfetchedTile,
  TileRange,
  FetchTilesConfig,
  ProcessTilesConfig,
} from "./types";
import partial from "lodash.partial";
import { detectServiceType, processWMTSTilesConfig, generateWMTSUrl } from "./wmts";

/**
 * Process XYZ tiles configuration
 */
async function processXYZTilesConfig(config: TilesConfig): Promise<FetchTilesConfig> {
  const { crs, bbox, url, subdomains, maxZoom, minZoom } = config;

  // Fetch CRS extent from epsg.io
  const extent = await getCRSExtent(crs);

  if (!containsExtent(extent, bbox)) {
    throw new Error(
      `The supplied bounding box exceeds the extent of ${crs}`
    );
  }

  if (url.includes("{s}") && !subdomains) {
    throw new Error(
      `Missing Subdomains argument for url ${url}`
    );
  }

  const tileGrid = createXYZTileGrid(extent, minZoom, maxZoom);

  const tileRanges: TileRange[] = [];
  for (let zoom = minZoom; zoom <= maxZoom; zoom++) {
    const tileRange = getTileRangeForExtentAndZ(
      bbox,
      "EPSG:4326",
      crs,
      zoom,
      tileGrid
    );
    tileRanges.push(tileRange);
  }
  const totalCount = tileRanges
    .map((range) => range.count)
    .reduce((previousCount, currentCount) => previousCount + currentCount);

  return {
    ...config,
    totalCount,
    tileRanges,
  };
}

/**
 * Process tiles configuration - routes to XYZ or WMTS handler
 */
export async function processTilesConfig(config: ProcessTilesConfig): Promise<FetchTilesConfig> {
  // Detect service type (auto or explicit)
  const serviceType = await detectServiceType(config.url, config.serviceType);

  // Route to appropriate handler
  if (serviceType === "wmts") {
    return processWMTSTilesConfig(config);
  } else {
    return processXYZTilesConfig(config);
  }
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
  config: FetchTilesConfig,
  options: { maxParallelDownloads: number } = { maxParallelDownloads: 6 }
): AsyncGenerator<FetchedTile, void, unknown> {
  const { tileRanges, url: urlTemplate, subdomains } = config;
  const pendingDownloads = new Set<Promise<FetchedTile>>();

  function* generateTileURLs(): Generator<UnfetchedTile, void, unknown> {
    let currentSubdomainIndex = 0;

    // Check if this is WMTS (has _wmtsParams)
    const isWMTS = "_wmtsParams" in config && config._wmtsParams;

    for (let i = 0; i < tileRanges.length; i++) {
      const { minX, maxX, minY, maxY, zoom } = tileRanges[i] as TileRange;
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          let url: string;

          if (isWMTS && config._wmtsParams) {
            // Generate WMTS URL
            const { layer, format, tileMatrixSet } = config._wmtsParams;
            url = generateWMTSUrl(urlTemplate, layer, format, tileMatrixSet, zoom, x, y);
          } else {
            // Generate XYZ URL (existing logic)
            url = urlTemplate
              .replace("{x}", x.toString())
              .replace("{y}", y.toString())
              // TMS has origin at bottom-left, need to invert
              .replace("{-y}", (Math.pow(2, zoom) - 1 - y).toString())
              .replace("{z}", zoom.toString());

            // Only cycle subdomains if array is not empty
            if (subdomains && subdomains.length > 0) {
              currentSubdomainIndex =
                (currentSubdomainIndex + 1) % subdomains.length;
              url = url.replace("{s}", subdomains[currentSubdomainIndex] ?? "");
            }
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

export default class Tiles implements FetchTilesConfig {
  readonly url;
  readonly subdomains;
  readonly bbox;
  readonly minZoom;
  readonly maxZoom;
  readonly crs;
  readonly totalCount;
  readonly tileRanges;
  readonly serviceType?;
  readonly _wmtsParams?;
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
    this.serviceType = fetchConfig.serviceType;
    this._wmtsParams = fetchConfig._wmtsParams;
  }

  /**
   * Create a new Tiles instance asynchronously
   */
  static async create(config: ProcessTilesConfig): Promise<Tiles> {
    const fetchConfig = await processTilesConfig(config);
    return new Tiles(fetchConfig);
  }
}