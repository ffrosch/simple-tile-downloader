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

**xyz.ts:**
- `getXYZUrls(options)` - Generator for XYZ tile URLs

**wmts.ts:**
- `getOptions(capabilitiesUrl, config)` - Fetch & parse WMTS GetCapabilities XML
- `getWMTSUrls(options)` - Generator for WMTS tile URLs

**tiles.ts:**
- `class Tiles` - Main async tile downloader (static async create())
- `processTilesConfig(config)` - Process XYZ or WMTS config into FetchTilesConfig
- `fetchTile(unfetchedTile)` - Fetch single tile, return blob
- `fetchTiles(config, options)` - AsyncGenerator with parallel download control
- `getTileUrls(source, options)` - Generator for tile URLs from OpenLayers source

**utils.ts:**
- `formatBytes(bytes, decimals)` - Human-readable byte formatting

## Testing

Tests use `Bun.serve()` for mock servers, `Bun.file()` for fixtures. WMTS tests mock `globalThis.fetch()`.
