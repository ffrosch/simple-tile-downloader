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
}

export interface FetchTilesConfig extends TilesConfig {
  totalCount: number;
  tileRanges: TileRange[];
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
