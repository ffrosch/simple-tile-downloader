# Simple Tile Downloader - Project Overview

## Purpose
A TypeScript library for downloading XYZ map tiles from tile services given a bounding box and target zoom levels. Built with OpenLayers for spatial calculations and optimized for parallel downloads.

## Tech Stack
- **Runtime**: Bun (v1.3.0+) - Fast all-in-one JavaScript runtime
- **Language**: TypeScript (^5.9.3)
- **Dependencies**: OpenLayers (^10.6.1) for spatial calculations
- **Module System**: ES modules
- **Build Tool**: Bun bundler + TypeScript compiler

## Project Metadata
- **Version**: 0.1.0-alpha
- **Author**: Florian Frosch
- **License**: ISC
- **Keywords**: xyz, tile, download, map, promise

## Core Functionality
1. **tilesConfig**: Calculate tile ranges for bounding box and zoom levels
2. **fetchTile**: Download single tile with validation
3. **fetchTiles**: Batch download with async generator and parallelism control

## Target Use Case
Browser-based tile downloading with:
- WGS84 bounding box input
- Configurable zoom level ranges
- Parallel download optimization
- Support for XYZ and TMS tile conventions
