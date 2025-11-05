import type {
  FetchedTile,
  TileCollection
} from "./types";

export async function* fetchTiles(
  tileCollection: TileCollection,
  options: { maxParallelDownloads: number } = { maxParallelDownloads: 6 }
): AsyncGenerator<FetchedTile, void, unknown> {
  const pendingDownloads = new Set<Promise<FetchedTile>>();

  for (const unfetchedTile of tileCollection.tileLoaders) {
    const tile = unfetchedTile.load();
    pendingDownloads.add(tile);
    tile.finally(() => pendingDownloads.delete(tile));

    while (pendingDownloads.size >= options.maxParallelDownloads) {
      yield Promise.race(pendingDownloads);
    }
  }

  while (pendingDownloads.size > 0) {
    yield Promise.race(pendingDownloads);
  }
}

