# WMTS Feature Implementation Plan

## Overview
Add WMTS (Web Map Tile Service) support to simple-tile-downloader while maintaining full backward compatibility with existing XYZ tile functionality. The implementation follows KISS principles and single responsibility pattern.

## Architecture Decisions

### 1. **Service Type Detection**
- **Strategy**: Optional explicit parameter with smart auto-detection
- **Implementation**: HEAD request to GetCapabilities endpoint with 5s timeout
- **Fallback**: Default to XYZ for backward compatibility
- **Error**: Throw if auto-detection fails and no explicit type provided

### 2. **URL Format Handling**
- Accept base URL with or without existing query parameters
- Use URL API to intelligently merge WMTS query parameters
- Preserve existing query params, add standard WMTS params

### 3. **Layer Parameter**
- **Auto-select**: If service has exactly one layer
- **Require explicit**: If multiple layers available
- **Error message**: List all available layers for easy configuration

### 4. **TileMatrixSet Selection**
- **AUTO-MATCH FROM CRS**: Use `crs` parameter to find matching TileMatrixSet
- **Logic**: Find TileMatrixSet in GetCapabilities where `TileMatrixSet.crs === config.crs`
- **Preference**: If multiple TileMatrixSets match CRS, prefer one with identifier matching CRS (e.g., "EPSG:3857" or "GoogleMapsCompatible" for EPSG:3857)
- **No user parameter**: User cannot override - TileMatrixSet is determined by CRS

### 5. **Format Selection**
- **Preference order**: png → jpeg → webp → first available
- **Smart default**: Inspect GetCapabilities for layer's supported formats
- **Allow explicit**: User can specify exact format

### 6. **TileMatrixSetLimits Application**
- **Strategy**: Intersect user's bbox/zoom with service-defined limits
- **Validation**: Throw error if intersection is empty
- **Calculation**: Apply limits per zoom level during tile range calculation

### 7. **GetCapabilities Caching**
- **Pattern**: In-memory Map (matches existing CRS cache in src/crs.ts)
- **Scope**: Session-scoped
- **Testing**: Export clearWMTSCache() utility

### 8. **Backward Compatibility**
- **XYZ API**: Completely unchanged
- **processTilesConfig**: Routes to XYZ or WMTS handler transparently
- **Existing users**: Zero breaking changes

## File Structure

### New Files

#### **src/wmts.ts** (~400 lines)
Complete WMTS implementation module containing:

**1. Type Definitions & Cache**
```typescript
const wmtsCapabilitiesCache = new Map<string, WMTSCapabilities>();
```

**2. XML Parsing Functions**
- `parseCapabilitiesXML(doc: Document): WMTSCapabilities`
- `fetchWMTSCapabilities(baseUrl: string): Promise<WMTSCapabilities>`
- `getCachedWMTSCapabilities(baseUrl: string): Promise<WMTSCapabilities>`

**3. Service Detection**
- `detectServiceType(url: string, explicit?: 'xyz' | 'wmts'): Promise<'xyz' | 'wmts'>`

**4. Smart Defaults**
- `selectDefaultFormat(formats: string[]): string`
- `selectDefaultLayer(capabilities: WMTSCapabilities): string | undefined`
- `findTileMatrixSetForCRS(capabilities, layer, crs): string` - **Matches CRS to TileMatrixSet**

**5. Validation**
- `validateWMTSParams(capabilities, layer, format, tileMatrixSet, crs): void`

**6. URL Generation**
- `generateWMTSUrl(baseUrl, layer, format, tileMatrixSet, z, x, y): string`

**7. Tile Range Calculation**
- `applyTileMatrixSetLimits(userRange: TileRange, limits?: TileMatrixSetLimits): TileRange`
- `calculateWMTSTileRanges(bbox, crs, minZoom, maxZoom, tileMatrixSet, limits): TileRange[]`

**8. Main Orchestrator**
- `processWMTSTilesConfig(config: WMTSConfig): Promise<FetchTilesConfig>`

**9. Exports**
- `export { clearWMTSCache, processWMTSTilesConfig, detectServiceType, generateWMTSUrl }`

### Modified Files

#### **src/types.ts** (~50 lines added)
Add WMTS-specific type definitions:

