import { isUndefined, pickBy } from "lodash";
import WMTSCapabilities from "ol/format/WMTSCapabilities.js";
import { get, type Projection } from "ol/proj";
import type { Options as OlOptions } from "ol/source/WMTS.js";
import WMTS, {
  optionsFromCapabilities as optionsFromCapabilitiesOl,
} from "ol/source/WMTS.js";
import type { UrlFunction } from "ol/Tile";
import type WMTSTileGrid from "ol/tilegrid/WMTS";
import {
  makeGeneratorFromTileLoader,
  makeTileCollectionFromSource,
  makeTileLoader,
} from "./tiles";
import type {
  OptionsFromCapabilities,
  TileCollection,
  TileCollectionOptions,
} from "./types";

type SourceOptions = Omit<
  OlOptions,
  "tileLoadFunction" | "tileGrid" | "style" | "matrixSet"
> & {
  // original properties converted to optional
  matrixSet?: string;
  tileGrid?: WMTSTileGrid;
  style?: string;
};

export default async function makeTileCollection(
  sourceOptions: SourceOptions,
  tileCollectionOptions: TileCollectionOptions,
  wmtsCapabilitiesUrl?: string
): Promise<TileCollection> {
  if (wmtsCapabilitiesUrl) {
    const projection =
      typeof sourceOptions.projection === "string"
        ? sourceOptions.projection
        : sourceOptions.projection?.getCode();

    const capOptions = await optionsFromCapabilities(wmtsCapabilitiesUrl, {
      layer: sourceOptions.layer,
      matrixSet: sourceOptions.matrixSet,
      projection,
      requestEncoding: sourceOptions.requestEncoding,
      style: sourceOptions.style,
      format: sourceOptions.format,
      crossOrigin: sourceOptions.crossOrigin,
    });

    if (capOptions) {
      sourceOptions = { ...sourceOptions, ...capOptions };
    }
  }

  // Might be filled in by optionsFromCapabilities
  const url = sourceOptions.urls || sourceOptions.url;
  if (!url) {
    return Promise.reject(new Error("No URL provided"));
  }

  const findMissingWMTSOptions = (sourceOptions: SourceOptions | OlOptions): string[] => {
    const missingOptions = pickBy(
      {
        matrixSet: sourceOptions.matrixSet,
        tileGrid: sourceOptions.tileGrid,
        style: sourceOptions.style,
      },
      isUndefined
    );
    return Object.keys(missingOptions);
  };

  const isValidWMTSOptions = (
    sourceOptions: SourceOptions | OlOptions
  ): sourceOptions is OlOptions => {
    if (findMissingWMTSOptions(sourceOptions).length > 0) {
      return false;
    }
    return true;
  };

  if (!isValidWMTSOptions(sourceOptions)) {
    return Promise.reject(
      new Error(`Missing sourceOptions: ${findMissingWMTSOptions(sourceOptions)}`)
    );
  }

  const source = new WMTS(sourceOptions);
  const renderWMTSTemplate = source.getTileUrlFunction();
  const urlFunction = makeTileUrlFunctionFromUrlFunction(renderWMTSTemplate);
  const loader = makeTileLoaderFromUrlFunction(urlFunction);
  const generator = makeGeneratorFromTileLoader(loader);

  const tileLoaders = makeTileCollectionFromSource({
    url: url,
    load: generator,
    source: source,
    minZoom: tileCollectionOptions.minZoom,
    maxZoom: tileCollectionOptions.maxZoom,
    targetExtent: tileCollectionOptions.targetExtent,
    targetProjection: tileCollectionOptions.targetProjection,
  });

  return Promise.resolve(tileLoaders);
}

export async function fetchCapabilities(url: string) {
  let text = await fetch(url).then((response) => response.text());

  // WORKAROUND: CDATA causes parsing error during testing (due to the DOM-replacement library `happy-dom`)
  text = text.replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1");

  // Parse XML into an object
  const parser = new WMTSCapabilities();
  const result = parser.read(text);

  return result
}

export async function optionsFromCapabilities(
  url: string,
  config: OptionsFromCapabilities
): Promise<OlOptions | null> {
  const cap = await fetchCapabilities(url);

  if (config.matrixSet) {
    const matrixSets = cap["Contents"]["TileMatrixSet"].map((tms: any) => tms.Identifier) as Array<string>
    if (!matrixSets.includes(config.matrixSet)) {
      throw new Error(`"${config.matrixSet}" not found in ${matrixSets}`)
    }
  }

  if (config.projection) {
    const projections = cap["Contents"]["TileMatrixSet"].map((tms: any) => {
      return get(tms.SupportedCRS)?.getCode() || tms.SupportedCRS
    }) as Array<string>
    if (!projections.includes(config.projection)) {
      throw new Error(`"${config.projection}" not found in ${projections}`)
    }
  }

  // WORKAROUND: empty list for TileMatrixSetLimits produces error -> set to undefined
  const layers = cap["Contents"]["Layer"];
  const l = layers?.find(function (elt: any) {
    return elt["Identifier"] == config.layer;
  });
  l.TileMatrixSetLink.forEach((tmsl: any) => {
    if (tmsl.TileMatrixSetLimits && tmsl.TileMatrixSetLimits.length === 0) {
      tmsl.TileMatrixSetLimits = undefined;
    }
  });

  return optionsFromCapabilitiesOl(cap, config);
}

function makeTileUrlFunctionFromUrlFunction(renderFunction: UrlFunction) {
  const pixelRatioPlaceholder = 1;
  const projectionPlaceholder = get("EPSG:3857") as Projection;

  function getTileUrl(z: number, x: number, y: number) {
    const url = renderFunction([z, x, y], pixelRatioPlaceholder, projectionPlaceholder);

    if (!url) {
      throw new Error(`No Tile at z: ${z}, x: ${x}, y: ${y}`);
    }
    return url;
  }

  return getTileUrl;
}

function makeTileLoaderFromUrlFunction(
  urlFunction: (z: number, x: number, y: number) => string
) {
  return function (z: number, x: number, y: number) {
    const loader = makeTileLoader(urlFunction);
    return loader(z, x, y);
  };
}
