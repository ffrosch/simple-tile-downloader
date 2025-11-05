import type { UrlLike } from "ol/source/ImageTile";
import type { Options as WMTSOptions } from "ol/source/WMTS";
import type { Options as XYZOptions } from "ol/source/XYZ";
import type TileRange from "ol/TileRange";
import type { Extent as OlExtent } from "ol/extent";

export type Extent = [number, number, number, number];

/**
 * EPSG.io API response structure for CRS information
 */
export interface EPSGInfo {
  code: string;
  name: string;
  bbox: {
    south_latitude: number;
    west_longitude: number;
    north_latitude: number;
    east_longitude: number;
  };
}

/**
 * Cached CRS information
 */
export interface CRSCacheEntry {
  proj4String: string;
  bboxWGS84: Extent;
  extent: Extent;
  name: string;
}

/**
 * XYZ Tile Grid configuration
 */
export interface XYZTileGrid {
  extent: Extent;
  minZoom: number;
  maxZoom: number;
  tileSize: number;
  resolutions: number[];
}

export interface Source {
  url: string;
  subdomains?: string[];
}

export interface TilesConfig extends Source {
  /** Must be WGS84 */
  crs?: string;
  bbox: Extent;
  minZoom: number;
  maxZoom: number;
}

export interface WMTSConfig {
  config: {
    bbox: Extent;
    minZoom: number;
    maxZoom: number;
  };
  options: WMTSOptions;
}

export type TileRanges = Array<{
  z: number;
  count: number;
  tileRange: TileRange;
}>;

export interface TileUrls {
  zoom: number;
  count: number;
  urls: string[];
};

export interface FetchTilesConfig extends TilesConfig {
  totalCount: number;
  tileRanges: TileRanges;
}

export interface UnfetchedTile {
  x: number;
  y: number;
  z: number;
  controller: AbortController;
  load: () => Promise<FetchedTile>;
}

export interface FetchedTile {
  x: number;
  y: number;
  z: number;
  url: string;
  blob: Blob;
}

/**
 * WMTS GetCapabilities structures
 */

/**
 * Parsed WMTS GetCapabilities document
 */
export interface WMTSCapabilities {
  layers: Map<string, WMTSLayerInfo>;
  tileMatrixSets: Map<string, WMTSTileMatrixSet>;
  formats: string[];
  serviceIdentification: {
    title: string;
    abstract?: string;
  };
}

/**
 * Information about a WMTS layer from GetCapabilities
 */
export interface WMTSLayerInfo {
  identifier: string;
  title: string;
  formats: string[];
  tileMatrixSetLinks: Array<{
    tileMatrixSet: string;
    limits?: Map<string, TileMatrixSetLimits>;
  }>;
  boundingBox?: Extent;
}

/**
 * Tile range constraints for a specific zoom level (TileMatrix)
 */
export interface TileMatrixSetLimits {
  tileMatrix: string;
  minTileRow: number;
  maxTileRow: number;
  minTileCol: number;
  maxTileCol: number;
}

/**
 * WMTS TileMatrixSet definition
 */
export interface WMTSTileMatrixSet {
  identifier: string;
  crs: string;
  extent?: Extent;
}

export interface Selection {
  bbox: Extent;
  minZoom: number;
  maxZoom: number;
}

export interface customWMTSOptions extends Selection, WMTSOptions {}

export interface customXYZOptions extends Selection, XYZOptions {
  bbox: Extent;
  minZoom: number;
  maxZoom: number;
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