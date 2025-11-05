import { containsExtent } from "ol/extent";
import WMTSCapabilities from "ol/format/WMTSCapabilities.js";
import { get as getProjection, transformExtent } from "ol/proj";
import type { TileImage } from "ol/source";
import WMTS, { optionsFromCapabilities, type Options } from "ol/source/WMTS.js";
import type {
  customWMTSOptions,
  FetchTilesConfig,
  OptionsFromCapabilities,
  Selection,
  TileRanges,
  TileUrls,
  WMTSConfig,
} from "./types";

const parser = new WMTSCapabilities();

export async function getOptions(
  capabilitiesUrl: string,
  config: OptionsFromCapabilities
): Promise<Options> {
  let text = await fetch(capabilitiesUrl).then((response) => response.text());

  // WORKAROUND: CDATA causes parsing error during testing (due to the DOM-replacement library `happy-dom`)
  text = text.replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1");

  // Parse XML into an object
  const result = parser.read(text);

  // WORKAROUND: empty list for TileMatrixSetLimits produces error -> set to undefined
  const layers = result["Contents"]["Layer"];
  const l = layers?.find(function (elt: any) {
    return elt["Identifier"] == config.layer;
  });
  l.TileMatrixSetLink.forEach((tmsl: any) => {
    if (tmsl.TileMatrixSetLimits && tmsl.TileMatrixSetLimits.length === 0) {
      tmsl.TileMatrixSetLimits = undefined;
    }
  });

  const options = optionsFromCapabilities(result, config);
  if (!options) throw new Error("optionsFromCapabilities failed");
  return options;
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

export function getWMTSUrls(options: customWMTSOptions) {
  return getTileUrls(new WMTS(options), options);
}

export async function processWMTSTilesConfig({
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

  for (let z = minZoom; z <= maxZoom; z++) {
    const tileRange = tileGrid.getTileRangeForExtentAndZ(targetCrsBbox, z);
    const count = tileRange.getHeight() * tileRange.getWidth();
    tileRanges.push({ z, count, tileRange });
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
