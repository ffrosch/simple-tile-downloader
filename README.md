# simple-tile-downloader

Download XYZ tiles from a service given a bounding box and the target zoom levels.

## Usage

```ts
import { tilesConfig, fetchTiles } from 'simple-tile-downloader';

const config = tilesConfig({
    sourceUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    sourceSubdomains: ['a', 'b', 'c'],
    bbox: [13.3, 52.5, 13.4, 52.55], // Very small area in Berlin
    minZoom: 11,
    maxZoom: 13,
    crs: 'EPSG:3857', // Web Mercator (default for OSM)
})

let totalSize = 0;
let currentTile = 1;

console.log(`Starting download of ${config.totalCount} tiles...`)
for await (const tile of fetchTiles(config)) {
    console.log(`Download of tile ${currentTile} from ${tile.url} finished (${tile.blob.size} Bytes)`;)
    totalSize += tile.blob.size;
    currentTile++;
}
console.log(`Total downloaded size: ${totalSize}`)
```

## Development

To install dependencies:

```bash
bun install
```
