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

export interface TileRange {
  zoom: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  count: number;
}

export interface Source {
  url: string;
  subdomains?: string[];
}

interface SourceConfig extends Source {
  /** Must be WGS84 */
  bbox: Extent;
  minZoom: number;
  maxZoom: number;
}

export interface TilesConfig extends SourceConfig {
  crs: string;
  /** Optional: explicitly specify service type (auto-detected if omitted) */
  serviceType?: 'xyz' | 'wmts';
}

/**
 * WMTS-specific configuration extending TilesConfig
 * TileMatrixSet is automatically matched from the crs parameter
 */
export interface WMTSConfig extends TilesConfig {
  /** Optional: layer identifier (auto-selected if service has single layer) */
  layer?: string;
  /** Optional: image format (defaults to png > jpeg > webp > first available) */
  format?: string;
}

export type ProcessTilesConfig = TilesConfig | WMTSConfig;

export interface FetchTilesConfig extends TilesConfig {
  totalCount: number;
  tileRanges: TileRange[];
  /** Internal: WMTS parameters for URL generation */
  _wmtsParams?: {
    layer: string;
    format: string;
    tileMatrixSet: string;
  };
}

export interface UnfetchedTile {
  url: string;
  x: number;
  y: number;
  z: number;
}

export interface FetchedTile extends UnfetchedTile {
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