```typescript
// WMTS Capabilities structures
export interface WMTSCapabilities {
  layers: Map<string, WMTSLayerInfo>;
  tileMatrixSets: Map<string, WMTSTileMatrixSet>;
  formats: string[];
  serviceIdentification: { title: string; abstract?: string };
}

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

export interface TileMatrixSetLimits {
  tileMatrix: string;
  minTileRow: number;
  maxTileRow: number;
  minTileCol: number;
  maxTileCol: number;
}

export interface WMTSTileMatrixSet {
  identifier: string;
  crs: string;
  extent?: Extent;
}

// Extend existing config - NO tileMatrixSet parameter
export interface WMTSConfig extends TilesConfig {
  serviceType?: 'xyz' | 'wmts';
  layer?: string;
  format?: string;
  // NOTE: tileMatrixSet is derived from crs, not a user parameter
}

// Internal: extend FetchTilesConfig for WMTS params
export interface FetchTilesConfig extends TilesConfig {
  totalCount: number;
  tileRanges: TileRange[];
  _wmtsParams?: {
    layer: string;
    format: string;
    tileMatrixSet: string;
  };
}
```

#### **src/tiles.ts** (~30 lines modified)
Minimal changes for routing:

**1. Import WMTS functions**
```typescript
import { detectServiceType, processWMTSTilesConfig } from './wmts';
```

**2. Refactor processTilesConfig (lines ~15-50)**
```typescript
export async function processTilesConfig(config: TilesConfig): Promise<FetchTilesConfig> {
  // Detect service type
  const serviceType = await detectServiceType(config.url, config.serviceType);
  
  // Route to appropriate handler
  if (serviceType === 'wmts') {
    return processWMTSTilesConfig(config);
  } else {
    return processXYZTilesConfig(config);
  }
}

// Extract existing XYZ logic
async function processXYZTilesConfig(config: TilesConfig): Promise<FetchTilesConfig> {
  // Move existing processTilesConfig logic here
  const { crs, bbox, url, subdomains, maxZoom, minZoom } = config;
  const extent = await getCRSExtent(crs);
  // ... rest of current logic unchanged
}
```

**3. Modify fetchTile (lines ~55-90)**
```typescript
export async function fetchTile(
  x: number,
  y: number,
  z: number,
  config: FetchTilesConfig
): Promise<{ data: ArrayBuffer; contentType: string }> {
  let url: string;
  
  // Check if WMTS
  if ('_wmtsParams' in config && config._wmtsParams) {
    const { layer, format, tileMatrixSet } = config._wmtsParams;
    url = generateWMTSUrl(config.url, layer, format, tileMatrixSet, z, x, y);
  } else {
    // XYZ URL (existing logic)
    url = config.url
      .replace('{x}', x.toString())
      .replace('{y}', y.toString())
      .replace('{z}', z.toString());
  }
  
  // Rest of function unchanged (subdomain handling, fetch, etc.)
}
```

#### **src/index.ts** (~3 lines added)
Export new WMTS types and utilities:

```typescript
// Existing exports unchanged
export { fetchTile, fetchTiles, processTilesConfig } from "./tiles";
export { formatBytes } from "./utils";
export { default } from "./tiles";

// New WMTS exports
export type { WMTSConfig, WMTSCapabilities, WMTSLayerInfo } from "./types";
export { clearWMTSCache } from "./wmts";
```

## Implementation Phases

### Phase 1: Type Definitions (30 min)
- Add WMTS types to src/types.ts
- Extend TilesConfig with optional WMTS parameters (serviceType, layer, format)
- **NO tileMatrixSet parameter** - derived from crs
- Add internal FetchTilesConfig extension

### Phase 2: Core WMTS Module (3-4 hours)
Create src/wmts.ts with:
1. XML parsing (GetCapabilities → WMTSCapabilities)
2. Caching layer (Map-based, matching CRS pattern)
3. Service detection (HEAD request with timeout)
4. Smart defaults (layer, format selection)
5. **TileMatrixSet matching from CRS** (findTileMatrixSetForCRS)
6. Validation (parameters against capabilities)
7. URL generation (KVP query parameters)
8. TileMatrixSetLimits parsing and application
9. Main orchestrator (processWMTSTilesConfig)

### Phase 3: Integration (1 hour)
Modify src/tiles.ts:
1. Add service type detection
2. Refactor processTilesConfig to route XYZ vs WMTS
3. Extract XYZ logic to processXYZTilesConfig
4. Modify fetchTile for WMTS URL generation

### Phase 4: Exports (15 min)
Update src/index.ts:
- Export WMTS types
- Export clearWMTSCache utility
- Maintain existing exports

## Key Implementation Detail: TileMatrixSet Matching

The `findTileMatrixSetForCRS` function automatically matches user's CRS to service's TileMatrixSet:

