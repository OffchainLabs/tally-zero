import type { TallyDataManifest } from "./types";

const MANIFEST_URL = "/tally-data/manifest.json";

let manifestPromise: Promise<TallyDataManifest> | null = null;

export function loadManifest(): Promise<TallyDataManifest> {
  manifestPromise ??= fetch(MANIFEST_URL, { cache: "force-cache" })
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load manifest: ${res.status}`);
      return res.json() as Promise<TallyDataManifest>;
    })
    .catch((err) => {
      manifestPromise = null;
      throw err;
    });
  return manifestPromise;
}
