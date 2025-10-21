# Design Patterns and Guidelines

## Core Patterns

### 1. Async Generator Pattern (`fetchTiles`)
**Purpose**: Stream tiles progressively with controlled parallelism

**Implementation**:
- Uses `async function*` generator syntax
- Yields Blobs as they complete via `Promise.race()`
- Maintains Set of pending downloads for backpressure control
- Blocks when `maxParallelDownloads` limit reached

**Benefits**:
- Memory efficient (no buffering)
- Progressive processing (start before all downloads complete)
- Natural backpressure (consumer controls flow)

### 2. Configuration-First Design
**Pattern**: Separate configuration calculation from execution

**Implementation**:
```typescript
const config = processTilesConfig(config);  // Calculate
for await (const tile of fetchTiles(config)) { }  // Execute
```

**Benefits**:
- Validate inputs early (before downloads start)
- Inspect tile counts before committing to download
- Reusable configurations
- Clear separation of concerns

### 3. URL Template System
**Pattern**: String placeholder replacement for tile URLs

**Placeholders**:
- `{x}`, `{y}`, `{z}`: Standard XYZ coordinates
- `{-y}`: TMS inverted Y-axis support
- `{s}`: Subdomain rotation

**Implementation**:
- Simple string `.replace()` calls (no regex)
- Subdomain cycling via modulo indexing
- TMS calculation: `2^zoom - 1 - y`

### 4. Type-Driven Development
**Pattern**: TypeScript types guide API design

**Approach**:
- Public interfaces in separate `types.ts`
- Explicit return types on all exports
- Type narrowing for validation (bbox extent checks)
- Branded types where beneficial (Bbox type alias)

### 5. Dependency Injection (via OpenLayers)
**Pattern**: Leverage existing spatial libraries

**Usage**:
- `ol/extent` for bbox validation
- `ol/proj` for CRS transformations
- `ol/tilegrid` for tile coordinate calculations

**Benefits**:
- Don't reinvent spatial math
- Proven coordinate system handling
- Standard CRS support

## Error Handling Guidelines

### Validation Errors (throw immediately)
```typescript
if (!extent) {
  throw new Error(`Couldn't get the extent for ${crs}`);
}
```
- Configuration errors in `processTilesConfig()`
- Invalid CRS or bbox
- Missing required parameters

### Async Errors (Promise rejection)
```typescript
return Promise.reject(new Error("..."));
```
- HTTP fetch failures
- Non-image responses
- Individual tile download errors

### No Silent Failures
- All errors must be observable
- Use descriptive error messages
- Include context (URL, status, etc.)

## Code Organization Principles

### 1. Barrel Exports
- `index.ts` re-exports public API only
- Internal helpers stay private
- Clean import paths for consumers

### 2. Type Segregation
- All types in `types.ts`
- Implementation in `tiles.ts`
- Clear contract separation

### 3. Single Responsibility
- `processTilesConfig`: Configuration calculation only
- `fetchTile`: Single download only
- `fetchTiles`: Batch orchestration only

## Performance Considerations

### Parallelism
- Default: 6 concurrent (browser limit ~6-8 per domain)
- Subdomain rotation increases effective parallelism
- Configurable via options

### Memory
- Generator pattern prevents buffering
- Only `maxParallelDownloads` tiles in memory
- Blobs passed to consumer immediately

### Scalability
- Tiles grow exponentially with zoom (4x per level)
- Generator pattern handles arbitrary counts
- Consumer controls processing rate

## OpenLayers Integration

### Coordinate Systems
- Input: WGS84 (EPSG:4326) for bbox
- Processing: Arbitrary CRS via `config.crs`
- Transformation: `transformExtent()` for tile calculations

### Tile Grid
- Uses `createXYZ()` for standard tile grid
- `getTileRangeForExtentAndZ()` for coordinate ranges
- Handles CRS-specific extents automatically

## Future Pattern Recommendations

### Retry Logic
- Exponential backoff for failed tiles
- Configurable retry attempts
- Separate error categories (transient vs permanent)

### Progress Tracking
- Optional callback for progress events
- Tile count and bytes downloaded
- Estimated completion time

### Caching Layer
- Optional tile cache to avoid re-downloads
- Cache key: `${z}/${x}/${y}.${ext}`
- Storage adapter pattern (localStorage, IndexedDB, etc.)
