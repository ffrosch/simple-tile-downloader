import partial from "lodash.partial";
import { transformExtent, type ProjectionLike } from "ol/proj";
import type { LoaderOptions } from "ol/source/DataTile";
import type { Options as OlOptions, UrlGetter, UrlLike } from "ol/source/ImageTile";
import ImageTile from "ol/source/ImageTile";
import type { TileGrid } from "ol/tilegrid";
import { expandUrl, pickUrl, renderXYZTemplate } from "ol/uri.js";
import type {
  Extent,
  FetchedTile,
  TileCollection,
  TileRanges,
  UnfetchedTile,
} from "./types";

interface BaseOptions
  extends Omit<
    OlOptions,
    "url" | "loader" | "tileGrid" | "minZoom" | "maxZoom" | "maxResolution"
  > {
  url: UrlLike;
}

interface TileGridOptions extends BaseOptions {
  tileGrid: TileGrid;
}

interface MinMaxZoomOptions extends BaseOptions {
  minZoom: number;
  maxZoom: number;
  maxResolution?: number;
}

type Options = MinMaxZoomOptions | TileGridOptions;

interface OptionsExtent {
  extent: Extent;
  projection?: ProjectionLike;
}

export default function makeTileCollection(
  options: Options,
  optionsExtent: OptionsExtent
): TileCollection {
  const hasMinMaxZoom = (x: Options): x is MinMaxZoomOptions =>
    "minZoom" in x && "maxZoom" in x;
  const url = options.url;
  const source = new ImageTile(options);
  const projection = source.getProjection()?.getCode();
  const tileGrid = source.getTileGrid();
  let minZoom = tileGrid?.getMinZoom();
  let maxZoom = tileGrid?.getMaxZoom();
  if (hasMinMaxZoom(options)) {
    minZoom = minZoom || options.minZoom;
    maxZoom = maxZoom || options.maxZoom;
  }

  if (!minZoom || !maxZoom) throw new Error("Missing minZoom and/or maxZoom");
  if (!tileGrid) throw new Error("Missing tileGrid");

  // Calculate TileRanges
  let totalCount: number = 0;
  const tileRanges: TileRanges = [];

  const extent = optionsExtent.projection
    ? transformExtent(
        optionsExtent.extent,
        optionsExtent.projection,
        source.getProjection() || "EPSG:3857"
      )
    : optionsExtent.extent;
  for (let z = minZoom; z <= maxZoom; z++) {
    const tileRange = tileGrid.getTileRangeForExtentAndZ(extent, z);
    const count = tileRange.getHeight() * tileRange.getWidth();
    tileRanges.push({ z, count, tileRange });
    totalCount += count;
  }

  const tileLoaders = generateTileLoaders(options.url, tileRanges);

  return {
    tileLoaders,
    tileRanges,
    totalCount,
    minZoom,
    maxZoom,
    projection,
    extent,
    url,
  };
}

function* generateTileLoaders(
  url: UrlLike,
  tileRanges: TileRanges
): Generator<UnfetchedTile, void, unknown> {
  const loader = makeLoaderFromUrlLike(url);
  const controller = new AbortController();
  const loaderOptions: LoaderOptions = {
    signal: controller.signal,
  };

  for (const { z, tileRange } of tileRanges) {
    const { minX, maxX, minY, maxY } = tileRange;
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const load = partial(loader, z, x, y, loaderOptions);
        yield { x, y, z, load, controller };
      }
    }
  }
}

function loadImage(
  template: string,
  z: number,
  x: number,
  y: number,
  options: LoaderOptions
): Promise<FetchedTile> {
  const url = renderXYZTemplate(template, z, x, y, options.maxY);
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

function makeLoaderFromTemplates(templates: Array<string>) {
  return function (z: number, x: number, y: number, options: LoaderOptions) {
    const template = pickUrl(templates, z, x, y);
    return loadImage(template, z, x, y, options);
  };
}

function makeLoaderFromGetter(getter: UrlGetter) {
  return function (z: number, x: number, y: number, options: LoaderOptions) {
    const url = getter(z, x, y, options);
    return loadImage(url, z, x, y, options);
  };
}

function makeLoaderFromUrlLike(url: UrlLike) {
  let loader: (
    z: number,
    x: number,
    y: number,
    options: LoaderOptions
  ) => Promise<FetchedTile>;

  if (Array.isArray(url)) {
    loader = makeLoaderFromTemplates(url);
  } else if (typeof url === "string") {
    const urls = expandUrl(url);
    loader = makeLoaderFromTemplates(urls);
  } else if (typeof url === "function") {
    loader = makeLoaderFromGetter(url);
  } else {
    throw new Error(
      "The url option must be a single template, an array of templates, or a function for getting a URL"
    );
  }
  return loader;
}
