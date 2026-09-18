/**
 * Fixed option lists.
 *
 * These are deliberately closed sets rather than free text. Free text can't
 * be matched on - "weeknights", "week nights" and "after work" would all be
 * different values, and the matching engine would find nothing in common.
 */

export const PLATFORMS = [
  "PC",
  "PlayStation 5",
  "Xbox Series X|S",
  "Nintendo Switch",
  "Steam Deck",
  "Mobile",
  "VR",
] as const;

export const AVAILABILITY = [
  "Weekday mornings",
  "Weekday afternoons",
  "Weeknights",
  "Weekend days",
  "Weekend nights",
  "Late night",
  "Randomly online",
] as const;

export const REGIONS = [
  "North America — East",
  "North America — Central",
  "North America — West",
  "South America",
  "UK & Ireland",
  "Europe — West",
  "Europe — East",
  "Asia — East",
  "Asia — Southeast",
  "Asia — South",
  "Oceania",
  "Middle East",
  "Africa",
] as const;

/** US states and territories, as two-letter codes, so locations stay uniform. */
export const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL",
  "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME",
  "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH",
  "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "PR",
  "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV",
  "WI", "WY",
] as const;

export type Platform = (typeof PLATFORMS)[number];
export type Availability = (typeof AVAILABILITY)[number];
export type Region = (typeof REGIONS)[number];
export type UsState = (typeof US_STATES)[number];

/**
 * Turns the three stored location columns into one line.
 *   Austin + TX          -> "Austin, TX"
 *   Manchester + UK      -> "Manchester, United Kingdom"
 *   nothing              -> null
 */
export function formatLocation(p: {
  location_city?: string | null;
  location_state?: string | null;
  location_country?: string | null;
}): string | null {
  const city = p.location_city?.trim();
  const state = p.location_state?.trim();
  const country = p.location_country?.trim();

  const tail = state || (country && country !== "USA" ? country : null);

  if (city && tail) return `${city}, ${tail}`;
  if (city) return city;
  if (tail) return tail;
  return null;
}
