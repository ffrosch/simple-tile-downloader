/** Must be WGS84 */
type Bbox = [number, number, number, number];

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
  bbox: Bbox;
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