```typescript
function findTileMatrixSetForCRS(
  capabilities: WMTSCapabilities,
  layer: string,
  crs: string
): string {
  const layerInfo = capabilities.layers.get(layer)!;
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
    throw new Error(`No TileMatrixSet found for CRS "${crs}" in layer "${layer}"`);
  }
  
  if (matchingTMS.length === 1) {
    return matchingTMS[0];
  }
  
  // Multiple matches - prefer one with matching identifier
  // e.g., "EPSG:3857" or "GoogleMapsCompatible" for EPSG:3857
  const crsNumber = normalizedCRS.replace('EPSG:', '');
  const preferred = matchingTMS.find(tms => 
    tms.includes(crsNumber) || tms.includes(normalizedCRS)
  );
  
  return preferred || matchingTMS[0];
}
```

## Error Handling

All errors include actionable messages:

1. **Service Detection**: "Could not detect service type. Please specify serviceType: 'xyz' | 'wmts'"
2. **Capabilities Fetch**: "Failed to fetch WMTS GetCapabilities: {status} {statusText}"
3. **Layer Not Found**: "Layer 'X' not found. Available: A, B, C"
4. **Format Not Supported**: "Format 'X' not supported for layer 'Y'. Available: A, B, C"
5. **TileMatrixSet Not Found**: "No TileMatrixSet found for CRS 'EPSG:3857' in layer 'Y'"
6. **Multiple Layers**: "Multiple layers available. Please specify: A, B, C"
7. **Tile Range Exceeds Limits**: "Requested tile range for zoom Z exceeds service limits"

## Usage Examples

### Example 1: XYZ (existing, unchanged)
```typescript
const config = await processTilesConfig({
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  bbox: [-180, -85, 180, 85],
  crs: 'EPSG:3857',
  minZoom: 0,
  maxZoom: 5
});

for await (const tile of fetchTiles(config)) {
  console.log(`Downloaded tile ${tile.x},${tile.y},${tile.z}`);
}
```

### Example 2: WMTS with auto-detection (minimal config)
```typescript
const config = await processTilesConfig({
  url: 'https://example.com/wmts',
  bbox: [-180, -85, 180, 85],
  crs: 'EPSG:3857', // TileMatrixSet auto-matched from this
  minZoom: 0,
  maxZoom: 5
  // Auto-detects WMTS, auto-selects single layer, auto-selects png format
  // TileMatrixSet automatically matched to EPSG:3857
});
```

### Example 3: WMTS with explicit parameters
```typescript
const config = await processTilesConfig({
  url: 'https://example.com/wmts',
  bbox: [-180, -85, 180, 85],
  crs: 'EPSG:4326', // TileMatrixSet auto-matched from this
  minZoom: 0,
  maxZoom: 5,
  serviceType: 'wmts',
  layer: 'satellite',
  format: 'image/jpeg'
  // TileMatrixSet automatically matched to EPSG:4326 (e.g., "WGS84" TileMatrixSet)
});
```

## Quality Assurance

### Code Quality
- ✅ TypeScript strict mode compliance
- ✅ Follows existing code patterns (CRS caching, tile grid logic)
- ✅ Single responsibility per function
- ✅ Clear function signatures with descriptive names
- ✅ Comprehensive error handling

### Backward Compatibility
- ✅ Existing XYZ API completely unchanged
- ✅ Zero breaking changes
- ✅ processTilesConfig transparent routing
- ✅ All existing tests pass (if any)

### KISS Principles
- ✅ Simple defaults for common cases
- ✅ Progressive complexity only when needed
- ✅ Clear, readable code over clever abstractions
- ✅ Reuse existing utilities (tilegrid, crs)
- ✅ **TileMatrixSet derived from CRS** - one less parameter to configure

## Estimated Effort
- **Phase 1**: 30 minutes
- **Phase 2**: 3-4 hours
- **Phase 3**: 1 hour  
- **Phase 4**: 15 minutes
- **Total**: ~5-6 hours

## Success Criteria
1. WMTS services detected and processed correctly
2. GetCapabilities parsed and cached efficiently
3. Parameters validated against service metadata
4. **TileMatrixSet automatically matched from CRS parameter**
5. WMTS URLs generated with proper query parameters
6. TileMatrixSetLimits respected in tile range calculations
7. Smart defaults work for common WMTS services
8. Existing XYZ functionality unaffected
9. Clear error messages for configuration issues
10. Code follows existing project patterns and style
