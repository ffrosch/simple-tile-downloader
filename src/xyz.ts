import { XYZ } from "ol/source";
import { getTileUrls } from "./tiles";
import type { customXYZOptions } from "./types";

export function getXYZUrls(options: customXYZOptions) {
  return getTileUrls(new XYZ(options), options);
}
