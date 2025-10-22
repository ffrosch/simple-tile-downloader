# simple-tile-downloader

Download XYZ tiles from a service given a bounding box and the target zoom levels.

## Usage

```ts
import Tiles, { formatBytes } from 'simple-tile-downloader';

const tiles = await Tiles.create({
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c'],
    bbox: [13.3, 52.5, 13.4, 52.55], // Very small area in Berlin (WGS84)
    minZoom: 11,
    maxZoom: 13,
    crs: 'EPSG:3857', // Web Mercator (default for OSM)
});

let totalSize = 0;
let currentTile = 1;

console.log(`Starting download of ${tiles.totalCount} tiles...`);
for await (const tile of tiles.fetch()) {
    console.log(`Download of tile ${currentTile} from ${tile.url} finished (${formatBytes(tile.blob.size)})`);
    totalSize += tile.blob.size;
    currentTile++;
}
console.log(`Total downloaded size: ${formatBytes(totalSize)}`);
```

## Development

To install dependencies:

```bash
bun install
```

## Resources

- [OSM tile calculation formula](https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames)
- [OL proj files](https://github.com/openlayers/openlayers/tree/main/src/ol/proj)