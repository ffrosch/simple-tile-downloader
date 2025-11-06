import type { Options as OlOptions, UrlLike } from "ol/source/ImageTile";
import ImageTile from "ol/source/ImageTile";
import { expandUrl, pickUrl, renderXYZTemplate } from "ol/uri.js";
import { makeGeneratorFromTileLoader, makeTileCollectionFromSource, makeTileLoader } from "./tiles";
import type {
  FetchedTile,
  TileCollection,
  TileCollectionOptions
} from "./types";

type SourceOptions = Omit<OlOptions, "url" | "loader"> & {
  url: UrlLike;
};

export default function makeTileCollection(
  sourceOptions: SourceOptions,
  tileCollectionOptions: TileCollectionOptions
): TileCollection {
  const loader = makeTileLoaderFromUrlLike(sourceOptions.url);
  const generator = makeGeneratorFromTileLoader(loader);

  const tileCollection = makeTileCollectionFromSource({
    url: sourceOptions.url,
    load: generator,
    source: new ImageTile(sourceOptions),
    minZoom: tileCollectionOptions.minZoom,
    maxZoom: tileCollectionOptions.maxZoom,
    targetExtent: tileCollectionOptions.targetExtent,
    targetProjection: tileCollectionOptions.targetProjection,
  });

  return tileCollection;
}

function makeTileUrlFunction(template: string) {
  function getTileUrl(z: number, x: number, y: number): string {
    const url = renderXYZTemplate(template, z, x, y);
    return url;
  }
  return getTileUrl;
}

function makeTileLoaderFromTemplates(templates: Array<string>) {
  return function(z: number, x: number, y: number) {
    const template = pickUrl(templates, z, x, y);
    const urlFunction = makeTileUrlFunction(template)
    const loader = makeTileLoader(urlFunction)
    return loader(z, x, y);
  };
}

function makeTileLoaderFromUrlLike(
  url: UrlLike
): (z: number, x: number, y: number) => Promise<FetchedTile> {
  let loader;

  if (Array.isArray(url)) {
    loader = makeTileLoaderFromTemplates(url);
  } else if (typeof url === "string") {
    const urls = expandUrl(url);
    loader = makeTileLoaderFromTemplates(urls);
  } else {
    throw new Error(
      "The url option must be a single template, an array of templates, or a function for getting a URL"
    );
  }
  return loader;
}

