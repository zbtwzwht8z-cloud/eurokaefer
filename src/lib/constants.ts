// Centralized constants: home cities, target regions, country flag map, ICE
// return times. These power the filter dropdowns and the card badges.

export type HomeCity = 'Bochum' | 'Hannover' | 'München' | 'Other';

export const HOME_CITIES: HomeCity[] = ['Bochum', 'Hannover', 'München', 'Other'];

// Cities that count as each home zone (used by Python pipeline + frontend filters)
export const HOME_CITY_SET: Record<HomeCity, Set<string>> = {
  Bochum: new Set([
    'Bochum', 'Essen', 'Dormagen', 'Bielefeld', 'Bonn', 'Duisburg',
    'Dortmund', 'Düsseldorf', 'Köln', 'Cologne', 'Münster', 'Aachen',
  ]),
  Hannover: new Set(['Hannover', 'Laatzen', 'Weyhe']),
  München: new Set(['München', 'Munich', 'Berglern / Munich Airport', 'Augsburg', 'Gersthofen']),
  Other: new Set(),
};

// Destination regions for the "To" dropdown
export type RegionKey =
  | 'all' | 'italy' | 'spain' | 'portugal' | 'austria' | 'switzerland'
  | 'alps' | 'south_france' | 'southern_germany' | 'northern_germany'
  | 'eastern_germany' | 'scandinavia';

export const REGIONS: Record<RegionKey, { label: string; cities: Set<string> }> = {
  all: { label: 'Anywhere', cities: new Set() },
  italy: {
    label: '🇮🇹 Italy',
    cities: new Set([
      'Milan', 'Milan / Castellanza', 'Bergamo', 'Bologna', 'Florence', 'Roma',
      'Turin', 'Venezia', 'Napoli', 'Genova', 'Palermo',
    ]),
  },
  spain: {
    label: '🇪🇸 Spain',
    cities: new Set([
      'Barcelona', 'Viladecans', 'Madrid', 'Sevilla', 'Bilbao', 'Zamudio',
      'A Coruña', 'Valencia',
    ]),
  },
  portugal: { label: '🇵🇹 Portugal', cities: new Set(['Porto', 'Lisbon']) },
  austria: {
    label: '🇦🇹 Austria',
    cities: new Set(['Wiener Neudorf', 'Wien', 'Vienna', 'Salzburg', 'Graz', 'Hörsching', 'Wiesing', 'Innsbruck']),
  },
  switzerland: { label: '🇨🇭 Switzerland', cities: new Set(['Zürich', 'Basel', 'Geneva', 'Bern']) },
  alps: {
    label: '🏔️ Alps',
    cities: new Set([
      'Salzburg', 'Innsbruck', 'Wiesing', 'Aach', 'Wangen', 'Konstanz', 'Friedrichshafen',
      'Saint-Jean-de-Gonville', 'Zürich', 'Bern',
    ]),
  },
  south_france: {
    label: '🌞 South France',
    cities: new Set([
      'Cabriès', 'Gattières', 'Saint-Laurent-du-Var', 'Saint-Jean-de-Gonville',
      'Dagneux', 'Marseille', 'Nice', 'Montpellier', 'Nîmes', 'Avignon',
      'Aix-en-Provence', 'Toulouse', 'Mérignac',
    ]),
  },
  southern_germany: {
    label: 'Southern Germany',
    cities: new Set([
      'München', 'Munich', 'Berglern / Munich Airport', 'Stuttgart', 'Nürnberg',
      'Augsburg', 'Gersthofen', 'Wangen', 'Aach', 'Ihringen',
      'Korntal-Münchingen', 'Ettlingenweier', 'Neu-Ulm', 'Würzburg', 'Regensburg',
      'Heidelberg', 'Karlsruhe', 'Sinsheim', 'Freiburg', 'Konstanz', 'Friedrichshafen',
    ]),
  },
  northern_germany: {
    label: 'Northern Germany',
    cities: new Set(['Hamburg', 'Hannover', 'Laatzen', 'Kiel', 'Flensburg', 'Bremen', 'Weyhe']),
  },
  eastern_germany: {
    label: 'Eastern Germany',
    cities: new Set(['Berlin', 'Dresden', 'Leipzig', 'Erfurt', 'Chemnitz', 'Bautzen']),
  },
  scandinavia: {
    label: '🇸🇪 Scandinavia',
    cities: new Set(['Göteborgs Stad', 'Staffanstorps kommun', 'Stockholm', 'Skedsmo', 'Blomsterdalen']),
  },
};

