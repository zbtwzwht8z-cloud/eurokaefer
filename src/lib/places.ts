// Station → human place. Movacar names stations after the town the depot
// sits in ("Viladecans", "Champlan", "Goussainville"); travellers think in
// metros ("Barcelona", "Paris", "Paris CDG"). We show the metro and keep the
// town as a subtitle. Unknown stations fall back to Movacar's own
// `alternative_city` hint ("X (bei Y)" → Y) and a coarse country bbox.

import type { Coord } from './types';

type PlaceDef = [name: string, country: string];

// Keyed by Movacar's station `city`.
const STATIONS: Record<string, PlaceDef> = {
  // Germany
  'Aach': ['Konstanz', 'DE'], 'Aachen': ['Aachen', 'DE'], 'Achim bei Bremen': ['Bremen', 'DE'],
  'Augsburg': ['Augsburg', 'DE'], 'Berglern': ['Munich Airport', 'DE'], 'Berlin': ['Berlin', 'DE'],
  'Bielefeld': ['Bielefeld', 'DE'], 'Bochum': ['Bochum', 'DE'], 'Bonn': ['Bonn', 'DE'],
  'Braunschweig': ['Braunschweig', 'DE'], 'Bremen': ['Bremen', 'DE'], 'Brilon': ['Brilon', 'DE'],
  'Büdelsdorf': ['Rendsburg', 'DE'], 'Büren': ['Büren', 'DE'], 'Celle': ['Celle', 'DE'],
  'Dollern': ['Stade', 'DE'], 'Dormagen': ['Düsseldorf', 'DE'], 'Dortmund': ['Dortmund', 'DE'],
  'Dresden': ['Dresden', 'DE'], 'Duisburg': ['Duisburg', 'DE'], 'Düsseldorf': ['Düsseldorf', 'DE'],
  'Erfurt': ['Erfurt', 'DE'], 'Essen': ['Essen', 'DE'], 'Flensburg': ['Flensburg', 'DE'],
  'Frankfurt am Main': ['Frankfurt', 'DE'], 'Freilassing': ['Freilassing', 'DE'],
  'Gersthofen': ['Augsburg', 'DE'], 'Goslar': ['Goslar', 'DE'], 'Hamburg': ['Hamburg', 'DE'],
  'Hannover': ['Hanover', 'DE'], 'Hof': ['Hof', 'DE'], 'Ihringen': ['Freiburg', 'DE'],
  'Jena': ['Jena', 'DE'], 'Kassel': ['Kassel', 'DE'], 'Kastorf': ['Lübeck', 'DE'],
  'Kiel': ['Kiel', 'DE'], 'Köln': ['Cologne', 'DE'], 'Korntal-Münchingen': ['Stuttgart', 'DE'],
  'Laatzen': ['Hanover', 'DE'], 'Leer': ['Leer', 'DE'], 'Leipzig': ['Leipzig', 'DE'],
  'Lippstadt': ['Lippstadt', 'DE'], 'Mainz': ['Mainz', 'DE'], 'Mannheim': ['Mannheim', 'DE'],
  'Marburg': ['Marburg', 'DE'], 'München': ['Munich', 'DE'], 'Münster': ['Münster', 'DE'],
  'Neu-Ulm': ['Ulm', 'DE'], 'Nürnberg': ['Nuremberg', 'DE'], 'Oldenburg': ['Oldenburg', 'DE'],
  'Petersberg': ['Fulda', 'DE'], 'Regensburg': ['Regensburg', 'DE'], 'Soest': ['Soest', 'DE'],
  'Solingen': ['Solingen', 'DE'], 'Stuttgart': ['Stuttgart', 'DE'], 'Trier': ['Trier', 'DE'],
  'Wangen': ['Wangen im Allgäu', 'DE'], 'Weyhe': ['Bremen', 'DE'], 'Wolfsburg': ['Wolfsburg', 'DE'],
  // France
  'Bordeaux': ['Bordeaux', 'FR'], 'Cabriès': ['Marseille', 'FR'], 'Champlan': ['Paris', 'FR'],
  'Dagneux': ['Lyon', 'FR'], 'Gattières': ['Nice', 'FR'], 'Goussainville': ['Paris CDG', 'FR'],
  'Lille': ['Lille', 'FR'], 'Lyon': ['Lyon', 'FR'], 'Mérignac': ['Bordeaux', 'FR'],
  'Nantes': ['Nantes', 'FR'], 'Paris': ['Paris', 'FR'], 'Saint-Alban': ['Toulouse', 'FR'],
  'Saint-Jean-de-Gonville': ['Geneva (FR side)', 'FR'], 'Saint-Mesmes': ['Paris CDG', 'FR'],
  'Strasbourg': ['Strasbourg', 'FR'], 'Toulouse': ['Toulouse', 'FR'],
  // Italy
  'Bergamo': ['Bergamo', 'IT'], 'Bologna': ['Bologna', 'IT'], 'Castellanza': ['Milan', 'IT'],
  'Catania': ['Catania', 'IT'], 'Ferno': ['Milan Malpensa', 'IT'], 'Florence': ['Florence', 'IT'],
  'Milan': ['Milan', 'IT'], 'Napoli': ['Naples', 'IT'], 'Roma': ['Rome', 'IT'],
  'Turin': ['Turin', 'IT'], 'Venezia': ['Venice', 'IT'],
  // Spain / Portugal
  'Barcelona': ['Barcelona', 'ES'], 'Madrid': ['Madrid', 'ES'], 'Málaga': ['Málaga', 'ES'],
  'Sevilla': ['Seville', 'ES'], 'València': ['Valencia', 'ES'], 'Valencia': ['Valencia', 'ES'],
  'Viladecans': ['Barcelona', 'ES'], 'Zamudio': ['Bilbao', 'ES'],
  'Porto': ['Porto', 'PT'], 'Lisbon': ['Lisbon', 'PT'], 'Faro': ['Faro', 'PT'],
  // Alps
  'Graz': ['Graz', 'AT'], 'Hörsching': ['Linz', 'AT'], 'Innsbruck': ['Innsbruck', 'AT'],
  'Salzburg': ['Salzburg', 'AT'], 'Wien': ['Vienna', 'AT'], 'Wiener Neudorf': ['Vienna', 'AT'],
  'Wiesing': ['Innsbruck', 'AT'], 'Zürich': ['Zurich', 'CH'], 'Basel': ['Basel', 'CH'],
  // Benelux / North
  'Aartselaar': ['Antwerp', 'BE'], 'Antwerp': ['Antwerp', 'BE'], 'Brüssel': ['Brussels', 'BE'],
  'Sint-Pieters-Leeuw': ['Brussels', 'BE'], 'Amstelveen': ['Amsterdam', 'NL'],
  'Rotterdam': ['Rotterdam', 'NL'], 'Terschuur': ['Amersfoort', 'NL'],
  'Göteborgs Stad': ['Gothenburg', 'SE'], 'Stockholm': ['Stockholm', 'SE'],
  'Staffanstorps kommun': ['Malmö', 'SE'], 'Skedsmo': ['Oslo', 'NO'],
  'Split': ['Split', 'HR'], 'Zagreb': ['Zagreb', 'HR'], 'Warszawa': ['Warsaw', 'PL'],
};

