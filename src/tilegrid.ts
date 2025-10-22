import type { Extent, TileRange, XYZTileGrid } from "./types";
import { transformExtent } from "./crs";

/**
 * Calculate resolutions for XYZ tile grid
 * Resolution = max(extent_width, extent_height) / (tileSize * 2^zoom)
 *
 * OpenLayers uses the maximum dimension to ensure square tiles cover the entire extent.
 * Resolutions are calculated from zoom 0, regardless of minZoom.
 */
function calculateResolutions(
  extent: Extent,
  maxZoom: number,
  tileSize: number = 256
): number[] {
  const [minX, minY, maxX, maxY] = extent;
  const extentWidth = maxX - minX;
  const extentHeight = maxY - minY;

  // Use maximum dimension for square tile grid (OpenLayers behavior)
  const maxDimension = Math.max(extentWidth, extentHeight);

  const resolutions: number[] = [];
  // Calculate from zoom 0, even if minZoom is higher
  for (let z = 0; z <= maxZoom; z++) {
    const resolution = maxDimension / (tileSize * Math.pow(2, z));
    resolutions.push(resolution);
  }

  return resolutions;
}

/**
 * Get tile range for an extent at a specific zoom level
 * Works with any projection by using the extent and resolution
 */
export function getTileRangeForExtent(
  extent: Extent,
  zoom: number,
  grid: XYZTileGrid
): TileRange {
  const [bboxMinX, bboxMinY, bboxMaxX, bboxMaxY] = extent;
  const [extMinX, _extMinY, _extMaxX, extMaxY] = grid.extent;
  const tilesAtZoom = Math.pow(2, zoom);

  // Get resolution for this zoom level
  const resolution = grid.resolutions[zoom];
  const tileSize = grid.tileSize;

  if (!resolution) {
    throw new Error(`Zoom level ${zoom} not found in "grid.resolutions"`)
  }

  // Origin is at top-left corner: [minX, maxY]
  const originX = extMinX;
  const originY = extMaxY;

  // Calculate tile indices
  // X increases from left to right
  const tileMinX = Math.floor((bboxMinX - originX) / (resolution * tileSize));
  const tileMaxX = Math.floor((bboxMaxX - originX) / (resolution * tileSize));

  // Y increases from top to bottom (origin is at maxY, top of extent)
  const tileMinY = Math.floor((originY - bboxMaxY) / (resolution * tileSize));
  const tileMaxY = Math.floor((originY - bboxMinY) / (resolution * tileSize));

  // Clamp to valid tile range
  const minX = Math.max(0, Math.min(tileMinX, tileMaxX));
  const maxX = Math.min(tilesAtZoom - 1, Math.max(tileMinX, tileMaxX));
  const minY = Math.max(0, Math.min(tileMinY, tileMaxY));
  const maxY = Math.min(tilesAtZoom - 1, Math.max(tileMinY, tileMaxY));

  // Tile count for extent and zoom level
  const count = (maxX - minX + 1) * (maxY - minY + 1);

  return {
    zoom,
    minX,
    maxX,
    minY,
    maxY,
    count,
  };
}

/**
 * Create an XYZ tile grid
 *
 * @param extent - Extent in the target CRS
 * @param minZoom - Minimum zoom level (default: 0)
 * @param maxZoom - Maximum zoom level (default: 20)
 * @param tileSize - Tile size in pixels (default: 256)
 */
export function createXYZTileGrid(
  extent: Extent,
  minZoom: number = 0,
  maxZoom: number = 20,
  tileSize: number = 256
): XYZTileGrid {
  const resolutions = calculateResolutions(extent, maxZoom, tileSize);

  return {
    extent,
    minZoom,
    maxZoom,
    tileSize,
    resolutions,
  };
}

/**
 * Get tile range for an extent and zoom level, transforming from source CRS if needed
 */
export function getTileRangeForExtentAndZ(
  bbox: Extent,
  sourceCRS: string,
  targetCRS: string,
  zoom: number,
  grid: XYZTileGrid
): TileRange {
  // Transform bbox to target CRS if different
  const transformedExtent =
    sourceCRS === targetCRS
      ? bbox
      : transformExtent(bbox, sourceCRS, targetCRS);

  return getTileRangeForExtent(transformedExtent, zoom, grid);
}
