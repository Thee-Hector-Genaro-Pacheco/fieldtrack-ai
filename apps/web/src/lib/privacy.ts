export interface GeneralizedCoordinates {
  latitude: number;
  longitude: number;
}

/**
 * Rounds latitude and longitude to 2 decimal places (~1.1 km precision)
 * to provide a privacy-safe generalized location representation.
 */
export function getGeneralizedCoordinates(lat: number, lng: number): GeneralizedCoordinates {
  return {
    latitude: Math.round(lat * 100) / 100,
    longitude: Math.round(lng * 100) / 100,
  };
}

/**
 * Formats coordinates for privacy-safe display rounded to 2 decimal places.
 */
export function formatGeneralizedCoordinate(val: number | null | undefined, isLat: boolean): string {
  if (val === null || val === undefined) return 'N/A';
  const rounded = Math.round(val * 100) / 100;
  const absVal = Math.abs(rounded).toFixed(2);
  const direction = isLat ? (rounded >= 0 ? 'N' : 'S') : (rounded >= 0 ? 'E' : 'W');
  return `${absVal}° ${direction}`;
}

/**
 * Formats HDOP into accuracy rating label.
 */
export function getHdopAccuracyLabel(hdop: number | null | undefined, hasFix: boolean): string {
  if (!hasFix || hdop === null || hdop === undefined) return 'No Fix';
  if (hdop <= 1.0) return 'Excellent';
  if (hdop <= 2.0) return 'Good';
  if (hdop <= 5.0) return 'Moderate';
  return 'Low Confidence';
}

/**
 * Formats telemetry data age into user-friendly 'Updated X sec ago' string.
 */
export function formatUpdatedAge(dataAgeSeconds: number | null | undefined): string {
  if (dataAgeSeconds === null || dataAgeSeconds === undefined) return 'Updated just now';
  if (dataAgeSeconds < 1) return 'Updated < 1 sec ago';
  const sec = Math.floor(dataAgeSeconds);
  return `Updated ${sec} sec ago`;
}
