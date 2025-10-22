import proj4 from "proj4";
import type { Extent, EPSGInfo, CRSCacheEntry } from './types';

const OlExtentEPSG3857: Extent = [ -20037508.342789244, -20037508.342789244, 20037508.342789244, 20037508.342789244 ]

/**
 * In-memory cache for CRS definitions and extents
 */
const crsCache = new Map<string, CRSCacheEntry>();

/**
 * Normalize EPSG code to standard format "EPSG:XXXX"
 */
function normalizeEPSGCode(crs: string | number): string {
  if (typeof crs === "number") {
    return `EPSG:${crs}`;
  }

  // Handle various input formats
  const numericMatch = crs.match(/\d+/);
  if (numericMatch) {
    return `EPSG:${numericMatch[0]}`;
  }

  throw new Error(`Invalid EPSG code format: ${crs}`);
}

/**
 * Extract numeric EPSG code from normalized format
 */
function getNumericCode(normalizedCode: string): string {
  const match = normalizedCode.match(/\d+/);
  if (!match) {
    throw new Error(`Cannot extract numeric code from: ${normalizedCode}`);
  }
  return match[0];
}

/**
 * Fetch CRS definition and extent from epsg.io
 */
export async function fetchCRSFromEPSG(
  code: string
): Promise<{
  proj4String: string;
  bboxWGS84: Extent;
  name: string;
}> {
  const numericCode = getNumericCode(code);
  const baseUrl = "https://epsg.io";

  // Fetch both JSON and proj4 definition in parallel
  const [jsonResponse, proj4Response] = await Promise.all([
    fetch(`${baseUrl}/${numericCode}.json`),
    fetch(`${baseUrl}/${numericCode}.proj4`),
  ]);

  if (!jsonResponse.ok) {
    throw new Error(
      `Failed to fetch CRS info for ${code}: ${jsonResponse.status} ${jsonResponse.statusText}`
    );
  }

  if (!proj4Response.ok) {
    throw new Error(
      `Failed to fetch proj4 definition for ${code}: ${proj4Response.status} ${proj4Response.statusText}`
    );
  }

  const epsgInfo: EPSGInfo = await jsonResponse.json();
  const proj4String = (await proj4Response.text()).trim();

  // Convert bbox from epsg.io format to Extent [minX, minY, maxX, maxY]
  const bbox = epsgInfo.bbox;
  const bboxWGS84: Extent = [
    bbox.west_longitude,
    bbox.south_latitude,
    bbox.east_longitude,
    bbox.north_latitude,
  ];

  return { proj4String, bboxWGS84, name: epsgInfo.name };
}

/**
 * Transform extent from one CRS to another using 4-corner sampling
 */
export function transformExtent(
  extent: Extent,
  sourceCRS: string,
  targetCRS: string
): Extent {
  const [minX, minY, maxX, maxY] = extent;

  // Transform all 4 corners
  const corners = [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
  ];

  const transformedCorners = corners.map((corner) =>
    proj4(sourceCRS, targetCRS, corner)
  );

  // Find bounding box of transformed corners
  const xs = transformedCorners.map((c) => c[0]).filter((x): x is number => x !== undefined);
  const ys = transformedCorners.map((c) => c[1]).filter((y): y is number => y !== undefined);

  if (xs.length === 0 || ys.length === 0) {
    throw new Error("Failed to transform extent: no valid coordinates");
  }

  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/**
 * Get the valid extent for a CRS by fetching from epsg.io
 * Results are cached for subsequent calls.
 *
 * @param crs - EPSG code (e.g., "EPSG:3857", "3857", or 3857)
 * @returns Promise resolving to extent in the target CRS coordinate system
 */
export async function getCRSExtent(crs: string | number): Promise<Extent> {
  const normalized = normalizeEPSGCode(crs);

  // Check cache first
  if (crsCache.has(normalized)) {
    return crsCache.get(normalized)!.extent;
  }

  // Fetch from epsg.io
  const { proj4String, bboxWGS84, name } = await fetchCRSFromEPSG(normalized);

  // Register with proj4 if not already registered
  if (!proj4.defs(normalized)) {
    proj4.defs(normalized, proj4String);
  }

  // Transform bbox from WGS84 to target CRS
  let extent: Extent;
  // Ensure consistency compared to Openlayers
  if (normalized === "EPSG:3857") {
    extent = OlExtentEPSG3857;
  } else {
    extent = transformExtent(bboxWGS84, "EPSG:4326", normalized);
  }

  // Cache for future use
  crsCache.set(normalized, { proj4String, bboxWGS84, extent, name });

  return extent;
}

/**
 * Check if one extent contains another
 */
export function containsExtent(extent1: Extent, extent2: Extent): boolean {
  const [minX1, minY1, maxX1, maxY1] = extent1;
  const [minX2, minY2, maxX2, maxY2] = extent2;

  return (
    minX1 <= minX2 && maxX1 >= maxX2 && minY1 <= minY2 && maxY1 >= maxY2
  );
}

/**
 * Preload common CRS definitions for better performance
 * Call this during application initialization
 */
export async function preloadCommonCRS(
  codes: Array<string | number> = [4326, 3857]
): Promise<void> {
  await Promise.all(codes.map((code) => getCRSExtent(code)));
}

/**
 * Get cached CRS information (if available)
 */
export function getCachedCRSInfo(crs: string | number): CRSCacheEntry | undefined {
  const normalized = normalizeEPSGCode(crs);
  return crsCache.get(normalized);
}

/**
 * Clear CRS cache (useful for testing)
 */
export function clearCRSCache(): void {
  crsCache.clear();
}