// Country flag map (used for card meta line)
export const COUNTRY_OF: Record<string, string> = {
  // Germany
  Bochum: 'Germany', Essen: 'Germany', Dormagen: 'Germany', Bielefeld: 'Germany',
  Bonn: 'Germany', Duisburg: 'Germany', Dortmund: 'Germany', Düsseldorf: 'Germany',
  Köln: 'Germany', Cologne: 'Germany', Münster: 'Germany', Aachen: 'Germany',
  Berlin: 'Germany', Hamburg: 'Germany', 'Frankfurt am Main': 'Germany',
  München: 'Germany', Munich: 'Germany', Stuttgart: 'Germany', Leipzig: 'Germany',
  Dresden: 'Germany', Erfurt: 'Germany', Mainz: 'Germany', Marburg: 'Germany',
  Kassel: 'Germany', Nürnberg: 'Germany', Regensburg: 'Germany', Trier: 'Germany',
  Kiel: 'Germany', Flensburg: 'Germany', Weyhe: 'Germany', Laatzen: 'Germany',
  Bautzen: 'Germany', Chemnitz: 'Germany', 'Korntal-Münchingen': 'Germany',
  Gersthofen: 'Germany', Wangen: 'Germany', Würzburg: 'Germany', Ihringen: 'Germany',
  Aach: 'Germany', Ettlingenweier: 'Germany', 'Neu-Ulm': 'Germany', Kastorf: 'Germany',
  Heidelberg: 'Germany', Karlsruhe: 'Germany', Sinsheim: 'Germany', Freiburg: 'Germany',
  Konstanz: 'Germany', Friedrichshafen: 'Germany', Hannover: 'Germany', Bremen: 'Germany',
  'Berglern / Munich Airport': 'Germany', Augsburg: 'Germany',
  // France
  Paris: 'France', 'Paris CDG': 'France', Champlan: 'France', Nantes: 'France',
  Mérignac: 'France', Lille: 'France', Strasbourg: 'France', Cabriès: 'France',
  Gattières: 'France', 'Saint-Laurent-du-Var': 'France', Dagneux: 'France',
  'Saint-Alban': 'France', 'Saint-Jean-de-Gonville': 'France', 'Saint-Mesmes': 'France',
  Goussainville: 'France', Grigny: 'France', Marseille: 'France', Nice: 'France',
  Montpellier: 'France', Nîmes: 'France', Avignon: 'France', 'Aix-en-Provence': 'France',
  Toulouse: 'France', Lyon: 'France', Bordeaux: 'France',
  // Italy
  Milan: 'Italy', 'Milan / Castellanza': 'Italy', Bergamo: 'Italy', Bologna: 'Italy',
  Florence: 'Italy', Roma: 'Italy', Turin: 'Italy', Venezia: 'Italy', Napoli: 'Italy',
  Genova: 'Italy', Palermo: 'Italy',
  // Spain
  Barcelona: 'Spain', Viladecans: 'Spain', Madrid: 'Spain', Sevilla: 'Spain',
  Bilbao: 'Spain', Zamudio: 'Spain', 'A Coruña': 'Spain', Valencia: 'Spain',
  // Sweden
  'Göteborgs Stad': 'Sweden', 'Staffanstorps kommun': 'Sweden', Stockholm: 'Sweden',
  // Belgium / NL
  'Sint-Pieters-Leeuw / Brussels': 'Belgium', Antwerp: 'Belgium',
  'Amsterdam / Amstelveen': 'Netherlands', Rotterdam: 'Netherlands',
  // Austria
  'Wiener Neudorf': 'Austria', Wien: 'Austria', Vienna: 'Austria', Salzburg: 'Austria',
  Graz: 'Austria', Hörsching: 'Austria', Wiesing: 'Austria', Innsbruck: 'Austria',
  // Other
  Skedsmo: 'Norway', Blomsterdalen: 'Norway', Porto: 'Portugal', Lisbon: 'Portugal',
  Split: 'Croatia', Dubrovnik: 'Croatia', Zürich: 'Switzerland', Basel: 'Switzerland',
  Geneva: 'Switzerland', Bern: 'Switzerland', London: 'UK',
};

export const COUNTRY_FLAG: Record<string, string> = {
  Germany: '🇩🇪', France: '🇫🇷', Italy: '🇮🇹', Spain: '🇪🇸', Sweden: '🇸🇪',
  Belgium: '🇧🇪', Netherlands: '🇳🇱', Austria: '🇦🇹', Norway: '🇳🇴',
  Portugal: '🇵🇹', Croatia: '🇭🇷', Switzerland: '🇨🇭', UK: '🇬🇧',
};

// ICE return time from German city → NRW or Munich (used for badge)
export const ICE_RETURN: Record<string, string> = {
  Berlin: '4h → Köln', Hamburg: '3.5h → Dortmund',
  München: '4.5h → Köln', Munich: '4.5h → Köln',
  'Frankfurt am Main': '1h → Köln',
  Stuttgart: '2.5h → Köln', Nürnberg: '3h → Köln',
  Leipzig: '3.5h → Köln', Dresden: '4h → Köln',
  Hannover: '2h → Dortmund', Mainz: '1.5h → Köln',
  Erfurt: '3h → Köln', Marburg: '1.5h → Köln',
  Kassel: '2h → Dortmund',
};

