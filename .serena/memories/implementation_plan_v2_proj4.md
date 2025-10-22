# Custom XYZ Tile Grid Implementation Plan v2 (with proj4)

## Executive Summary

Replace OpenLayers with **proj4 + custom tile grid math** for coordinate transformations and tile calculations. This provides professional CRS support while maintaining a minimal bundle footprint.

---

## Bundle Size Analysis

### Current State (with OpenLayers)
- **OpenLayers (tree-shaken)**: ~25KB minified
- **Your library**: ~2.1KB minified
- **Total consumer impact**: ~27KB

### Proposed State (with proj4)
- **proj4**: ~40KB gzipped (~123KB minified)
- **Custom tile grid**: ~2KB minified
- **Your library**: ~3KB minified
- **Total consumer impact**: ~45KB

### Size Comparison
| Component | Current (OL) | Proposed (proj4) | Delta |
|-----------|-------------|------------------|-------|
| Coordinate transforms | ~15KB | ~40KB | +25KB |
| Tile grid math | ~10KB | ~2KB | -8KB |
| **Total** | **~27KB** | **~45KB** | **+18KB** |

### Trade-off Analysis

**✅ Advantages of proj4:**
- **Universal CRS support**: Any EPSG code, custom projections
- **Datum transformations**: Proper handling of WGS84, NAD83, etc.
- **Battle-tested**: Industry standard, used everywhere
- **Future-proof**: No hardcoded CRS limits
- **Professional quality**: Matches GDAL/OGR accuracy
- **Smaller than OL**: 40KB vs full OpenLayers ~200KB

**⚠️ Trade-offs:**
- **+18KB bundle size** vs tree-shaken OpenLayers
- Still much smaller than full OpenLayers
- Acceptable for professional geospatial library

**Recommendation**: ✅ **Use proj4** - The flexibility and professional quality far outweigh the modest size increase.

---

## Architecture Overview

### Dependency Strategy

```typescript
// Old (OpenLayers)
import { containsExtent } from "ol/extent";
import { get as getProjection, transformExtent } from "ol/proj";
import { createXYZ } from "ol/tilegrid";

// New (proj4 + custom)
import proj4 from "proj4";
import { createXYZTileGrid, getTileRangeForExtent } from "./tilegrid";
import { transformExtent, getCRSExtent } from "./crs";
```

### Module Structure

```
src/
├── crs.ts           # CRS utilities using proj4
├── tilegrid.ts      # Custom XYZ tile grid math
├── tiles.ts         # Main logic (updated)
└── types.ts         # Type definitions
```

---

## Implementation Details

### Phase 1: CRS Module (`src/crs.ts`)

#### 1.1 proj4 Integration

```typescript
import proj4 from "proj4";

// Pre-register common projections
proj4.defs([
  [
    "EPSG:3857",
    "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs +type=crs"
  ],
  // EPSG:4326 (WGS84) is built-in
]);

export type Extent = [number, number, number, number];

/**
 * Get CRS extent from proj4 definition
 * Falls back to world extent for geographic CRS
 */
export function getCRSExtent(crs: string): Extent {
  try {
    const projection = proj4.defs(crs);

    if (!projection) {
      throw new Error(`CRS '${crs}' not defined in proj4`);
    }

    // Check if CRS has defined bounds
    if (projection.projName === 'longlat' || projection.projName === 'latlong') {
      // Geographic CRS: use world extent
      return [-180, -90, 180, 90];
    }

    // For projected CRS like EPSG:3857
    // Web Mercator has well-known bounds
    if (crs === 'EPSG:3857' || crs === 'EPSG:900913') {
      const maxExtent = 20037508.342789244;
      return [-maxExtent, -maxExtent, maxExtent, maxExtent];
    }

    // For other projected CRS, transform world extent
    const worldExtent: Extent = [-180, -85, 180, 85]; // Typical valid range
    return transformExtent(worldExtent, 'EPSG:4326', crs);
  } catch (error) {
    throw new Error(
      `Failed to get extent for CRS '${crs}': ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Transform extent between coordinate systems using proj4
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
    const bottomLeft = proj4(fromCRS, toCRS, [extent[0], extent[1]]);
    const bottomRight = proj4(fromCRS, toCRS, [extent[2], extent[1]]);
    const topLeft = proj4(fromCRS, toCRS, [extent[0], extent[3]]);
    const topRight = proj4(fromCRS, toCRS, [extent[2], extent[3]]);

    // Get bounding box of transformed corners
    const allX = [bottomLeft[0], bottomRight[0], topLeft[0], topRight[0]];
    const allY = [bottomLeft[1], bottomRight[1], topLeft[1], topRight[1]];

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
 * Throws error if validation fails
 */
