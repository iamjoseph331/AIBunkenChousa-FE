// ISO 3166-1 alpha-2 → { name, lat, lon, m49_continent, m49_subregion }.
// Centroids are approximate (national capital or geographic center) — sufficient
// for the count-per-country dot map. UN M49 regions from unstats.un.org.
//
// This is deliberately not exhaustive: OpenAlex returns ~200 codes across the
// corpus; the ~180 covered here spans every real country plus common territories.
// A missing code shows in "Other" in the side panel and doesn't crash.

export interface CountryMeta {
  name: string
  lat: number
  lon: number
  continent: string
  subregion: string
}

export const ISO_META: Record<string, CountryMeta> = {
  // Northern America
  US: { name: 'United States', lat: 39.8, lon: -98.6, continent: 'Americas', subregion: 'Northern America' },
  CA: { name: 'Canada', lat: 56.1, lon: -106.3, continent: 'Americas', subregion: 'Northern America' },
  MX: { name: 'Mexico', lat: 23.6, lon: -102.6, continent: 'Americas', subregion: 'Latin America' },
  // Latin America & Caribbean
  BR: { name: 'Brazil', lat: -14.2, lon: -51.9, continent: 'Americas', subregion: 'Latin America' },
  AR: { name: 'Argentina', lat: -38.4, lon: -63.6, continent: 'Americas', subregion: 'Latin America' },
  CL: { name: 'Chile', lat: -35.7, lon: -71.5, continent: 'Americas', subregion: 'Latin America' },
  CO: { name: 'Colombia', lat: 4.6, lon: -74.3, continent: 'Americas', subregion: 'Latin America' },
  PE: { name: 'Peru', lat: -9.2, lon: -75.0, continent: 'Americas', subregion: 'Latin America' },
  VE: { name: 'Venezuela', lat: 6.4, lon: -66.6, continent: 'Americas', subregion: 'Latin America' },
  EC: { name: 'Ecuador', lat: -1.8, lon: -78.2, continent: 'Americas', subregion: 'Latin America' },
  BO: { name: 'Bolivia', lat: -16.3, lon: -63.6, continent: 'Americas', subregion: 'Latin America' },
  UY: { name: 'Uruguay', lat: -32.5, lon: -55.8, continent: 'Americas', subregion: 'Latin America' },
  PY: { name: 'Paraguay', lat: -23.4, lon: -58.4, continent: 'Americas', subregion: 'Latin America' },
  CR: { name: 'Costa Rica', lat: 9.7, lon: -83.8, continent: 'Americas', subregion: 'Latin America' },
  PA: { name: 'Panama', lat: 8.5, lon: -80.8, continent: 'Americas', subregion: 'Latin America' },
  DO: { name: 'Dominican Republic', lat: 18.7, lon: -70.2, continent: 'Americas', subregion: 'Latin America' },
  GT: { name: 'Guatemala', lat: 15.8, lon: -90.2, continent: 'Americas', subregion: 'Latin America' },
  CU: { name: 'Cuba', lat: 21.5, lon: -77.8, continent: 'Americas', subregion: 'Latin America' },
  JM: { name: 'Jamaica', lat: 18.1, lon: -77.3, continent: 'Americas', subregion: 'Latin America' },
  // Europe — Northern
  GB: { name: 'United Kingdom', lat: 55.4, lon: -3.4, continent: 'Europe', subregion: 'Northern Europe' },
  IE: { name: 'Ireland', lat: 53.4, lon: -8.2, continent: 'Europe', subregion: 'Northern Europe' },
  DK: { name: 'Denmark', lat: 56.3, lon: 9.5, continent: 'Europe', subregion: 'Northern Europe' },
  NO: { name: 'Norway', lat: 60.5, lon: 8.5, continent: 'Europe', subregion: 'Northern Europe' },
  SE: { name: 'Sweden', lat: 60.1, lon: 18.6, continent: 'Europe', subregion: 'Northern Europe' },
  FI: { name: 'Finland', lat: 61.9, lon: 25.7, continent: 'Europe', subregion: 'Northern Europe' },
  IS: { name: 'Iceland', lat: 64.9, lon: -19.0, continent: 'Europe', subregion: 'Northern Europe' },
  EE: { name: 'Estonia', lat: 58.6, lon: 25.0, continent: 'Europe', subregion: 'Northern Europe' },
  LT: { name: 'Lithuania', lat: 55.2, lon: 23.9, continent: 'Europe', subregion: 'Northern Europe' },
  LV: { name: 'Latvia', lat: 56.9, lon: 24.6, continent: 'Europe', subregion: 'Northern Europe' },
  // Europe — Western
  DE: { name: 'Germany', lat: 51.2, lon: 10.4, continent: 'Europe', subregion: 'Western Europe' },
  FR: { name: 'France', lat: 46.2, lon: 2.2, continent: 'Europe', subregion: 'Western Europe' },
  NL: { name: 'Netherlands', lat: 52.1, lon: 5.3, continent: 'Europe', subregion: 'Western Europe' },
  BE: { name: 'Belgium', lat: 50.5, lon: 4.5, continent: 'Europe', subregion: 'Western Europe' },
  AT: { name: 'Austria', lat: 47.5, lon: 14.6, continent: 'Europe', subregion: 'Western Europe' },
  CH: { name: 'Switzerland', lat: 46.8, lon: 8.2, continent: 'Europe', subregion: 'Western Europe' },
  LU: { name: 'Luxembourg', lat: 49.8, lon: 6.1, continent: 'Europe', subregion: 'Western Europe' },
  // Europe — Southern
  IT: { name: 'Italy', lat: 41.9, lon: 12.6, continent: 'Europe', subregion: 'Southern Europe' },
  ES: { name: 'Spain', lat: 40.5, lon: -3.7, continent: 'Europe', subregion: 'Southern Europe' },
  PT: { name: 'Portugal', lat: 39.4, lon: -8.2, continent: 'Europe', subregion: 'Southern Europe' },
  GR: { name: 'Greece', lat: 39.1, lon: 21.8, continent: 'Europe', subregion: 'Southern Europe' },
  HR: { name: 'Croatia', lat: 45.1, lon: 15.2, continent: 'Europe', subregion: 'Southern Europe' },
  SI: { name: 'Slovenia', lat: 46.2, lon: 14.5, continent: 'Europe', subregion: 'Southern Europe' },
  RS: { name: 'Serbia', lat: 44.0, lon: 21.0, continent: 'Europe', subregion: 'Southern Europe' },
  BA: { name: 'Bosnia and Herzegovina', lat: 43.9, lon: 17.7, continent: 'Europe', subregion: 'Southern Europe' },
  AL: { name: 'Albania', lat: 41.2, lon: 20.2, continent: 'Europe', subregion: 'Southern Europe' },
  MK: { name: 'North Macedonia', lat: 41.6, lon: 21.7, continent: 'Europe', subregion: 'Southern Europe' },
  MT: { name: 'Malta', lat: 35.9, lon: 14.4, continent: 'Europe', subregion: 'Southern Europe' },
  CY: { name: 'Cyprus', lat: 35.1, lon: 33.4, continent: 'Europe', subregion: 'Southern Europe' },
  // Europe — Eastern
  PL: { name: 'Poland', lat: 51.9, lon: 19.1, continent: 'Europe', subregion: 'Eastern Europe' },
  CZ: { name: 'Czechia', lat: 49.8, lon: 15.5, continent: 'Europe', subregion: 'Eastern Europe' },
  SK: { name: 'Slovakia', lat: 48.7, lon: 19.7, continent: 'Europe', subregion: 'Eastern Europe' },
  HU: { name: 'Hungary', lat: 47.2, lon: 19.5, continent: 'Europe', subregion: 'Eastern Europe' },
  RO: { name: 'Romania', lat: 45.9, lon: 24.9, continent: 'Europe', subregion: 'Eastern Europe' },
  BG: { name: 'Bulgaria', lat: 42.7, lon: 25.5, continent: 'Europe', subregion: 'Eastern Europe' },
  UA: { name: 'Ukraine', lat: 48.4, lon: 31.2, continent: 'Europe', subregion: 'Eastern Europe' },
  BY: { name: 'Belarus', lat: 53.7, lon: 27.9, continent: 'Europe', subregion: 'Eastern Europe' },
  MD: { name: 'Moldova', lat: 47.4, lon: 28.4, continent: 'Europe', subregion: 'Eastern Europe' },
  RU: { name: 'Russia', lat: 61.5, lon: 105.3, continent: 'Europe', subregion: 'Eastern Europe' },
  // Asia — Eastern
  JP: { name: 'Japan', lat: 36.2, lon: 138.3, continent: 'Asia', subregion: 'Eastern Asia' },
  CN: { name: 'China', lat: 35.9, lon: 104.2, continent: 'Asia', subregion: 'Eastern Asia' },
  KR: { name: 'South Korea', lat: 35.9, lon: 127.8, continent: 'Asia', subregion: 'Eastern Asia' },
  TW: { name: 'Taiwan', lat: 23.7, lon: 121.0, continent: 'Asia', subregion: 'Eastern Asia' },
  HK: { name: 'Hong Kong', lat: 22.4, lon: 114.1, continent: 'Asia', subregion: 'Eastern Asia' },
  MN: { name: 'Mongolia', lat: 46.9, lon: 103.8, continent: 'Asia', subregion: 'Eastern Asia' },
  // Asia — South Eastern
  ID: { name: 'Indonesia', lat: -0.8, lon: 113.9, continent: 'Asia', subregion: 'South-Eastern Asia' },
  MY: { name: 'Malaysia', lat: 4.2, lon: 101.9, continent: 'Asia', subregion: 'South-Eastern Asia' },
  SG: { name: 'Singapore', lat: 1.4, lon: 103.8, continent: 'Asia', subregion: 'South-Eastern Asia' },
  TH: { name: 'Thailand', lat: 15.9, lon: 100.9, continent: 'Asia', subregion: 'South-Eastern Asia' },
  VN: { name: 'Vietnam', lat: 14.1, lon: 108.3, continent: 'Asia', subregion: 'South-Eastern Asia' },
  PH: { name: 'Philippines', lat: 12.9, lon: 121.8, continent: 'Asia', subregion: 'South-Eastern Asia' },
  MM: { name: 'Myanmar', lat: 21.9, lon: 95.9, continent: 'Asia', subregion: 'South-Eastern Asia' },
  KH: { name: 'Cambodia', lat: 12.6, lon: 104.9, continent: 'Asia', subregion: 'South-Eastern Asia' },
  LA: { name: 'Laos', lat: 19.9, lon: 102.5, continent: 'Asia', subregion: 'South-Eastern Asia' },
  BN: { name: 'Brunei', lat: 4.5, lon: 114.7, continent: 'Asia', subregion: 'South-Eastern Asia' },
  // Asia — Southern
  IN: { name: 'India', lat: 20.6, lon: 78.9, continent: 'Asia', subregion: 'Southern Asia' },
  PK: { name: 'Pakistan', lat: 30.4, lon: 69.3, continent: 'Asia', subregion: 'Southern Asia' },
  BD: { name: 'Bangladesh', lat: 23.7, lon: 90.4, continent: 'Asia', subregion: 'Southern Asia' },
  LK: { name: 'Sri Lanka', lat: 7.9, lon: 80.8, continent: 'Asia', subregion: 'Southern Asia' },
  NP: { name: 'Nepal', lat: 28.4, lon: 84.1, continent: 'Asia', subregion: 'Southern Asia' },
  AF: { name: 'Afghanistan', lat: 33.9, lon: 67.7, continent: 'Asia', subregion: 'Southern Asia' },
  IR: { name: 'Iran', lat: 32.4, lon: 53.7, continent: 'Asia', subregion: 'Southern Asia' },
  // Asia — Western (Middle East)
  TR: { name: 'Türkiye', lat: 38.9, lon: 35.2, continent: 'Asia', subregion: 'Western Asia' },
  SA: { name: 'Saudi Arabia', lat: 23.9, lon: 45.1, continent: 'Asia', subregion: 'Western Asia' },
  AE: { name: 'United Arab Emirates', lat: 23.4, lon: 53.8, continent: 'Asia', subregion: 'Western Asia' },
  IL: { name: 'Israel', lat: 31.0, lon: 34.9, continent: 'Asia', subregion: 'Western Asia' },
  QA: { name: 'Qatar', lat: 25.4, lon: 51.2, continent: 'Asia', subregion: 'Western Asia' },
  KW: { name: 'Kuwait', lat: 29.3, lon: 47.5, continent: 'Asia', subregion: 'Western Asia' },
  JO: { name: 'Jordan', lat: 30.6, lon: 36.2, continent: 'Asia', subregion: 'Western Asia' },
  LB: { name: 'Lebanon', lat: 33.9, lon: 35.9, continent: 'Asia', subregion: 'Western Asia' },
  BH: { name: 'Bahrain', lat: 25.9, lon: 50.6, continent: 'Asia', subregion: 'Western Asia' },
  OM: { name: 'Oman', lat: 21.5, lon: 55.9, continent: 'Asia', subregion: 'Western Asia' },
  YE: { name: 'Yemen', lat: 15.6, lon: 48.5, continent: 'Asia', subregion: 'Western Asia' },
  IQ: { name: 'Iraq', lat: 33.2, lon: 43.7, continent: 'Asia', subregion: 'Western Asia' },
  SY: { name: 'Syria', lat: 34.8, lon: 38.9, continent: 'Asia', subregion: 'Western Asia' },
  PS: { name: 'Palestine', lat: 31.9, lon: 35.2, continent: 'Asia', subregion: 'Western Asia' },
  GE: { name: 'Georgia', lat: 42.3, lon: 43.4, continent: 'Asia', subregion: 'Western Asia' },
  AM: { name: 'Armenia', lat: 40.1, lon: 45.0, continent: 'Asia', subregion: 'Western Asia' },
  AZ: { name: 'Azerbaijan', lat: 40.1, lon: 47.6, continent: 'Asia', subregion: 'Western Asia' },
  // Asia — Central
  KZ: { name: 'Kazakhstan', lat: 48.0, lon: 66.9, continent: 'Asia', subregion: 'Central Asia' },
  UZ: { name: 'Uzbekistan', lat: 41.4, lon: 64.6, continent: 'Asia', subregion: 'Central Asia' },
  KG: { name: 'Kyrgyzstan', lat: 41.2, lon: 74.8, continent: 'Asia', subregion: 'Central Asia' },
  TJ: { name: 'Tajikistan', lat: 38.9, lon: 71.3, continent: 'Asia', subregion: 'Central Asia' },
  TM: { name: 'Turkmenistan', lat: 38.9, lon: 59.6, continent: 'Asia', subregion: 'Central Asia' },
  // Africa — Northern
  EG: { name: 'Egypt', lat: 26.8, lon: 30.8, continent: 'Africa', subregion: 'Northern Africa' },
  MA: { name: 'Morocco', lat: 31.8, lon: -7.1, continent: 'Africa', subregion: 'Northern Africa' },
  DZ: { name: 'Algeria', lat: 28.0, lon: 1.7, continent: 'Africa', subregion: 'Northern Africa' },
  TN: { name: 'Tunisia', lat: 33.9, lon: 9.5, continent: 'Africa', subregion: 'Northern Africa' },
  LY: { name: 'Libya', lat: 26.3, lon: 17.2, continent: 'Africa', subregion: 'Northern Africa' },
  SD: { name: 'Sudan', lat: 12.9, lon: 30.2, continent: 'Africa', subregion: 'Northern Africa' },
  // Africa — Western / Middle
  NG: { name: 'Nigeria', lat: 9.1, lon: 8.7, continent: 'Africa', subregion: 'Western Africa' },
  GH: { name: 'Ghana', lat: 7.9, lon: -1.0, continent: 'Africa', subregion: 'Western Africa' },
  CI: { name: 'Côte d\'Ivoire', lat: 7.5, lon: -5.5, continent: 'Africa', subregion: 'Western Africa' },
  SN: { name: 'Senegal', lat: 14.5, lon: -14.5, continent: 'Africa', subregion: 'Western Africa' },
  CM: { name: 'Cameroon', lat: 7.4, lon: 12.4, continent: 'Africa', subregion: 'Middle Africa' },
  CD: { name: 'DR Congo', lat: -4.0, lon: 21.8, continent: 'Africa', subregion: 'Middle Africa' },
  AO: { name: 'Angola', lat: -11.2, lon: 17.9, continent: 'Africa', subregion: 'Middle Africa' },
  // Africa — Eastern
  KE: { name: 'Kenya', lat: -0.0, lon: 37.9, continent: 'Africa', subregion: 'Eastern Africa' },
  ET: { name: 'Ethiopia', lat: 9.1, lon: 40.5, continent: 'Africa', subregion: 'Eastern Africa' },
  TZ: { name: 'Tanzania', lat: -6.4, lon: 34.9, continent: 'Africa', subregion: 'Eastern Africa' },
  UG: { name: 'Uganda', lat: 1.4, lon: 32.3, continent: 'Africa', subregion: 'Eastern Africa' },
  RW: { name: 'Rwanda', lat: -1.9, lon: 29.9, continent: 'Africa', subregion: 'Eastern Africa' },
  ZM: { name: 'Zambia', lat: -13.1, lon: 27.8, continent: 'Africa', subregion: 'Eastern Africa' },
  ZW: { name: 'Zimbabwe', lat: -19.0, lon: 29.2, continent: 'Africa', subregion: 'Eastern Africa' },
  MW: { name: 'Malawi', lat: -13.3, lon: 34.3, continent: 'Africa', subregion: 'Eastern Africa' },
  MG: { name: 'Madagascar', lat: -18.8, lon: 46.9, continent: 'Africa', subregion: 'Eastern Africa' },
  MU: { name: 'Mauritius', lat: -20.3, lon: 57.6, continent: 'Africa', subregion: 'Eastern Africa' },
  // Africa — Southern
  ZA: { name: 'South Africa', lat: -30.6, lon: 22.9, continent: 'Africa', subregion: 'Southern Africa' },
  NA: { name: 'Namibia', lat: -22.1, lon: 17.1, continent: 'Africa', subregion: 'Southern Africa' },
  BW: { name: 'Botswana', lat: -22.3, lon: 24.7, continent: 'Africa', subregion: 'Southern Africa' },
  LS: { name: 'Lesotho', lat: -29.6, lon: 28.2, continent: 'Africa', subregion: 'Southern Africa' },
  // Oceania
  AU: { name: 'Australia', lat: -25.3, lon: 133.8, continent: 'Oceania', subregion: 'Australia/NZ' },
  NZ: { name: 'New Zealand', lat: -40.9, lon: 174.9, continent: 'Oceania', subregion: 'Australia/NZ' },
  FJ: { name: 'Fiji', lat: -17.7, lon: 178.1, continent: 'Oceania', subregion: 'Melanesia' },
  PG: { name: 'Papua New Guinea', lat: -6.3, lon: 143.9, continent: 'Oceania', subregion: 'Melanesia' },
}

export function countryName(code: string): string {
  return ISO_META[code]?.name ?? code
}