// Approximate lat/lng for mini-maps. Subset; expand as needed.
export const CITY_COORDS: Record<string, [number, number]> = {
  Bochum: [51.4818, 7.2197], Essen: [51.4556, 7.0116], Dormagen: [51.0931, 6.8417],
  Bielefeld: [52.0302, 8.5325], Bonn: [50.7374, 7.0982], Duisburg: [51.4344, 6.7623],
  Dortmund: [51.5136, 7.4653], Düsseldorf: [51.2277, 6.7735], Köln: [50.9375, 6.9603],
  Cologne: [50.9375, 6.9603], Münster: [51.9607, 7.6261], Aachen: [50.7753, 6.0839],
  Berlin: [52.52, 13.405], Hamburg: [53.5511, 9.9937],
  'Frankfurt am Main': [50.1109, 8.6821], München: [48.1351, 11.582],
  Munich: [48.1351, 11.582], Stuttgart: [48.7758, 9.1829], Leipzig: [51.3397, 12.3731],
  Dresden: [51.0504, 13.7373], Erfurt: [50.9848, 11.0299], Mainz: [49.9929, 8.2473],
  Marburg: [50.8021, 8.7666], Kassel: [51.3127, 9.4797], Nürnberg: [49.4521, 11.0767],
  Regensburg: [49.0134, 12.1016], Trier: [49.7596, 6.6441], Kiel: [54.3233, 10.1228],
  Flensburg: [54.7836, 9.4321], Weyhe: [52.9763, 8.8508], Laatzen: [52.3175, 9.7967],
  Augsburg: [48.3705, 10.8978], 'Berglern / Munich Airport': [48.3537, 11.7866],
  Heidelberg: [49.3988, 8.6724], Hannover: [52.3759, 9.732], Bremen: [53.0793, 8.8017],
  Würzburg: [49.7913, 9.9534], Wangen: [47.6886, 9.8351],
  // France
  Paris: [48.8566, 2.3522], Nantes: [47.2184, -1.5536], Champlan: [48.7197, 2.27],
  Mérignac: [44.8333, -0.6444], Lille: [50.6292, 3.0573],
  Strasbourg: [48.5734, 7.7521], Cabriès: [43.4444, 5.3691],
  'Saint-Jean-de-Gonville': [46.2575, 5.9722], Goussainville: [49.0286, 2.4628],
  Dagneux: [45.8328, 5.07], Marseille: [43.2965, 5.3698], Nice: [43.7102, 7.262],
  Lyon: [45.764, 4.8357], Bordeaux: [44.8378, -0.5792], Toulouse: [43.6047, 1.4442],
  // Italy
  Milan: [45.4642, 9.19], 'Milan / Castellanza': [45.6086, 8.8978],
  Bergamo: [45.6983, 9.6773], Bologna: [44.4949, 11.3426], Florence: [43.7696, 11.2558],
  Roma: [41.9028, 12.4964], Turin: [45.0703, 7.6869], Venezia: [45.4408, 12.3155],
  Napoli: [40.8518, 14.2681], Genova: [44.4056, 8.9463], Palermo: [38.1157, 13.3613],
  // Spain
  Barcelona: [41.3851, 2.1734], Viladecans: [41.3158, 2.0184], Madrid: [40.4168, -3.7038],
  Sevilla: [37.3886, -5.9823], Bilbao: [43.263, -2.935],
  'A Coruña': [43.3623, -8.4115], Valencia: [39.4699, -0.3763],
  // Austria
  'Wiener Neudorf': [48.077, 16.317], Wien: [48.2082, 16.3738], Vienna: [48.2082, 16.3738],
  Salzburg: [47.8095, 13.055], Graz: [47.0707, 15.4395], Innsbruck: [47.2692, 11.4041],
  // Sweden
  'Göteborgs Stad': [57.7089, 11.9746], 'Staffanstorps kommun': [55.6422, 13.21],
  Stockholm: [59.3293, 18.0686],
  // Other
  'Sint-Pieters-Leeuw / Brussels': [50.7833, 4.25], Antwerp: [51.2194, 4.4025],
  'Amsterdam / Amstelveen': [52.3676, 4.9041], Rotterdam: [51.9244, 4.4777],
  Porto: [41.1579, -8.6291], Lisbon: [38.7223, -9.1393],
  Zürich: [47.3769, 8.5417], Basel: [47.5596, 7.5886], Geneva: [46.2044, 6.1432], Bern: [46.948, 7.4474],
  Split: [43.5081, 16.4402], Dubrovnik: [42.6507, 18.0944], London: [51.5074, -0.1278],
};

export function regionContains(city: string, regionKey: RegionKey): boolean {
  if (regionKey === 'all') return true;
  return REGIONS[regionKey].cities.has(city);
}

export function countryOf(city: string): string {
  return COUNTRY_OF[city] ?? 'Europe';
}

export function flagOf(city: string): string {
  return COUNTRY_FLAG[countryOf(city)] ?? '🏳️';
}
