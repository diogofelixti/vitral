/** "lat,lon" for a link to the forecast's own page, or null when the panel has no place yet. */
export function place(latitude, longitude) {
  const lat = Number(latitude), lon = Number(longitude)
  if (latitude == null || longitude == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return null
  return `${lat},${lon}`
}