export function validateBBox(bbox: Extent, crs: string): void {
  const crsExtent = getCRSExtent(crs);

  if (!containsExtent(crsExtent, bbox)) {
    throw new Error(
      `Bounding box [${bbox.join(', ')}] exceeds valid extent of ${crs} ` +
      `[${crsExtent.join(', ')}]`
    );
  }
}

/**
 * Register custom projection definition
 * Useful for non-standard CRS
 */
export function registerProjection(
  code: string,
  proj4String: string
): void {
  proj4.defs(code, proj4String);
}
```

**Key Benefits:**
- ✅ Supports **any** EPSG code via proj4
- ✅ Custom projections via `registerProjection()`
- ✅ Accurate datum transformations
- ✅ Handles rotated/skewed extents correctly

---

### Phase 2: Tile Grid Module (`src/tilegrid.ts`)

#### 2.1 Core Types

```typescript
export type Extent = [number, number, number, number];

export interface XYZTileGrid {
  extent: Extent;
  minZoom: number;
  maxZoom: number;
  tileSize: number;
  resolutions: number[];
  origin: [number, number];
}

export interface TileRange {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}
```

#### 2.2 Resolution Calculation

```typescript
/**
 * Calculate resolutions for XYZ tile grid
 * Standard XYZ uses zoom factor of 2 (each zoom level doubles resolution)
 */
function calculateResolutions(
  extent: Extent,
  maxZoom: number,
  tileSize: number = 256
): number[] {
  const width = extent[2] - extent[0];
  const height = extent[3] - extent[1];

  // At zoom 0, one tile should fit the extent
  // Resolution = map units per pixel
  const maxResolution = Math.max(width / tileSize, height / tileSize);

  // Standard XYZ: each zoom level has 2x resolution (half the units/pixel)
  const resolutions: number[] = new Array(maxZoom + 1);
  for (let z = 0; z <= maxZoom; z++) {
    resolutions[z] = maxResolution / Math.pow(2, z);
  }

  return resolutions;
}
```

**Math Explanation:**
- **Zoom 0**: 1 tile covers entire extent
  - Resolution = extent_width / 256 pixels
- **Zoom 1**: 4 tiles (2×2 grid)
  - Resolution = extent_width / (2 × 256) = previous_resolution / 2
- **Zoom N**: 4^N tiles
  - Resolution = initial_resolution / 2^N

#### 2.3 Tile Coordinate Calculation

```typescript
/**
 * Small epsilon for floating point comparison
 * Handles numerical precision issues
 */
const EPSILON = 1e-5;

/**
 * Calculate tile coordinate for map coordinate
 * 
 * XYZ coordinate system:
 * - Origin at top-left
 * - X increases to the right
 * - Y increases downward
 * 
 * @param x Map X coordinate
 * @param y Map Y coordinate  
 * @param origin Tile grid origin [x, y]
 * @param resolution Map units per pixel at this zoom
 * @param tileSize Tile size in pixels
 * @param reversePolicy For max extent: use ceil-1 instead of floor
 */
function getTileCoord(
  x: number,
  y: number,
  origin: [number, number],
  resolution: number,
  tileSize: number,
  reversePolicy: boolean
): { tileX: number; tileY: number } {
  // Distance from origin in map units
  const deltaX = x - origin[0];
  const deltaY = origin[1] - y; // Y increases downward in tile space

  // Convert to tile coordinates (fractional)
  let tileX = deltaX / (resolution * tileSize);
  let tileY = deltaY / (resolution * tileSize);

  // Round to integer tile coordinates
  if (reversePolicy) {
    // For max extent corner: ceil - 1
    // Ensures tiles on boundary belong to correct range
    tileX = Math.ceil(tileX - EPSILON) - 1;
    tileY = Math.ceil(tileY - EPSILON) - 1;
  } else {
    // For min extent corner: floor
    tileX = Math.floor(tileX + EPSILON);
    tileY = Math.floor(tileY + EPSILON);
  }

  return { tileX, tileY };
}
```

**Why Two Rounding Policies?**
- **Min corner (floor)**: Tile containing the bottom-left point
- **Max corner (ceil-1)**: Last tile touching the top-right boundary
- Without this, we'd miss or double-count boundary tiles

#### 2.4 Tile Range for Extent

```typescript
/**
 * Get all tiles covering an extent at a zoom level
 */
export function getTileRangeForExtent(
  tileGrid: XYZTileGrid,
  extent: Extent,
  z: number
): TileRange {
  const resolution = tileGrid.resolutions[z];

  if (resolution === undefined) {
    throw new Error(`No resolution defined for zoom level ${z}`);
  }

  // Min corner (bottom-left in geo coords, top-left in tile coords)
  const min = getTileCoord(
    extent[0], // minX
    extent[3], // maxY (top in tile coordinates)
    tileGrid.origin,
    resolution,
    tileGrid.tileSize,
    false // use floor
  );

  // Max corner (top-right in geo coords, bottom-right in tile coords)
  const max = getTileCoord(
    extent[2], // maxX
    extent[1], // minY (bottom in tile coordinates)
    tileGrid.origin,
    resolution,
    tileGrid.tileSize,
    true // use ceil-1
  );

  return {
    minX: min.tileX,
    maxX: max.tileX,
    minY: min.tileY,
    maxY: max.tileY,
  };
}
```

#### 2.5 Tile Grid Factory

```typescript
/**
 * Create XYZ tile grid for given extent and zoom range
 */
