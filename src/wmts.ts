import WMTSCapabilities from "ol/format/WMTSCapabilities.js";
import WMTS, { optionsFromCapabilities, type Options } from "ol/source/WMTS.js";
import { getTileUrls } from "./tiles";
import type { OptionsFromCapabilities, customWMTSOptions } from "./types";

const parser = new WMTSCapabilities();

export async function getOptions(
  capabilitiesUrl: string,
  config: OptionsFromCapabilities
): Promise<Options> {
  let text = await fetch(capabilitiesUrl).then((response) => response.text());

  // WORKAROUND: CDATA causes parsing error during testing (due to the DOM-replacement library `happy-dom`)
  text = text.replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1");

  // Parse XML into an object
  const result = parser.read(text);

  // WORKAROUND: empty list for TileMatrixSetLimits produces error -> set to undefined
  const layers = result["Contents"]["Layer"];
  const l = layers?.find(function (elt: any) {
    return elt["Identifier"] == config.layer;
  });
  l.TileMatrixSetLink.forEach((tmsl: any) => {
    if (tmsl.TileMatrixSetLimits && tmsl.TileMatrixSetLimits.length === 0) {
      tmsl.TileMatrixSetLimits = undefined;
    }
  });

  const options = optionsFromCapabilities(result, config);
  if (!options) throw new Error("optionsFromCapabilities failed");
  return options;
}

export function getWMTSUrls(options: customWMTSOptions) {
  return getTileUrls(new WMTS(options), options);
}
