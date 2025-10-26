import Tiles, { formatBytes } from "./src"

const tiles = await Tiles.create({
    url: 'http://localhost/ogc/?SERVICE=WMTS&REQUEST=GetTile',
    bbox: [13.3, 52.5, 13.4, 52.55], // Very small area in Berlin (WGS84)
    minZoom: 11,
    maxZoom: 13,
    crs: 'EPSG:3857', // Web Mercator (default for OSM)
    serviceType: "wmts",
    layer: "group",
    format: "image/jpeg",
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