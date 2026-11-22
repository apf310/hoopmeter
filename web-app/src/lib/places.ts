// Conferencias, divisiones y países en español. La NBA los guarda en inglés ("Atlantic", "Spain"):
// la base de datos se queda tal cual y solo se traduce al enseñarlos. Puro y sin dependencias.

const CONFERENCES: Record<string, string> = { East: "Este", West: "Oeste" };

const DIVISIONS: Record<string, string> = {
  Atlantic: "Atlántico",
  Central: "Central",
  Southeast: "Sureste",
  Northwest: "Noroeste",
  Pacific: "Pacífico",
  Southwest: "Suroeste",
};

// Los que guarda la NBA (activos y leyendas), con variantes de la misma federación
const COUNTRIES: Record<string, string> = {
  Angola: "Angola",
  Argentina: "Argentina",
  Australia: "Australia",
  Austria: "Austria",
  Bahamas: "Bahamas",
  "The Bahamas": "Bahamas",
  Belgium: "Bélgica",
  Belize: "Belice",
  "Bosnia and Herzegovina": "Bosnia y Herzegovina",
  Brazil: "Brasil",
  Bulgaria: "Bulgaria",
  Cameroon: "Camerún",
  Canada: "Canadá",
  "Cape Verde": "Cabo Verde",
  China: "China",
  Colombia: "Colombia",
  Congo: "Congo",
  "Republic of the Congo": "Congo",
  DRC: "R. D. del Congo",
  "Democratic Republic of the Congo": "R. D. del Congo",
  Zaire: "R. D. del Congo",
  Croatia: "Croacia",
  Cuba: "Cuba",
  "Czech Republic": "República Checa",
  Czechia: "República Checa",
  Denmark: "Dinamarca",
  "Dominican Republic": "República Dominicana",
  Egypt: "Egipto",
  England: "Inglaterra",
  Estonia: "Estonia",
  Finland: "Finlandia",
  France: "Francia",
  Gabon: "Gabón",
  Georgia: "Georgia",
  Germany: "Alemania",
  "West Germany": "Alemania",
  Ghana: "Ghana",
  "Great Britain": "Reino Unido",
  Greece: "Grecia",
  Guinea: "Guinea",
  Haiti: "Haití",
  Hungary: "Hungría",
  Iceland: "Islandia",
  Iran: "Irán",
  Ireland: "Irlanda",
  Israel: "Israel",
  Italy: "Italia",
  Jamaica: "Jamaica",
  Japan: "Japón",
  Latvia: "Letonia",
  Lebanon: "Líbano",
  Lithuania: "Lituania",
  Mali: "Malí",
  Mexico: "México",
  Montenegro: "Montenegro",
  Netherlands: "Países Bajos",
  "New Zealand": "Nueva Zelanda",
  Nicaragua: "Nicaragua",
  Nigeria: "Nigeria",
  "North Macedonia": "Macedonia del Norte",
  Norway: "Noruega",
  Panama: "Panamá",
  Philippines: "Filipinas",
  Poland: "Polonia",
  Portugal: "Portugal",
  "Puerto Rico": "Puerto Rico",
  Romania: "Rumanía",
  Russia: "Rusia",
  "Saint Lucia": "Santa Lucía",
  "Saint Vincent and the Grenadines": "San Vicente y las Granadinas",
  Scotland: "Escocia",
  Senegal: "Senegal",
  Serbia: "Serbia",
  "Serbia and Montenegro": "Serbia y Montenegro",
  Slovakia: "Eslovaquia",
  Slovenia: "Eslovenia",
  "South Korea": "Corea del Sur",
  "South Sudan": "Sudán del Sur",
  "Soviet Union": "Unión Soviética",
  USSR: "Unión Soviética",
  Spain: "España",
  Sudan: "Sudán",
  Sweden: "Suecia",
  Switzerland: "Suiza",
  Taiwan: "Taiwán",
  Tanzania: "Tanzania",
  "Trinidad and Tobago": "Trinidad y Tobago",
  Turkey: "Turquía",
  Türkiye: "Turquía",
  USA: "EE. UU.",
  "United States": "EE. UU.",
  "US Virgin Islands": "Islas Vírgenes (EE. UU.)",
  "U.S. Virgin Islands": "Islas Vírgenes (EE. UU.)",
  Uganda: "Uganda",
  Ukraine: "Ucrania",
  "United Kingdom": "Reino Unido",
  Venezuela: "Venezuela",
  Yugoslavia: "Yugoslavia",
};

/** "East" → "Este". Lo que no reconoce sale tal cual. */
export function conferenceLabel(conference: string | null | undefined): string | null {
  return conference ? (CONFERENCES[conference] ?? conference) : null;
}

/** "Atlantic" → "Atlántico". */
export function divisionLabel(division: string | null | undefined): string | null {
  return division ? (DIVISIONS[division] ?? division) : null;
}

/** "Spain" → "España". Un país nuevo que no esté en la lista sale en inglés antes que vacío. */
export function countryLabel(country: string | null | undefined): string | null {
  return country ? (COUNTRIES[country.trim()] ?? country) : null;
}
