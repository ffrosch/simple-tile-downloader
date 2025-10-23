# Simple Tile Downloader - Project Overview

## Purpose
A TypeScript library for downloading XYZ map tiles from tile services given a bounding box and target zoom levels. Optimized for parallel downloads with comprehensive CRS support via proj4.

## Tech Stack
- **Runtime**: Bun (v1.3.0+) - Fast all-in-one JavaScript runtime
- **Language**: TypeScript (^5.9.3)
- **Dependencies**: 
  - proj4 (^2.19.10) - CRS transformations
  - lodash.partial (^4.2.1) - Partial application utility
- **Dev Dependencies**: OpenLayers (^10.6.1) - Test validation only
- **Module System**: ES modules
- **Build Tool**: Bun bundler + TypeScript compiler

## Project Metadata
- **Version**: 0.3.0-alpha
- **Author**: Florian Frosch
- **License**: ISC
- **Keywords**: xyz, tile, download, map, promise

## Core Functionality
1. **processTilesConfig**: Calculate tile ranges for bounding box and zoom levels
2. **fetchTile**: Download single tile with validation
3. **fetchTiles**: Batch download with async generator and parallelism control
4. **getCRSExtent**: Fetch CRS definitions and extents from epsg.io with caching
5. **createXYZTileGrid**: Generate tile grid for any CRS projection
6. **formatBytes**: Utility for human-readable byte formatting

## Target Use Case
Browser-based tile downloading with:
- WGS84 bounding box input
- Configurable zoom level ranges
- Parallel download optimization (default: 6 concurrent)
- Support for XYZ and TMS tile conventions
- Any EPSG CRS support via epsg.io integration
- Subdomain cycling for load distribution

## Recent Changes
- **v0.3.0-alpha**: Removed OpenLayers dependency, implemented proj4 integration
- **Recent Commits**:
  - 17c7efd: chore: add AI memory
  - 8a8e40d: feat: remove OL dependency
  - 0c0af47: fix: add export formatBytes to index.ts
  - a265cd8: feat: add util/formatBytes

## Project Health
**Overall Score**: 89/100 ✅ Excellent (as of 2025-10-23)

**Strengths**:
- Strict TypeScript configuration with comprehensive type safety
- Clean architecture with clear separation of concerns
- Comprehensive test coverage for core functionality
- Minimal external dependencies (only 2 runtime deps)
- Modern ES module build with browser compatibility

**Known Areas for Improvement**:
- Documentation coverage: ~30% (target: 80%)
- Missing request timeouts for external API calls
- No rate limiting for epsg.io API
- Limited error recovery mechanisms

See `session_2025_10_23_comprehensive_analysis` and `priority_improvements_2025_10_23` memories for detailed analysis and improvement roadmap.

## Code Metrics
- **Lines of Code**: 577 (source only)
- **Source Files**: 6 (index, types, tiles, crs, tilegrid, utils)
- **Test Files**: 3 (crs.test, tilegrid.test, utils.test)
- **Test Coverage**: ~75%
- **Bundle Size**: ~30KB (estimated with dependencies)

## Architecture
```
src/
├── index.ts          # Public API exports (5 lines)
├── types.ts          # Type definitions (79 lines)
├── tiles.ts          # Core tile logic (158 lines)
├── crs.ts            # CRS handling & epsg.io (192 lines)
├── tilegrid.ts       # Tile grid calculations (129 lines)
└── utils.ts          # Utilities (20 lines)
```
