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
  sourceUrl: string;
  sourceSubdomains?: string[];
}

interface SourceConfig extends Source {
  /** Must be WGS84 */
  bbox: Bbox;
  minZoom: number;
  maxZoom: number;
}

export interface TargetArea extends SourceConfig {
  crs: string;
}

export interface TilesConfig extends SourceConfig {
  totalCount: number;
  tileRanges: TileRange[];
}
