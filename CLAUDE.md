## Project

TypeScript library for downloading XYZ and WMTS map tiles. Uses Bun runtime. Build target: browser.

**Dependencies:** `ol` (OpenLayers for CRS/projections), `happy-dom` (DOM/XML parsing in tests)

## Commands

- `bun test` - Run tests (src/*.test.ts)
- `bun run build` - Build dist/index.js + types
- See Bun docs: `node_modules/bun-types/docs/`

## Structure

```
src/
├── xyz.ts      - getXYZUrls(options)
├── wmts.ts     - getOptions(capabilitiesUrl, config), getWMTSUrls(options)
├── tiles.ts    - Tiles class, processTilesConfig(), fetchTile(), fetchTiles(), getTileUrls()
├── utils.ts    - formatBytes()
├── types.ts    - TypeScript interfaces
└── *.test.ts   - Tests (bun:test, Bun.serve() mocks on port 3857/8081)

tests/fixtures/  - minimal-tile.png, wmts-capabilities.xml
docker/          - TileServer-GL (8082) + GeoServer (8083) for integration tests
```

## Key Functions

**tiles.ts:**
- `fetchTiles(tileCollection, options?)` - AsyncGenerator yielding FetchedTile with parallel download control (max 6)
- `makeTileCollectionFromSource(options)` - Creates TileCollection from OpenLayers source
- `makeTileLoader(urlFunction)` - Creates async loader from URL function
- `makeGeneratorFromTileLoader(loader)` - Creates generator from tile loader

**xyz.ts:**
- `makeXYZTileCollection(sourceOptions, tileCollectionOptions)` - Default export, sync function returning TileCollection for XYZ tiles
- Helpers: `makeTileUrlFunction()`, `makeTileLoaderFromTemplates()`, `makeTileLoaderFromUrlLike()`

**wmts.ts:**
- `makeWMTSTileCollection(sourceOptions, tileCollectionOptions, wmtsCapabilitiesUrl?)` - Default export, async function returning Promise&lt;TileCollection&gt;
- `optionsFromCapabilities(url, config)` - Fetches/parses WMTS GetCapabilities XML (includes CDATA/TileMatrixSetLimits workarounds)
- Helpers: `makeTileUrlFunctionFromUrlFunction()`, `makeTileLoaderFromUrlFunction()`

**types.ts:**
- `Extent` - Tuple [minX, minY, maxX, maxY]
- `TileRanges` - Array of {z, count, tileRange}
- `UnfetchedTile` - {x, y, z, load()}
- `FetchedTile` - {x, y, z, url, blob}
- `OptionsFromCapabilities` - WMTS config (layer, matrixSet, projection, etc.)
- `TileCollection` - {tileLoaders, tileRanges, totalCount, minZoom, maxZoom, projection, extent, url}
- `TileCollectionOptions` - {minZoom, maxZoom, targetExtent, targetProjection?}

**utils.ts:**
- `formatBytes(bytes, decimals)` - Human-readable byte formatting

## Testing

Tests use `Bun.serve()` for mock servers, `Bun.file()` for fixtures. WMTS tests mock `globalThis.fetch()`.
