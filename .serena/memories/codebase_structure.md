# Codebase Structure

## Directory Layout
```
simple-tile-downloader/
├── src/                    # Source code
│   ├── index.ts           # Main entry point & exports
│   ├── tiles.ts           # Core tile download logic
│   └── types.ts           # TypeScript type definitions
├── dist/                   # Build output (gitignored)
│   ├── index.js           # Bundled JavaScript
│   └── index.d.ts         # Type declarations
├── package.json           # Dependencies & scripts
├── tsconfig.json          # TypeScript compiler config
├── tsconfig.types.json    # Type declaration config
├── CLAUDE.md              # AI development guidelines
└── README.md              # Basic project info
```

## Core Files

### src/index.ts
- Main entry point
- Re-exports public API: `processTilesConfig`, `fetchTile`, `fetchTiles`

### src/types.ts
- TypeScript type definitions
- Interfaces: TileRange, Source, TilesConfig, FetchTilesConfig
- Type alias: Bbox (WGS84 coordinate array)

### src/tiles.ts
- Core implementation (3 exported functions):
  - `processTilesConfig(config)`: Calculate tile ranges
  - `fetchTile(url)`: Single tile download
  - `fetchTiles(config, options)`: Batch download generator

## Build Artifacts
- `dist/index.js`: Bundled browser-compatible JavaScript
- `dist/index.d.ts`: TypeScript type declarations
- Both generated via `bun run build`
