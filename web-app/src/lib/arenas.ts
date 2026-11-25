// GENERADO con `npm run arenas` desde el calendario oficial de la NBA: no editar a mano.
// Pabellón de cada equipo y partidos de la temporada que se juegan en otro sitio (datos estructurados, Tarea 7.8).

export type Venue = { name: string; city: string; region?: string; country?: string };

export const ARENAS_SEASON = "2026-27";

export const ARENAS: Record<number, Venue> = {
  1610612737: { name: "State Farm Arena", city: "Atlanta", region: "GA", country: "US" },
  1610612738: { name: "TD Garden", city: "Boston", region: "MA", country: "US" },
  1610612739: { name: "Rocket Arena", city: "Cleveland", region: "OH", country: "US" },
  1610612740: { name: "Smoothie King Center", city: "New Orleans", region: "LA", country: "US" },
  1610612741: { name: "United Center", city: "Chicago", region: "IL", country: "US" },
  1610612742: { name: "American Airlines Center", city: "Dallas", region: "TX", country: "US" },
  1610612743: { name: "Ball Arena", city: "Denver", region: "CO", country: "US" },
  1610612744: { name: "Chase Center", city: "San Francisco", region: "CA", country: "US" },
  1610612745: { name: "Toyota Center", city: "Houston", region: "TX", country: "US" },
  1610612746: { name: "Intuit Dome", city: "Inglewood", region: "CA", country: "US" },
  1610612747: { name: "Crypto.com Arena", city: "Los Angeles", region: "CA", country: "US" },
  1610612748: { name: "Kaseya Center", city: "Miami", region: "FL", country: "US" },
  1610612749: { name: "Fiserv Forum", city: "Milwaukee", region: "WI", country: "US" },
  1610612750: { name: "Target Center", city: "Minneapolis", region: "MN", country: "US" },
  1610612751: { name: "Barclays Center", city: "Brooklyn", region: "NY", country: "US" },
  1610612752: { name: "Madison Square Garden", city: "New York", region: "NY", country: "US" },
  1610612753: { name: "Kia Center", city: "Orlando", region: "FL", country: "US" },
  1610612754: { name: "Gainbridge Fieldhouse", city: "Indianapolis", region: "IN", country: "US" },
  1610612755: { name: "Xfinity Mobile Arena", city: "Philadelphia", region: "PA", country: "US" },
  1610612756: { name: "Mortgage Matchup Center", city: "Phoenix", region: "AZ", country: "US" },
  1610612757: { name: "Moda Center", city: "Portland", region: "OR", country: "US" },
  1610612758: { name: "Golden 1 Center", city: "Sacramento", region: "CA", country: "US" },
  1610612759: { name: "Frost Bank Center", city: "San Antonio", region: "TX", country: "US" },
  1610612760: { name: "Paycom Center", city: "Oklahoma City", region: "OK", country: "US" },
  1610612761: { name: "Scotiabank Arena", city: "Toronto", region: "ON", country: "CA" },
  1610612762: { name: "Delta Center", city: "Salt Lake City", region: "UT", country: "US" },
  1610612763: { name: "FedExForum", city: "Memphis", region: "TN", country: "US" },
  1610612764: { name: "Capital One Arena", city: "Washington", region: "DC", country: "US" },
  1610612765: { name: "Little Caesars Arena", city: "Detroit", region: "MI", country: "US" },
  1610612766: { name: "Spectrum Center", city: "Charlotte", region: "NC", country: "US" },
};

/** Null: la NBA aún no ha dicho dónde (eliminatorias de la Copa sin equipos). */
export const OTHER_VENUES: Record<string, Venue | null> = {
  "0022600009": { name: "Moody Center", city: "Austin", region: "TX", country: "US" },
  "0022600075": { name: "Accor Arena", city: "Paris", country: "FR" },
  "0022600076": { name: "Co-op Live", city: "Manchester" },
  "0022600189": { name: "Arena CDMX", city: "Mexico City", country: "MX" },
  "0022600862": { name: "Moody Center", city: "Austin", region: "TX", country: "US" },
  "0022600872": { name: "Moody Center", city: "Austin", region: "TX", country: "US" },
  "0022601201": null,
  "0022601202": null,
  "0022601203": null,
  "0022601204": null,
  "0022601229": null,
  "0022601230": null,
  "0062600001": { name: "Hinkle Fieldhouse", city: "Indianapolis", region: "IN", country: "US" },
};
