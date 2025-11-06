import type { Extent as OlExtent } from "ol/extent";
import type { ProjectionLike } from "ol/proj";
import type { UrlLike } from "ol/source/ImageTile";
import type TileRange from "ol/TileRange";

export type Extent = [number, number, number, number];

export type TileRanges = Array<{
  z: number;
  count: number;
  tileRange: TileRange;
}>;

export interface UnfetchedTile {
  x: number;
  y: number;
  z: number;
  load: () => Promise<FetchedTile>;
}

export interface FetchedTile {
  x: number;
  y: number;
  z: number;
  url: string;
  blob: Blob;
}

export interface OptionsFromCapabilities {
  layer: string;
  matrixSet?: string;
  projection?: string;
  requestEncoding?: string;
  style?: string;
  format?: string;
  crossOrigin?: string | null | undefined;
}

export interface TileCollection {
  tileLoaders: Generator<UnfetchedTile, void, unknown>;
  tileRanges: TileRanges;
  totalCount: number;
  minZoom: number;
  maxZoom: number;
  projection?: string;
  extent: OlExtent;
  url: UrlLike;
}

export interface TileCollectionOptions {
  minZoom: number;
  maxZoom: number;
  targetExtent: Extent;
  targetProjection?: ProjectionLike;
}
