# simple-tile-downloader

Download XYZ tiles from a service given a bounding box and the target zoom levels.

## Usage

### XYZ Tiles

```ts
import { fetchTiles, formatBytes, makeXYZTileCollection } from 'simple-tile-downloader';

const tileCollection = makeXYZTileCollection(
  { url: 'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png', projection: 'EPSG:3857' },
  {
    minZoom: 11,
    maxZoom: 13,
    targetExtent: [13.3, 52.5, 13.4, 52.55], // Berlin area (WGS84)
    targetProjection: 'EPSG:4326'
  }
);

let totalSize = 0;
console.log(`Downloading ${tileCollection.totalCount} tiles...`);

for await (const tile of fetchTiles(tileCollection)) {
  console.log(`Downloaded ${tile.url} (${formatBytes(tile.blob.size)})`);
  totalSize += tile.blob.size;
}

console.log(`Total size: ${formatBytes(totalSize)}`);
```

### WMTS Tiles

```ts
import { fetchTiles, formatBytes, makeWMTSTileCollection } from 'simple-tile-downloader';

const tileCollection = await makeWMTSTileCollection(
  { layer: 'layerName', matrixSet: 'EPSG:3857' },
  {
    minZoom: 11,
    maxZoom: 13,
    targetExtent: [13.3, 52.5, 13.4, 52.55], // Berlin area (WGS84)
    targetProjection: 'EPSG:4326'
  },
  'https://example.com/wmts?SERVICE=WMTS&REQUEST=GetCapabilities'
);

for await (const tile of fetchTiles(tileCollection)) {
  console.log(`Downloaded ${tile.url} (${formatBytes(tile.blob.size)})`);
  // Process tile.blob (e.g., save to file, upload, etc.)
}
```

## Development

To install dependencies:

```bash
bun install
```

## Resources

- [OSM tile calculation formula](https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames)
- [OL proj files](https://github.com/openlayers/openlayers/tree/main/src/ol/proj)