export const COUNTRY_NAMES: Record<string, string> = {
  DE: 'Germany', FR: 'France', IT: 'Italy', ES: 'Spain', PT: 'Portugal', AT: 'Austria',
  CH: 'Switzerland', BE: 'Belgium', NL: 'Netherlands', LU: 'Luxembourg', SE: 'Sweden',
  NO: 'Norway', DK: 'Denmark', PL: 'Poland', CZ: 'Czechia', HR: 'Croatia', SI: 'Slovenia',
  GB: 'United Kingdom', IE: 'Ireland', HU: 'Hungary',
};

// Coarse fallback only — small countries first so they win border overlaps.
const BBOXES: Array<[string, number, number, number, number]> = [
  // code, minLat, maxLat, minLng, maxLng
  ['LU', 49.45, 50.18, 5.73, 6.53], ['CH', 45.82, 47.81, 5.96, 10.49],
  ['BE', 49.5, 51.5, 2.54, 6.4], ['NL', 50.75, 53.56, 3.36, 7.23],
  ['SI', 45.42, 46.88, 13.38, 16.61], ['AT', 46.37, 49.02, 9.53, 17.16],
  ['DK', 54.56, 57.75, 8.07, 12.69], ['CZ', 48.55, 51.06, 12.09, 18.86],
  ['PT', 36.96, 42.15, -9.5, -6.19], ['IE', 51.42, 55.39, -10.48, -5.99],
  ['HR', 42.39, 46.55, 13.49, 19.45], ['GB', 49.9, 58.7, -8.2, 1.77],
  ['DE', 47.27, 55.06, 5.87, 15.04], ['FR', 42.33, 51.09, -4.8, 8.23],
  ['IT', 36.62, 47.09, 6.63, 18.52], ['ES', 36.0, 43.79, -9.3, 3.32],
  ['PL', 49.0, 54.84, 14.12, 24.15], ['SE', 55.34, 69.06, 11.1, 24.17],
  ['NO', 57.96, 71.18, 4.65, 31.08], ['HU', 45.74, 48.59, 16.11, 22.9],
];

function countryByCoord([lat, lng]: Coord): string {
  for (const [code, a, b, c, d] of BBOXES) {
    if (lat >= a && lat <= b && lng >= c && lng <= d) return code;
  }
  return '';
}

export type Place = { name: string; town: string; country: string };

/** Resolve a Movacar station to a display place. */
export function resolvePlace(city: string, alternative: string | undefined, coord: Coord): Place {
  const def = STATIONS[city];
  if (def) return { name: def[0], town: city, country: def[1] };
  // "Aach (bei Konstanz)" → Konstanz; "Wien Süd" stays as-is.
  const bei = alternative?.match(/\((?:bei|near)\s+([^)]+)\)/i)?.[1]?.trim();
  return { name: bei || city, town: city, country: countryByCoord(coord) };
}

export function countryName(code: string): string {
  return COUNTRY_NAMES[code] ?? code;
}
