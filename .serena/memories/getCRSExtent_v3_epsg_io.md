# getCRSExtent Solution v3 - epsg.io Runtime Fetching

## Architecture Overview

**Strategy**: Fetch CRS definitions and extents from epsg.io API at runtime with intelligent caching

### Key Benefits
- ✅ **Zero bundle size** for CRS database
- ✅ **Always up-to-date** - uses official EPSG registry data
- ✅ **Automatic proj4 registration** - no manual setup
- ✅ **Universal support** - any EPSG code works
- ✅ **Fast after first fetch** - in-memory caching

---

## epsg.io API Structure

### Endpoints

```bash
# Get full CRS definition with bbox (in WGS84)
https://epsg.io/<code>.json

# Get proj4 string directly
https://epsg.io/<code>.proj4
```

### Response Format

**JSON Response** (`/3857.json`):
```json
{
  "name": "WGS 84 / Pseudo-Mercator",
  "area": "World between 85.06°S and 85.06°N.",
  "bbox": {
    "south_latitude": -85.06,
    "west_longitude": -180,
    "north_latitude": 85.06,
    "east_longitude": 180
  },
  "scope": "Web mapping and visualisation.",
  "id": {
    "authority": "EPSG",
    "code": 3857
  }
}
```

**proj4 Response** (`/3857.proj4`):
```
+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs +type=crs
```

**Important**: bbox is in WGS84 coordinates (lat/lon), needs transformation to target CRS

---

## Implementation

### Core CRS Module (`src/crs.ts`)

```typescript
import proj4 from "proj4";

export type Extent = [number, number, number, number]; // [minX, minY, maxX, maxY]

interface EPSGInfo {
  bbox: {
    south_latitude: number;
    west_longitude: number;
    north_latitude: number;
    east_longitude: number;
  };
  name: string;
  area: string;
}

/**
 * In-memory cache for fetched CRS data
 * Avoids repeated network calls
 */
const crsCache = new Map<string, {
  proj4String: string;
  bboxWGS84: Extent;
  extent: Extent;
  name: string;
}>();

/**
 * Normalize EPSG code format
 * Handles: "EPSG:3857", "epsg:3857", "3857", 3857
 */
function normalizeEPSGCode(code: string | number): string {
  const codeStr = String(code);
  const match = codeStr.match(/^(?:EPSG:)?(\d+)$/i);
  
  if (!match) {
    throw new Error(`Invalid EPSG code format: ${code}`);
  }
  
  return `EPSG:${match[1]}`;
}

/**
 * Extract numeric EPSG code from full identifier
 */
function getNumericCode(code: string): string {
  const normalized = normalizeEPSGCode(code);
  return normalized.split(':')[1] || normalized;
}

/**
 * Fetch CRS definition and bbox from epsg.io
 * Returns both proj4 string and WGS84 bbox
 */
async function fetchCRSFromEPSG(code: string): Promise<{
  proj4String: string;
  bboxWGS84: Extent;
  name: string;
  area: string;
}> {
  const numericCode = getNumericCode(code);
  const baseUrl = 'https://epsg.io';

  try {
    // Fetch both endpoints in parallel for speed
    const [jsonResponse, proj4Response] = await Promise.all([
      fetch(`${baseUrl}/${numericCode}.json`),
      fetch(`${baseUrl}/${numericCode}.proj4`),
    ]);

    if (!jsonResponse.ok) {
      throw new Error(
        `EPSG code ${code} not found (HTTP ${jsonResponse.status})`
      );
    }

    if (!proj4Response.ok) {
      throw new Error(
        `proj4 definition for ${code} not found (HTTP ${proj4Response.status})`
      );
    }

    const epsgInfo: EPSGInfo = await jsonResponse.json();
    const proj4String = (await proj4Response.text()).trim();

    // Convert bbox from epsg.io format to Extent
    // epsg.io returns WGS84 coordinates (lat/lon)
    const bbox = epsgInfo.bbox;
    const bboxWGS84: Extent = [
      bbox.west_longitude,
      bbox.south_latitude,
      bbox.east_longitude,
      bbox.north_latitude,
    ];

    return {
      proj4String,
      bboxWGS84,
      name: epsgInfo.name,
      area: epsgInfo.area,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to fetch CRS ${code} from epsg.io: ${error.message}`
      );
    }
    throw error;
  }
}

