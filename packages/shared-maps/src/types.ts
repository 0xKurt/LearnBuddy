// The shape of the generated map data (src/data/*.ts, scripts/build-maps.mjs). Issue #251.
//
// Coordinates are whole units of the area's drawing, `width` × `height` (2000 units wide):
// x = (lon − west) · kx · q, y = (north − lat) · q — an equirectangular projection whose
// meridians and parallels are straight lines, so the graticule can be read exactly.

/** Names in the app's five languages, where Natural Earth has them. */
export type MapNames = Partial<Record<'de' | 'en' | 'fr' | 'es' | 'it', string>>;

export type MapAreaFeature = {
  /** ISO 3166-1 alpha-3 for a country (`ITA`), ISO 3166-2 for a German Land (`DE-BY`). */
  id: string;
  names: MapNames;
  /** Further names from the data: the long and the formal name, a local name. */
  alt: string[];
  /** SVG path: absolute move, relative lines, closed rings. */
  d: string;
  /** The point deepest inside the largest part, and its distance to the edge (units). */
  anchor: [number, number];
  r: number;
  box: [number, number, number, number];
  /** Features of the same layer that share a border with this one (from the data). */
  neighbours: string[];
  /** The id of its capital in `cities`, when the data names exactly one. */
  capital: string | null;
};

export type MapRiver = {
  id: string;
  names: MapNames;
  alt: string[];
  /** SVG path of open lines. */
  d: string;
  box: [number, number, number, number];
};

export type MapCity = {
  id: string;
  names: MapNames;
  alt: string[];
  at: [number, number];
  /** Degrees, from the data (two decimals). */
  lat: number;
  lon: number;
  /** The country or Land it is the capital of. */
  of: string;
};

export type MapAreaData = {
  id: string;
  west: number;
  east: number;
  south: number;
  north: number;
  kx: number;
  q: number;
  width: number;
  height: number;
  /** Degrees between two graticule lines. */
  graticule: number;
  /** Land that is drawn but never asked about (neighbouring countries, unnamed territories). */
  context: string[];
  areas: MapAreaFeature[];
  rivers: MapRiver[];
  cities: MapCity[];
};
