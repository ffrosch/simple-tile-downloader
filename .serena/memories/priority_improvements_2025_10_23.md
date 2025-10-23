# Priority Improvements Roadmap

Generated from comprehensive analysis on 2025-10-23.

## 🔴 High Priority (Immediate - Next 1-2 Days)

### 1. Add JSDoc Documentation
**Impact**: High | **Effort**: Medium (2-3 hours) | **Risk**: Low

**Target Files**:
- src/tiles.ts:12 - `processTilesConfig`
- src/tiles.ts:54 - `fetchTile`
- src/tiles.ts:79 - `fetchTiles`
- src/crs.ts:125 - `getCRSExtent`
- src/tilegrid.ts:94 - `createXYZTileGrid`

**Required Elements**:
- Purpose and behavior description
- Parameter descriptions with constraints
- Return value explanations
- Example usage code
- Error conditions documentation

**Example Template**:
```typescript
/**
 * Process tile configuration and calculate tile ranges for each zoom level
 * 
 * @param config - Tile service configuration with CRS, bbox, and zoom levels
 * @param config.crs - EPSG code (e.g., "EPSG:3857" or 3857)
 * @param config.bbox - WGS84 bounding box [minX, minY, maxX, maxY]
 * @param config.minZoom - Minimum zoom level (0-20)
 * @param config.maxZoom - Maximum zoom level (0-20)
 * @returns Promise resolving to fetch-ready config with tile ranges
 * @throws {Error} If bbox exceeds CRS extent or subdomains missing for {s} URL
 * 
 * @example
 * const config = await processTilesConfig({
 *   url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
 *   subdomains: ["a", "b", "c"],
 *   bbox: [13.3, 52.5, 13.4, 52.55],
 *   crs: "EPSG:3857",
 *   minZoom: 10,
 *   maxZoom: 14
 * });
 */
```

**Benefit**: Significantly improves developer experience and reduces integration friction.

### 2. Implement Request Timeouts
**Impact**: High | **Effort**: Low (1 hour) | **Risk**: Low

**Location**: src/crs.ts:53-56

**Current Code**:
```typescript
const [jsonResponse, proj4Response] = await Promise.all([
  fetch(`${baseUrl}/${numericCode}.json`),
  fetch(`${baseUrl}/${numericCode}.proj4`),
]);
```

**Improved Code**:
```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 10000);

try {
  const [jsonResponse, proj4Response] = await Promise.all([
    fetch(`${baseUrl}/${numericCode}.json`, { signal: controller.signal }),
    fetch(`${baseUrl}/${numericCode}.proj4`, { signal: controller.signal }),
  ]);
  clearTimeout(timeoutId);
} catch (error) {
  clearTimeout(timeoutId);
  if (error.name === 'AbortError') {
    throw new Error(`CRS fetch timeout after 10s for ${code}`);
  }
  throw error;
}
```

**Benefit**: Prevents hanging requests and improves error handling for slow/unresponsive APIs.

### 3. Add Error Handling Tests
**Impact**: High | **Effort**: Medium (1-2 hours) | **Risk**: Low

**Missing Test Scenarios**:
1. Network failures in `fetchTile`
2. Invalid EPSG codes
3. Malformed API responses from epsg.io
4. Timeout scenarios
5. Empty tile ranges
6. Invalid bounding boxes (exceeding CRS extent)
7. Subdomain edge cases (empty array, single element)

**Example Test**:
```typescript
describe("Error Handling", () => {
  test("handles network failures gracefully", async () => {
    const config = { 
      url: "http://invalid.example.com/{z}/{x}/{y}.png",
      bbox: [0, 0, 1, 1],
      crs: "EPSG:3857",
      minZoom: 0,
      maxZoom: 1
    };
    const unfetchedTile = { url: config.url, x: 0, y: 0, z: 0 };
    await expect(fetchTile(unfetchedTile)).rejects.toThrow();
  });

  test("rejects invalid EPSG codes", async () => {
    await expect(getCRSExtent("INVALID")).rejects.toThrow("Invalid EPSG code");
  });

  test("handles bbox exceeding CRS extent", async () => {
    const config = {
      url: "http://example.com/{z}/{x}/{y}.png",
      bbox: [-200, -100, 200, 100], // Exceeds EPSG:3857
      crs: "EPSG:3857",
      minZoom: 0,
      maxZoom: 1
    };
    await expect(processTilesConfig(config)).rejects.toThrow("exceeds the extent");
  });
});
```

**Benefit**: Increases confidence in error recovery and edge case handling.

## 🟡 Medium Priority (Next Sprint - 1 Week)