/**
 * Get or fetch CRS extent
 * Automatically fetches from epsg.io and caches result
 * 
 * @param crs - EPSG code (e.g., "EPSG:3857", "3857", 3857)
 * @returns Extent in the CRS's native units
 */
export async function getCRSExtent(crs: string | number): Promise<Extent> {
  const normalized = normalizeEPSGCode(crs);

  // Check cache first
  if (crsCache.has(normalized)) {
    return crsCache.get(normalized)!.extent;
  }

  // Fetch from epsg.io
  const { proj4String, bboxWGS84, name, area } = await fetchCRSFromEPSG(normalized);

  // Register with proj4 if not already registered
  if (!proj4.defs(normalized)) {
    proj4.defs(normalized, proj4String);
  }

  // Transform bbox from WGS84 to target CRS
  const extent = transformExtent(bboxWGS84, 'EPSG:4326', normalized);

  // Cache for future use
  crsCache.set(normalized, {
    proj4String,
    bboxWGS84,
    extent,
    name,
  });

  return extent;
}

/**
 * Transform extent between coordinate systems
 * Samples all 4 corners to handle rotation/skew correctly
 */
export function transformExtent(
  extent: Extent,
  fromCRS: string,
  toCRS: string
): Extent {
  if (fromCRS === toCRS) {
    return extent;
  }

  try {
    // Transform all 4 corners to handle rotation/skew
    const corners = [
      proj4(fromCRS, toCRS, [extent[0], extent[1]]), // bottom-left
      proj4(fromCRS, toCRS, [extent[2], extent[1]]), // bottom-right  
      proj4(fromCRS, toCRS, [extent[0], extent[3]]), // top-left
      proj4(fromCRS, toCRS, [extent[2], extent[3]]), // top-right
    ];

    // Get bounding box of transformed corners
    const allX = corners.map(c => c[0]);
    const allY = corners.map(c => c[1]);

    return [
      Math.min(...allX),
      Math.min(...allY),
      Math.max(...allX),
      Math.max(...allY),
    ];
  } catch (error) {
    throw new Error(
      `Failed to transform extent from ${fromCRS} to ${toCRS}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Pre-register common CRS to avoid runtime fetches
 * Call during app initialization for better UX
 */
export async function preloadCommonCRS(): Promise<void> {
  const commonCodes = ['3857', '4326', '3395', '27700', '2056'];
  
  await Promise.all(
    commonCodes.map(code => getCRSExtent(code).catch(() => {
      // Ignore errors for optional preload
      console.warn(`Failed to preload EPSG:${code}`);
    }))
  );
}

/**
 * Check if extent2 is fully contained within extent1
 */
export function containsExtent(extent1: Extent, extent2: Extent): boolean {
  return (
    extent2[0] >= extent1[0] && // minX
    extent2[1] >= extent1[1] && // minY
    extent2[2] <= extent1[2] && // maxX
    extent2[3] <= extent1[3]    // maxY
  );
}

/**
 * Validate bbox is within CRS valid extent
 */
export async function validateBBox(
  bbox: Extent,
  crs: string | number
): Promise<void> {
  const crsExtent = await getCRSExtent(crs);

  if (!containsExtent(crsExtent, bbox)) {
    const normalized = normalizeEPSGCode(crs);
    throw new Error(
      `Bounding box [${bbox.join(', ')}] exceeds valid extent of ${normalized} ` +
      `[${crsExtent.join(', ')}]`
    );
  }
}

/**
 * Clear CRS cache (useful for testing or memory management)
 */
export function clearCRSCache(): void {
  crsCache.clear();
}

/**
 * Get cached CRS info (for debugging)
 */
export function getCRSInfo(crs: string | number): {
  proj4String: string;
  bboxWGS84: Extent;
  extent: Extent;
  name: string;
} | undefined {
  const normalized = normalizeEPSGCode(crs);
  return crsCache.get(normalized);
}
```

---

## Usage in processTilesConfig

### Updated `src/tiles.ts`

```typescript
import { getCRSExtent, transformExtent, validateBBox } from "./crs";
import { createXYZTileGrid, getTileRangeForExtent } from "./tilegrid";
import type { TilesConfig, FetchTilesConfig, TileRange } from "./types";

/**
 * Process tiles configuration
 * Now fully async to support CRS fetching
 */
export async function processTilesConfig(
  config: TilesConfig
): Promise<FetchTilesConfig> {
  const { crs, bbox, url, subdomains, maxZoom, minZoom } = config;

  // Fetch CRS extent from epsg.io (cached after first call)
  const extent = await getCRSExtent(crs);

  // Validate bbox against CRS extent
  await validateBBox(bbox, crs);

  // Validate subdomains for {s} placeholder
  if (url.includes("{s}") && !subdomains) {
    throw new Error(`Missing subdomains argument for URL ${url}`);
  }

  // Create tile grid
  const tileGrid = createXYZTileGrid(extent, minZoom, maxZoom);

  // Transform bbox from WGS84 to target CRS
  const transformedBBox = transformExtent(bbox, "EPSG:4326", crs);

  // Calculate tile ranges for each zoom level
  const tileRanges: TileRange[] = [];
  for (let zoom = minZoom; zoom <= maxZoom; zoom++) {
    const range = getTileRangeForExtent(tileGrid, transformedBBox, zoom);
    const count = (range.maxX - range.minX + 1) * (range.maxY - range.minY + 1);

    tileRanges.push({
      zoom,
      minX: range.minX,
      maxX: range.maxX,
      minY: range.minY,
      maxY: range.maxY,
      count,
    });
  }

  const totalCount = tileRanges
    .map((range) => range.count)
    .reduce((sum, count) => sum + count);

  return {
    ...config,
    totalCount,
    tileRanges,
  };
}
```

---

## Usage Examples

### Basic Usage (Auto-fetch)

```typescript
import { processTilesConfig, fetchTiles } from 'simple-tile-downloader';

// First call fetches from epsg.io (takes ~200ms)
const config = await processTilesConfig({
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  bbox: [13.3, 52.5, 13.4, 52.55], // Berlin (WGS84)
  minZoom: 11,
  maxZoom: 13,
  crs: 'EPSG:3857', // or just '3857' or 3857
});

// Subsequent calls use cache (instant)
const config2 = await processTilesConfig({
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  bbox: [13.4, 52.55, 13.5, 52.6],
  minZoom: 11,
  maxZoom: 13,
  crs: 3857, // cached, instant
});
```

### Preload for Better UX

```typescript
import { preloadCommonCRS, processTilesConfig } from 'simple-tile-downloader';

// During app initialization
await preloadCommonCRS(); // Preloads: 3857, 4326, 3395, 27700, 2056

// Later - no wait, uses cache
const config = await processTilesConfig({
  url: 'https://tiles.example.com/{z}/{x}/{y}.png',
  bbox: [13.3, 52.5, 13.4, 52.55],
  minZoom: 10,
  maxZoom: 14,
  crs: 'EPSG:3857', // cached from preload
});
```

### Any EPSG Code Works

```typescript
// Swiss coordinate system - auto-fetched
const config = await processTilesConfig({
  url: 'https://tiles.example.ch/{z}/{x}/{y}.png',
  bbox: [7.5, 46.0, 8.0, 46.5], // Swiss area (WGS84)
  minZoom: 8,
  maxZoom: 14,
  crs: 'EPSG:2056', // Swiss LV95 - automatically fetched & registered
});

// British National Grid - auto-fetched  
const config2 = await processTilesConfig({
  url: 'https://tiles.example.uk/{z}/{x}/{y}.png',
  bbox: [-2.0, 51.0, -1.5, 51.5], // UK area (WGS84)
  minZoom: 10,
  maxZoom: 16,
  crs: 'EPSG:27700', // British National Grid - auto-fetched
});
```

---

## Performance Characteristics

### Network Performance

**First Call (Cold)**:
- Fetch JSON + proj4: ~150-300ms (parallel requests)
- Transform + cache: ~1ms
- **Total**: ~200ms (one-time cost)

**Subsequent Calls (Cached)**:
- Cache lookup: <0.1ms
- **Total**: <1ms (instant)

### Caching Strategy

```typescript
// In-memory cache structure
crsCache = Map {
  'EPSG:3857' => {
    proj4String: '+proj=merc ...',
    bboxWGS84: [-180, -85.06, 180, 85.06],
    extent: [-20037508.34, -20037508.34, 20037508.34, 20037508.34],
    name: 'WGS 84 / Pseudo-Mercator'
  },
  'EPSG:4326' => { ... },
  // ... etc
}
```

**Cache Persistence**:
- In-memory only (cleared on page reload)
- Consider localStorage for cross-session persistence:

```typescript
// Optional: Persist cache to localStorage
function saveCacheToStorage() {
  const data = Array.from(crsCache.entries());
  localStorage.setItem('crs-cache', JSON.stringify(data));
}

function loadCacheFromStorage() {
  const data = localStorage.getItem('crs-cache');
  if (data) {
    const entries = JSON.parse(data);
    entries.forEach(([key, value]) => crsCache.set(key, value));
  }
}
```

---

## Error Handling

### Network Errors

```typescript
try {
  const extent = await getCRSExtent('EPSG:3857');
} catch (error) {
  // Handle:
  // - Network offline
  // - epsg.io down
  // - Invalid EPSG code
  // - CORS issues (shouldn't happen, epsg.io has CORS enabled)
  console.error('Failed to fetch CRS:', error);
  
  // Fallback strategy or show user error
}
```

### Invalid EPSG Codes

```typescript
try {
  const extent = await getCRSExtent('EPSG:99999');
} catch (error) {
  // "EPSG code EPSG:99999 not found (HTTP 404)"
}
```

### Transformation Errors

```typescript
try {
  const transformed = transformExtent(
    [13.3, 52.5, 13.4, 52.55],
    'EPSG:4326',
    'EPSG:3857'
  );
} catch (error) {
  // Projection not registered or transformation failed
}
```

---

## Testing Strategy

### Unit Tests

```typescript
describe('getCRSExtent with epsg.io', () => {
  beforeEach(() => {
    clearCRSCache();
  });

  test('fetches and caches EPSG:3857', async () => {
    const extent = await getCRSExtent('EPSG:3857');
    
    // Verify extent accuracy (Web Mercator bounds)
    expect(extent[0]).toBeCloseTo(-20037508.34, 1);
    expect(extent[3]).toBeCloseTo(20037508.34, 1);
    
    // Verify caching
    const info = getCRSInfo('EPSG:3857');
    expect(info).toBeDefined();
    expect(info?.name).toContain('Mercator');
  });

  test('handles different EPSG code formats', async () => {
    const extent1 = await getCRSExtent('EPSG:3857');
    const extent2 = await getCRSExtent('3857');
    const extent3 = await getCRSExtent(3857);
    
    expect(extent1).toEqual(extent2);
    expect(extent2).toEqual(extent3);
  });

  test('caches fetched CRS', async () => {
    const start1 = Date.now();
    await getCRSExtent('EPSG:3857');
    const time1 = Date.now() - start1;
    
    const start2 = Date.now();
    await getCRSExtent('EPSG:3857');
    const time2 = Date.now() - start2;
    
    // Second call should be much faster (cached)
    expect(time2).toBeLessThan(time1 / 10);
  });

  test('throws error for invalid EPSG code', async () => {
    await expect(getCRSExtent('EPSG:99999')).rejects.toThrow('not found');
  });

  test('preloadCommonCRS loads multiple CRS', async () => {
    await preloadCommonCRS();
    
    // All common CRS should be cached
    expect(getCRSInfo('EPSG:3857')).toBeDefined();
    expect(getCRSInfo('EPSG:4326')).toBeDefined();
  });
});
```

### Integration Tests

```typescript
describe('processTilesConfig with epsg.io', () => {
  test('fetches CRS and calculates tiles', async () => {
    const config = await processTilesConfig({
      url: 'http://localhost:3857/{z}/{x}/{y}.png',
      bbox: [13.3, 52.5, 13.4, 52.55],
      minZoom: 11,
      maxZoom: 13,
      crs: 'EPSG:3857',
    });

    expect(config.totalCount).toBe(15);
    expect(config.tileRanges).toHaveLength(3);
  });

  test('works with any valid EPSG code', async () => {
    // Swiss LV95
    const config = await processTilesConfig({
      url: 'http://localhost/{z}/{x}/{y}.png',
      bbox: [7.5, 46.0, 8.0, 46.5],
      minZoom: 10,
      maxZoom: 12,
      crs: 2056, // Numeric code
    });

    expect(config.totalCount).toBeGreaterThan(0);
  });
});
```

---

## API Breaking Change

### Old (Synchronous)

```typescript
const config = tilesConfig({
  // ...
  crs: 'EPSG:3857',
});
```

### New (Async)

```typescript
const config = await processTilesConfig({
  // ...
  crs: 'EPSG:3857',
});
```

**Migration Guide**:
```typescript
// Before
function setupMap() {
  const config = tilesConfig({ ... });
  startDownload(config);
}

// After
async function setupMap() {
  const config = await processTilesConfig({ ... });
  startDownload(config);
}
```

---

## Documentation Updates

### README.md

````markdown
## Coordinate Reference Systems

The library automatically fetches CRS definitions from [epsg.io](https://epsg.io/), supporting **any EPSG code**.

### Usage

```typescript
import { processTilesConfig } from 'simple-tile-downloader';

// Works with any EPSG code - auto-fetched from epsg.io
const config = await processTilesConfig({
  url: 'https://tiles.example.com/{z}/{x}/{y}.png',
  bbox: [7.5, 46.0, 8.0, 46.5], // WGS84 coordinates
  minZoom: 10,
  maxZoom: 14,
  crs: 'EPSG:2056', // Swiss LV95 - automatically fetched
});
```

### Supported CRS

**Any EPSG code** - Definitions are fetched from epsg.io automatically:
- EPSG:3857 (Web Mercator)
- EPSG:4326 (WGS84)
- EPSG:27700 (British National Grid)
- EPSG:2056 (Swiss LV95)
- EPSG:32633 (UTM Zone 33N)
- ... and 6000+ more

### Performance

**First use**: ~200ms to fetch from epsg.io
**Subsequent uses**: <1ms (cached)

**Preload for instant usage**:
```typescript
import { preloadCommonCRS } from 'simple-tile-downloader';

// During app initialization
await preloadCommonCRS();

// Later - instant (cached)
const config = await processTilesConfig({ ... });
```

### Offline Usage

Cache CRS definitions for offline use:
```typescript
// Save after first fetch
localStorage.setItem('my-crs', JSON.stringify(getCRSInfo('EPSG:3857')));

// Restore on next session
// (implement custom cache restoration logic)
```
````

---

## Trade-offs Analysis

### ✅ Advantages

1. **Zero bundle size** - No CRS database in bundle
2. **Always current** - Uses official EPSG registry
3. **Universal support** - 6000+ EPSG codes work
4. **Auto-registration** - proj4 setup automatic
5. **Smart caching** - Fast after first fetch
6. **No maintenance** - epsg.io maintains data

### ⚠️ Considerations

1. **Async API** - Breaking change from sync
2. **Network dependency** - First use requires internet
3. **~200ms first fetch** - Noticeable but acceptable
4. **epsg.io availability** - Dependent on external service

### 🎯 Mitigation Strategies

**For offline usage**:
- Preload common CRS during app init
- Implement localStorage persistence
- Provide fallback extents for critical CRS

**For performance**:
- Call `preloadCommonCRS()` early
- Show loading state during first fetch
- Cache persists for session

---

## Comparison to Alternatives

| Approach | Bundle | Network | Maintenance | EPSG Support |
|----------|--------|---------|-------------|--------------|
| Hardcode | 0.1KB | None | High | 3-5 codes |
| epsg-index | 7.8MB | None | Medium | All codes |
| **epsg.io (this)** | **0KB** | **First use only** | **None** | **All codes** |

---

## Verdict

✅ **Excellent solution** - Best balance of all requirements:
- Professional (supports all EPSG codes)
- Efficient (zero bundle, smart caching)
- Maintainable (epsg.io handles updates)
- User-friendly (automatic setup)

The async API is justified by the benefits, and performance is excellent after initial fetch.
