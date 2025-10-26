import type {
  Extent,
  TileRange,
  WMTSCapabilities,
  WMTSConfig,
  WMTSLayerInfo,
  WMTSTileMatrixSet,
  TileMatrixSetLimits,
  FetchTilesConfig,
} from "./types";
import { getTileRangeForExtent, createXYZTileGrid } from "./tilegrid";
import { getCRSExtent } from "./crs";

/**
 * Fetch WMTS GetCapabilities from service
 */
export async function fetchWMTSCapabilities(url: string): Promise<Document> {
  const urlObj = new URL(url);
  urlObj.searchParams.set("SERVICE", "WMTS");
  urlObj.searchParams.set("REQUEST", "GetCapabilities");

  const response = await fetch(urlObj.toString());
  
  if (!response.ok) {
    throw new Error(
      `Failed to fetch WMTS GetCapabilities: ${response.status} ${response.statusText}`
    );
  }

  const xmlText = await response.text().then(text => text.replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1'));

  // Check if response is valid XML
  if (!xmlText.trim().startsWith("<?xml") && !xmlText.trim().startsWith("<")) {
    throw new Error("Invalid XML response from WMTS service");
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(xmlText, "text/xml");
  
  // Check for XML parsing errors
  const parseError = document.querySelector("parsererror");
  if (parseError) {
    throw new Error(`XML parsing error: ${parseError.textContent}`);
  }

  return document;
}

/**
 * Parse WMTS GetCapabilities XML document
 */
function parseCapabilitiesXML(doc: Document): WMTSCapabilities {
  const layers = new Map<string, WMTSLayerInfo>();
  const tileMatrixSetLinks: Array<{
    tileMatrixSet: string;
    limits?: Map<string, TileMatrixSetLimits>;
  }> = [];
  
  // Parse ServiceIdentification
  const serviceIdElement = doc.getElementsByTagName("ows:ServiceIdentification")[0];
  const serviceIdentification = {
    title: serviceIdElement?.getElementsByTagName("ows:Title")[0]?.textContent || "Unknown",
    abstract: serviceIdElement?.getElementsByTagName("ows:Abstract")[0]?.textContent || undefined,
  };
  
  // Parse Layers
  for (const layer of doc.getElementsByTagName("Layer")) {
    const identifier = layer.getElementsByTagName("ows:Identifier")[0]?.textContent?.trim();
    const title = layer.getElementsByTagName("ows:Title")[0]?.textContent?.trim();
    const formats = Array.from(layer.getElementsByTagName("Format"), ({ textContent }) => textContent)

    // Parse TileMatrixSetLinks
    for (const tmsLink of layer.getElementsByTagName("TileMatrixSetLink")) {
      const tileMatrixSet = tmsLink.querySelector("TileMatrixSet")?.textContent?.trim();
      if (!tileMatrixSet) continue;

      // Parse TileMatrixSetLimits if present
      let limits: Map<string, TileMatrixSetLimits> | undefined;

      const limitsElements = tmsLink.querySelectorAll("TileMatrixLimits");
      if (limitsElements.length > 0) {
        limits = new Map();
        for (const limitEl of limitsElements) {
          const tileMatrix = parseInt(limitEl.querySelector("TileMatrix")?.textContent?.trim() || "");
          const minTileCol = parseInt(limitEl.querySelector("MinTileCol")?.textContent?.trim() || "");
          const maxTileCol = parseInt(limitEl.querySelector("MaxTileCol")?.textContent?.trim() || "");
          const minTileRow = parseInt(limitEl.querySelector("MinTileRow")?.textContent?.trim() || "");
          const maxTileRow = parseInt(limitEl.querySelector("MaxTileRow")?.textContent?.trim() || "");

          if ([minTileCol, maxTileCol, minTileRow, maxTileRow].every(val => !isNaN(val))) {
            limits.set(tileMatrix, {
              tileMatrix,
              minTileRow,
              maxTileRow,
              minTileCol,
              maxTileCol,
            });
          }
        }
      }

      tileMatrixSetLinks.push({ tileMatrixSet, limits });
    }

    // Parse BoundingBox if present
    const bboxEl = layer.querySelector("ows:WGS84BoundingBox, ows:BoundingBox");
    let boundingBox: Extent | undefined;
    if (bboxEl) {
      const lowerCorner = bboxEl.querySelector("LowerCorner")?.textContent;
      const upperCorner = bboxEl.querySelector("UpperCorner")?.textContent;
      if (lowerCorner && upperCorner) {
        const lowerParts = lowerCorner.split(" ").map(Number);
        const upperParts = upperCorner.split(" ").map(Number);
        const minX = lowerParts[0];
        const minY = lowerParts[1];
        const maxX = upperParts[0];
        const maxY = upperParts[1];
        if (
          minX !== undefined && !isNaN(minX) &&
          minY !== undefined && !isNaN(minY) &&
          maxX !== undefined && !isNaN(maxX) &&
          maxY !== undefined && !isNaN(maxY)
        ) {
          boundingBox = [minX, minY, maxX, maxY];
        }
      }
    }

    layers.set(identifier, {
      identifier,
      title,
      formats,
      tileMatrixSetLinks,
      boundingBox,
    });
  }

  // Collect all unique formats
  const allFormats = new Set<string>();
  for (const layer of layers.values()) {
    for (const format of layer.formats) {
      allFormats.add(format);
    }
  }

  return {
    layers,
    tileMatrixSets,
    formats: Array.from(allFormats),
    serviceIdentification,
  };
}

/**
 * Detect service type (XYZ or WMTS) by attempting GetCapabilities request
 */
export async function detectServiceType(
  url: string,
  explicitType?: "xyz" | "wmts"
): Promise<"xyz" | "wmts"> {
  // If explicitly provided, use it
  if (explicitType) {
    return explicitType;
  }

  // Try WMTS GetCapabilities with HEAD request (lightweight)
  try {
    const capUrl = new URL(url);
    capUrl.searchParams.set("SERVICE", "WMTS");
    capUrl.searchParams.set("REQUEST", "GetCapabilities");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    const response = await fetch(capUrl.toString(), {
      method: "HEAD",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return "wmts";
    }
  } catch (error) {
    // Network error, timeout, or invalid response - assume XYZ
  }

  // Default to XYZ for backward compatibility
  return "xyz";
}

/**
 * Select default format from available formats
 * Preference order: png → jpeg → webp → first available
 */
export function selectDefaultFormat(availableFormats: string[]): string {
  const preferences = ["image/png", "image/jpeg", "image/webp"];

  for (const preferred of preferences) {
    if (availableFormats.includes(preferred)) {
      return preferred;
    }
  }

  // Fallback to first available format
  const firstFormat = availableFormats[0];
  if (firstFormat) {
    return firstFormat;
  }

  throw new Error("No formats available in service capabilities");
}

/**
 * Select default layer if service has exactly one layer
 * Returns undefined if multiple layers (requires explicit selection)
 */
export function selectDefaultLayer(
  capabilities: WMTSCapabilities
): string | undefined {
  const layers = Array.from(capabilities.layers.keys());

  // Auto-select only if exactly one layer
  if (layers.length === 1) {
    return layers[0];
  }

  // Multiple layers or none - return undefined
  return undefined;
}

/**
 * Find TileMatrixSet that matches the requested CRS
 */
export function findTileMatrixSetForCRS(
  capabilities: WMTSCapabilities,
  layer: string,
  crs: string
): string {
  const layerInfo = capabilities.layers.get(layer);
  if (!layerInfo) {
    throw new Error(`Layer "${layer}" not found in capabilities`);
  }

  const normalizedCRS = crs.toUpperCase(); // "EPSG:3857"

  // Find TileMatrixSets linked to this layer that match the CRS
  const matchingTMS: string[] = [];

  for (const link of layerInfo.tileMatrixSetLinks) {
    const tms = capabilities.tileMatrixSets.get(link.tileMatrixSet);
    if (tms && tms.crs.toUpperCase() === normalizedCRS) {
      matchingTMS.push(link.tileMatrixSet);
    }
  }

  if (matchingTMS.length === 0) {
    throw new Error(
      `No TileMatrixSet found for CRS "${crs}" in layer "${layer}"`
    );
  }

  if (matchingTMS.length === 1) {
    const singleMatch = matchingTMS[0];
    if (singleMatch) {
      return singleMatch;
    }
  }

  // Multiple matches - prefer one with matching identifier
  // e.g., "EPSG:3857" or "GoogleMapsCompatible" for EPSG:3857
  const crsNumber = normalizedCRS.replace("EPSG:", "");
  const preferred = matchingTMS.find(
    (tms) => tms.includes(crsNumber) || tms.includes(normalizedCRS)
  );

  if (preferred) {
    return preferred;
  }

  const firstMatch = matchingTMS[0];
  if (firstMatch) {
    return firstMatch;
  }

  // Should never reach here due to earlier length check, but TypeScript needs it
  throw new Error(
    `No TileMatrixSet found for CRS "${crs}" in layer "${layer}"`
  );
}

/**
 * Validate WMTS parameters against GetCapabilities
 */
export function validateWMTSParams(
  capabilities: WMTSCapabilities,
  layer: string,
  format: string,
  tileMatrixSet: string,
  crs: string
): void {
  // Validate layer exists
  const layerInfo = capabilities.layers.get(layer);
  if (!layerInfo) {
    const availableLayers = Array.from(capabilities.layers.keys()).join(", ");
    throw new Error(
      `Layer "${layer}" not found in service capabilities. Available: ${availableLayers}`
    );
  }

  // Validate format
  if (!layerInfo.formats.includes(format)) {
    throw new Error(
      `Format "${format}" not supported for layer "${layer}". Available: ${layerInfo.formats.join(", ")}`
    );
  }

  // Validate TileMatrixSet is linked to layer
  const tmsLink = layerInfo.tileMatrixSetLinks.find(
    (link) => link.tileMatrixSet === tileMatrixSet
  );
  if (!tmsLink) {
    const availableTMS = layerInfo.tileMatrixSetLinks
      .map((link) => link.tileMatrixSet)
      .join(", ");
    throw new Error(
      `TileMatrixSet "${tileMatrixSet}" not available for layer "${layer}". Available: ${availableTMS}`
    );
  }

  // Validate CRS matches TileMatrixSet
  const tms = capabilities.tileMatrixSets.get(tileMatrixSet);
  if (tms && tms.crs.toUpperCase() !== crs.toUpperCase()) {
    throw new Error(
      `CRS mismatch: requested "${crs}" but TileMatrixSet "${tileMatrixSet}" uses "${tms.crs}"`
    );
  }
}

/**
 * Generate WMTS GetTile URL with KVP (Key-Value Pair) encoding
 */
export function generateWMTSUrl(
  baseUrl: string,
  layer: string,
  format: string,
  tileMatrixSet: string,
  z: number,
  x: number,
  y: number
): string {
  const url = new URL(baseUrl);

  // Add WMTS parameters
  url.searchParams.set("SERVICE", "WMTS");
  url.searchParams.set("REQUEST", "GetTile");
  url.searchParams.set("VERSION", "1.0.0");
  url.searchParams.set("LAYER", layer);
  url.searchParams.set("STYLE", "default");
  url.searchParams.set("FORMAT", format);
  url.searchParams.set("TILEMATRIXSET", tileMatrixSet);
  url.searchParams.set("TILEMATRIX", z.toString());
  url.searchParams.set("TILEROW", y.toString());
  url.searchParams.set("TILECOL", x.toString());

  return url.toString();
}

/**
 * Apply TileMatrixSetLimits to constrain tile range
 */
function applyTileMatrixSetLimits(
  userTileRange: TileRange,
  limits: TileMatrixSetLimits | undefined
): TileRange {
  if (!limits) {
    // No limits defined, use user's range as-is
    return userTileRange;
  }

  // Intersect user range with service limits
  const minX = Math.max(userTileRange.minX, limits.minTileCol);
  const maxX = Math.min(userTileRange.maxX, limits.maxTileCol);
  const minY = Math.max(userTileRange.minY, limits.minTileRow);
  const maxY = Math.min(userTileRange.maxY, limits.maxTileRow);

  // Validate intersection is non-empty
  if (minX > maxX || minY > maxY) {
    throw new Error(
      `Requested tile range for zoom ${userTileRange.zoom} is outside service TileMatrixSetLimits`
    );
  }

  return {
    ...userTileRange,
    minX,
    maxX,
    minY,
    maxY,
    count: (maxX - minX + 1) * (maxY - minY + 1),
  };
}

/**
 * Calculate tile ranges for WMTS with TileMatrixSetLimits applied
 */
async function calculateWMTSTileRanges(
  bbox: Extent,
  crs: string,
  minZoom: number,
  maxZoom: number,
  limitsMap: Map<string, TileMatrixSetLimits> | undefined
): Promise<TileRange[]> {
  // Get CRS extent for tile grid creation
  const extent = await getCRSExtent(crs);

  // Create XYZ-compatible grid for tile calculations
  const tileGrid = createXYZTileGrid(extent, minZoom, maxZoom);

  const tileRanges: TileRange[] = [];

  for (let z = minZoom; z <= maxZoom; z++) {
    // Calculate user's requested tile range
    const userRange = getTileRangeForExtent(bbox, z, tileGrid);

    // Get service limits for this zoom level
    const limits = limitsMap?.get(z.toString());

    // Apply limits if defined
    const finalRange = applyTileMatrixSetLimits(userRange, limits);

    tileRanges.push(finalRange);
  }

  return tileRanges;
}

/**
 * Main orchestrator: Process WMTS tiles configuration
 */
export async function processWMTSTilesConfig(
  config: WMTSConfig
): Promise<FetchTilesConfig> {
  const { crs, bbox, url, maxZoom, minZoom, layer, format } = config;

  const capabilitiesDocument = await fetchWMTSCapabilities(url);
  const capabilities = parseCapabilitiesXML(capabilitiesDocument);

  // 2. Auto-select or validate layer
  const selectedLayer = layer || selectDefaultLayer(capabilities);
  if (!selectedLayer) {
    const availableLayers = Array.from(capabilities.layers.keys()).join(", ");
    throw new Error(
      `Multiple layers available. Please specify layer parameter. Available: ${availableLayers}`
    );
  }

  // 3. Find matching TileMatrixSet for the CRS
  const selectedTMS = findTileMatrixSetForCRS(capabilities, selectedLayer, crs);

  // 4. Auto-select or use provided format
  const layerInfo = capabilities.layers.get(selectedLayer)!;
  const selectedFormat = format || selectDefaultFormat(layerInfo.formats);

  // 5. Validate all parameters
  validateWMTSParams(
    capabilities,
    selectedLayer,
    selectedFormat,
    selectedTMS,
    crs
  );

  // 6. Get TileMatrixSetLimits for this layer+TMS
  const tmsLink = layerInfo.tileMatrixSetLinks.find(
    (l) => l.tileMatrixSet === selectedTMS
  )!;

  // 7. Calculate tile ranges with limits applied
  const tileRanges = await calculateWMTSTileRanges(
    bbox,
    crs,
    minZoom,
    maxZoom,
    tmsLink.limits
  );

  // 8. Return config with WMTS parameters
  const totalCount = tileRanges.reduce((sum, r) => sum + r.count, 0);

  return {
    ...config,
    crs,
    bbox,
    url,
    totalCount,
    tileRanges,
    // Store WMTS params for URL generation in fetchTile
    _wmtsParams: {
      layer: selectedLayer,
      format: selectedFormat,
      tileMatrixSet: selectedTMS,
    },
  };
}