### 4. Implement Rate Limiting for External APIs
**Impact**: Medium | **Effort**: Medium (2-3 hours) | **Risk**: Low

**Location**: src/crs.ts

**Problem**: Rapid successive calls to `getCRSExtent` can trigger rate limiting from epsg.io.

**Solution**: Implement request queue with configurable rate limit

```typescript
class RateLimitedQueue {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private requestsPerSecond = 5;
  
  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.process();
    });
  }
  
  private async process() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;
    
    const task = this.queue.shift();
    if (task) {
      await task();
      await new Promise(r => setTimeout(r, 1000 / this.requestsPerSecond));
    }
    
    this.processing = false;
    this.process();
  }
}

const apiQueue = new RateLimitedQueue();
```

**Benefit**: Prevents service blocking and improves reliability for batch operations.

### 5. Add Retry Mechanism for Tile Downloads
**Impact**: Medium | **Effort**: Medium (2-3 hours) | **Risk**: Low

**Location**: src/tiles.ts:54-77

**Enhancement**:
```typescript
export async function fetchTile(
  unfetchedTile: UnfetchedTile,
  options: { maxRetries?: number; retryDelay?: number } = {}
): Promise<FetchedTile> {
  const { maxRetries = 3, retryDelay = 1000 } = options;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(unfetchedTile.url);
      if (response.ok) {
        const blob = await response.blob();
        if (!blob.type.startsWith("image/")) {
          throw new Error("Response is not an image");
        }
        return { ...unfetchedTile, blob };
      }
      throw new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      if (attempt === maxRetries) throw error;
      await new Promise(r => setTimeout(r, retryDelay * attempt)); // Exponential backoff
    }
  }
  throw new Error("Max retries exceeded");
}
```

**Benefit**: Improves download reliability for transient network issues.

### 6. Add Memory Usage Optimization
**Impact**: Medium | **Effort**: Low (1 hour) | **Risk**: Low

**Location**: src/tiles.ts:12-52

**Enhancement**:
```typescript
export async function processTilesConfig(config: TilesConfig): Promise<FetchTilesConfig> {
  // ... existing code ...
  
  const totalCount = tileRanges
    .map((range) => range.count)
    .reduce((prev, curr) => prev + curr);
  
  // Add warning for large tile sets
  if (totalCount > 100000) {
    console.warn(
      `Warning: Large tile count (${totalCount.toLocaleString()}). ` +
      `Consider reducing zoom range to avoid memory issues.`
    );
  }
  
  if (totalCount > 1000000) {
    throw new Error(
      `Tile count (${totalCount.toLocaleString()}) exceeds safe limit (1M). ` +
      `Reduce zoom range or bbox size.`
    );
  }
  
  return { ...config, totalCount, tileRanges };
}
```

**Benefit**: Prevents out-of-memory errors for large zoom ranges.

## 🟢 Low Priority (Future Enhancements)

### 7. Performance Benchmarks
**Impact**: Low | **Effort**: Medium (3-4 hours) | **Risk**: Low

**Tasks**:
- Measure download throughput for various tile counts
- Memory usage profiling for different zoom levels
- Compare performance with/without caching
- Benchmark different parallelism levels

### 8. Alternative CRS Sources
**Impact**: Low | **Effort**: Medium (2-3 hours) | **Risk**: Low

**Enhancement**: Make CRS source configurable with fallback
```typescript
interface CRSConfig {
  primarySource?: string;
  fallbackSources?: string[];
}

const defaultConfig: CRSConfig = {
  primarySource: "https://epsg.io",
  fallbackSources: ["https://spatialreference.org"]
};
```

### 9. Bundle Size Optimization
**Impact**: Low | **Effort**: Medium (2-3 hours) | **Risk**: Medium

**Tasks**:
- Monitor output bundle size
- Consider code splitting for CRS fetching
- Lazy load proj4 definitions
- Analyze tree-shaking opportunities

## Implementation Order

**Week 1** (High Priority):
1. Day 1-2: JSDoc Documentation
2. Day 3: Request Timeouts
3. Day 4-5: Error Handling Tests

**Week 2** (Medium Priority):
4. Day 1-2: Rate Limiting
5. Day 3-4: Retry Mechanism
6. Day 5: Memory Optimization

**Future** (Low Priority):
7-9: Performance benchmarks, alternative sources, bundle optimization

## Success Metrics
- Documentation coverage: 30% → 80%
- Test coverage: Current → +20% (error scenarios)
- Zero hanging requests (timeout protection)
- Improved download success rate (retry mechanism)
- Zero OOM errors for reasonable zoom ranges
