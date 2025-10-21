# Bug Fixes and Issues Resolved

## Bug #1: Subdomain Cycling Division by Zero

### Discovery
Found during test suite development when running tests without subdomains.

### Location
`src/tiles.ts:99-111` - `fetchTiles/generateTileURLs` function

### Symptoms
```
TypeError: undefined is not an object (evaluating 'subdomains[currentSubdomainIndex]')
```

### Root Cause
When `subdomains` is an empty array (`[]`):
1. Line 99: `(currentSubdomainIndex + 1) % subdomains?.length`
2. When `length = 0`, modulo operation: `1 % 0 = NaN`
3. Line 108: `subdomains[NaN]` returns `undefined`
4. Attempting to access `undefined` causes TypeError

### Original Code
```typescript
function* generateTileURLs() {
  let currentSubdomainIndex = 0;

  for (let i = 0; i < tileRanges.length; i++) {
    const { minX, maxX, minY, maxY, zoom } = tileRanges[i] as TileRange;
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        currentSubdomainIndex =
          (currentSubdomainIndex + 1) % subdomains?.length; // BUG: 1 % 0 = NaN

        let url = url
          .replace("{x}", x.toString())
          .replace("{y}", y.toString())
          .replace("{-y}", (Math.pow(2, zoom) - 1 - y).toString())
          .replace("{z}", zoom.toString())
          .replace("{s}", subdomains[currentSubdomainIndex] ?? ""); // BUG: [NaN] = undefined

        yield { url, x, y, z: zoom };
      }
    }
  }
}
```

### Fix Applied
```typescript
function* generateTileURLs() {
  let currentSubdomainIndex = 0;

  for (let i = 0; i < tileRanges.length; i++) {
    const { minX, maxX, minY, maxY, zoom } = tileRanges[i] as TileRange;
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        // Only cycle subdomains if array is not empty
        if (subdomains.length > 0) {
          currentSubdomainIndex =
            (currentSubdomainIndex + 1) % subdomains.length;
        }

        let url = url
          .replace("{x}", x.toString())
          .replace("{y}", y.toString())
          .replace("{-y}", (Math.pow(2, zoom) - 1 - y).toString())
          .replace("{z}", zoom.toString())
          .replace("{s}", subdomains[currentSubdomainIndex] ?? "");

        yield { url, x, y, z: zoom };
      }
    }
  }
}
```

### Validation
- Test without subdomains now passes
- Test with subdomains still works correctly
- No regression in other tests

### Prevention
- Add test case for empty subdomain array
- Add test case for undefined subdomains
- Consider adding runtime validation in processTilesConfig

## Issue #2: README Example Inconsistency (Documentation)

### Discovery
While creating tests based on README example, noticed API mismatch.

### Location
`README.md:23-24`

### Issue
README shows accessing `tile.url` and `tile.blob.size`, but doesn't show that `fetchTiles` actually returns `FetchedTile` objects with structure:
```typescript
{
  url: string;
  blob: Blob;
  x: number;
  y: number;
  z: number;
}
```

### Current README Example
```typescript
for await (const tile of fetchTiles(config)) {
    console.log(`Download of tile ${currentTile} from ${tile.url} finished (${tile.blob.size} Bytes)`;)
    totalSize += tile.blob.size;
    currentTile++;
}
```

### Recommendation
README is mostly correct, but should clarify that tiles have metadata:
```typescript
for await (const tile of fetchTiles(config)) {
    console.log(`Tile ${currentTile}: z=${tile.z} x=${tile.x} y=${tile.y} (${tile.blob.size} bytes)`);
    totalSize += tile.blob.size;
    currentTile++;
}
```

### Status
✏️ **Documentation issue** - README should be updated to show full `FetchedTile` structure

## Testing Gaps Identified

### Missing Test Cases
1. **Network Errors**: What happens when tile server returns 404/500?
2. **Non-Image Responses**: Tile server returns HTML error page
3. **Timeout Handling**: Slow/hanging tile requests
4. **Large Datasets**: Performance with thousands of tiles
5. **TMS Coordinate System**: Test `{-y}` placeholder specifically
6. **Subdomain Edge Cases**: 
   - Single subdomain
   - Many subdomains (>10)
   - Special characters in subdomains

### Recommended Additional Tests
```typescript
describe("error handling", () => {
  test("handles 404 tile responses");
  test("handles non-image responses");
  test("handles network timeouts");
});

describe("TMS support", () => {
  test("correctly inverts Y coordinate for TMS");
  test("calculates correct {-y} values across zoom levels");
});

describe("subdomain rotation", () => {
  test("distributes requests across subdomains evenly");
  test("handles single subdomain correctly");
});
```

## Performance Considerations

### Current Implementation
- No retry logic for failed tiles
- No rate limiting
- No caching
- Individual tile failures don't stop batch

### Potential Issues
1. **Memory**: All pending downloads held in Set
2. **Backpressure**: Consumer might not keep up
3. **Error Accumulation**: Failed tiles silently ignored

### Recommendations
1. Add optional error callback for failed tiles
2. Consider memory limits for very large downloads
3. Add progress tracking callback
4. Implement retry mechanism with exponential backoff

## Code Quality Observations

### Strengths
✅ Good error messages with context
✅ Type safety throughout
✅ Clean async generator pattern
✅ Proper CRS validation

### Areas for Improvement
⚠️ Consider adding input validation utilities
⚠️ Add JSDoc comments for public API
⚠️ Consider exposing more configuration options
⚠️ Add debug logging option