export function createXYZTileGrid(
  extent: Extent,
  minZoom: number,
  maxZoom: number,
  tileSize: number = 256
): XYZTileGrid {
  // XYZ tiles: origin is top-left corner
  const origin: [number, number] = [extent[0], extent[3]];

  const resolutions = calculateResolutions(extent, maxZoom, tileSize);

  return {
    extent,
    minZoom,
    maxZoom,
    tileSize,
    resolutions,
    origin,
  };
}
```

---

### Phase 3: Integration

#### 3.1 Update `src/tiles.ts`

```typescript
import proj4 from "proj4";
import { createXYZTileGrid, getTileRangeForExtent } from "./tilegrid";
import {
  getCRSExtent,
  transformExtent,
  validateBBox,
  registerProjection,
} from "./crs";
import type { TilesConfig, FetchTilesConfig, TileRange } from "./types";

// Re-export for user convenience
export { registerProjection };

export function processTilesConfig(config: TilesConfig): FetchTilesConfig {
  const { crs, bbox, url, subdomains, maxZoom, minZoom } = config;

  // Get CRS extent (uses proj4)
  const extent = getCRSExtent(crs);

  // Validate bbox against CRS extent
  validateBBox(bbox, crs);

  // Validate subdomains for {s} placeholder
  if (url.includes("{s}") && !subdomains) {
    throw new Error(`Missing subdomains argument for URL ${url}`);
  }

  // Create tile grid
  const tileGrid = createXYZTileGrid(extent, minZoom, maxZoom);

  // Transform bbox from WGS84 to target CRS (uses proj4)
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

## Advanced Features

### Custom Projections

Users can register custom CRS definitions:

```typescript
import { registerProjection, processTilesConfig } from 'simple-tile-downloader';

// Register custom Swiss projection
registerProjection(
  'EPSG:2056',
  '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs'
);

// Now use it
const config = processTilesConfig({
  url: 'https://tiles.example.com/{z}/{x}/{y}.png',
  bbox: [5.96, 45.82, 10.49, 47.81],
  minZoom: 8,
  maxZoom: 14,
  crs: 'EPSG:2056',
});
```

### Datum Transformations

proj4 handles datum transformations automatically:

```typescript
// NAD83 to WGS84 transformation handled correctly
const config = processTilesConfig({
  url: 'https://tiles.example.com/{z}/{x}/{y}.png',
  bbox: [-122.5, 37.7, -122.3, 37.9],
  minZoom: 10,
  maxZoom: 14,
  crs: 'EPSG:2227', // California State Plane (NAD83)
});
```

---

## Testing Strategy

### Unit Tests

```typescript
describe("proj4 integration", () => {
  test("transforms EPSG:4326 to EPSG:3857", () => {
    const extent = transformExtent(
      [13.3, 52.5, 13.4, 52.55],
      "EPSG:4326",
      "EPSG:3857"
    );

    // Verify transformation accuracy (±1 meter)
    expect(extent[0]).toBeCloseTo(1480184.7, 0);
    expect(extent[1]).toBeCloseTo(6887893.5, 0);
  });

  test("getCRSExtent for EPSG:3857", () => {
    const extent = getCRSExtent("EPSG:3857");
    const maxExtent = 20037508.342789244;

    expect(extent).toEqual([
      -maxExtent,
      -maxExtent,
      maxExtent,
      maxExtent,
    ]);
  });

  test("throws error for undefined CRS", () => {
    expect(() => {
      getCRSExtent("EPSG:99999");
    }).toThrow("not defined");
  });
});

describe("tile grid calculations", () => {
  test("matches OpenLayers output for EPSG:3857", () => {
    const config = processTilesConfig({
      url: "http://localhost:3857/{z}/{x}/{y}.png",
      bbox: [13.3, 52.5, 13.4, 52.55],
      minZoom: 11,
      maxZoom: 13,
      crs: "EPSG:3857",
    });

    // These values match OpenLayers
    expect(config.totalCount).toBe(15);
    expect(config.tileRanges[0].minX).toBe(1099);
    expect(config.tileRanges[0].maxX).toBe(1100);
  });

  test("calculates resolutions correctly", () => {
    const extent = getCRSExtent("EPSG:3857");
    const tileGrid = createXYZTileGrid(extent, 0, 2);

    // Zoom 0: entire extent in one 256px tile
    const zoom0Res = (extent[2] - extent[0]) / 256;
    expect(tileGrid.resolutions[0]).toBeCloseTo(zoom0Res, 1);

    // Zoom 1: half the resolution (2x tiles)
    expect(tileGrid.resolutions[1]).toBeCloseTo(zoom0Res / 2, 1);
  });
});
```

---

## Migration Checklist

### ✅ Phase 1: Implementation
- [x] Install proj4: `bun add proj4`
- [ ] Create `src/crs.ts` with proj4 integration
- [ ] Create `src/tilegrid.ts` with custom math
- [ ] Update `src/tiles.ts` to use new modules
- [ ] Add type definitions to `src/types.ts`

### ✅ Phase 2: Testing
- [ ] Unit tests for coordinate transformations
- [ ] Unit tests for tile grid calculations
- [ ] Verify existing integration tests still pass
- [ ] Test custom projection registration
- [ ] Validate tile counts match OpenLayers

### ✅ Phase 3: Cleanup
- [ ] Remove OpenLayers from package.json
- [ ] Remove OpenLayers imports
- [ ] Update README with proj4 usage
- [ ] Add registerProjection() examples
- [ ] Document supported CRS

### ✅ Phase 4: Validation
- [ ] Build succeeds
- [ ] All tests pass
- [ ] Bundle size check (~45KB expected)
- [ ] Manual testing with real tile servers

---

## Documentation Updates

### README.md

Add section on CRS support:

```markdown
## Coordinate Reference Systems

The library uses [proj4js](https://github.com/proj4js/proj4js) for coordinate transformations, supporting any EPSG code or custom projection.

### Common CRS
- **EPSG:3857** - Web Mercator (default for most web maps)
- **EPSG:4326** - WGS84 Geographic
- **EPSG:3395** - World Mercator

### Custom Projections

Register custom CRS definitions:

\`\`\`typescript
import { registerProjection } from 'simple-tile-downloader';

registerProjection(
  'EPSG:2056',
  '+proj=somerc +lat_0=46.95 +lon_0=7.44 ...'
);
\`\`\`

Find proj4 strings at [epsg.io](https://epsg.io/).
```

---

## Performance Considerations

### Bundle Size Impact

**Before (OpenLayers):**
- Tree-shaken OL modules: ~25KB minified
- Your library: ~2KB
- **Total**: ~27KB

**After (proj4):**
- proj4: ~40KB gzipped (~123KB minified)
- Custom tile grid: ~2KB minified
- Your library: ~3KB minified
- **Total**: ~45KB gzipped

**Analysis:**
- +18KB vs OpenLayers (acceptable for professional GIS library)
- Still much smaller than full OpenLayers (~200KB)
- Gains universal CRS support + datum transformations

### Runtime Performance

- **proj4 transformations**: ~0.1ms per coordinate pair (negligible)
- **Tile grid calculations**: Identical to OpenLayers (same math)
- **Memory**: Minimal overhead (projection definitions cached)

---

## Risk Assessment

### ✅ Low Risk
- proj4 is industry standard (used by Leaflet, OpenLayers internally)
- Battle-tested transformation algorithms
- Comprehensive test coverage possible
- Clear migration path

### ⚠️ Medium Risk
- Bundle size increases (+18KB) - but acceptable for use case
- proj4 floating point precision may differ slightly from OL
  - **Mitigation**: Use epsilon tolerance (±1 meter acceptable)

### ❌ High Risk
- None identified

---

## Success Criteria

1. ✅ All existing tests pass with new implementation
2. ✅ Tile counts match OpenLayers output (±0 tiles)
3. ✅ Coordinate transformations accurate (±1 meter)
4. ✅ Build completes successfully
5. ✅ Bundle size ≤50KB gzipped
6. ✅ Support for custom projections works
7. ✅ No OpenLayers dependency remaining

---

## Alternatives Considered

### ❌ Option 1: Hardcode CRS
**Rejected**: Too limiting, unprofessional for GIS library

### ❌ Option 2: Keep OpenLayers
**Rejected**: Overkill dependency for simple tile grid math

### ✅ Option 3: proj4 + Custom Grid (CHOSEN)
**Selected**: Best balance of flexibility, quality, and size

---

## Timeline Estimate

- **Phase 1** (CRS module): 2-3 hours
- **Phase 2** (Tile grid): 2-3 hours  
- **Phase 3** (Integration): 1-2 hours
- **Testing**: 2-3 hours
- **Documentation**: 1 hour

**Total**: 8-12 hours

---

## Next Steps

1. ✅ Install proj4
2. Implement `src/crs.ts`
3. Implement `src/tilegrid.ts`
4. Update `src/tiles.ts`
5. Update tests
6. Remove OpenLayers
7. Validate & document
