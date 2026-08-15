import type { GeocodeResult, WeatherInfo } from '../types';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

/** Haversine great-circle distance in kilometers */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function mphToKmh(mph: number): number {
  return mph * 1.60934;
}

export function calculateStampCost(distanceKm: number): number {
  return Math.max(1, Math.ceil(distanceKm / 70));
}

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  try {
    const params = new URLSearchParams({
      q: address,
      format: 'json',
      limit: '1',
      addressdetails: '0',
    });
    const res = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: {
        'Accept-Language': 'en',
        'User-Agent': 'TapTapAndAway/1.0 (prototype)',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const item = data[0];
    return {
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
      display_name: item.display_name,
    };
  } catch (err) {
    console.error('Geocode error:', err);
    return null;
  }
}

export async function getWeatherForRoute(
  originLat: number,
  originLon: number,
  destLat: number,
  destLon: number
): Promise<WeatherInfo> {
  const midLat = (originLat + destLat) / 2;
  const midLon = (originLon + destLon) / 2;

  try {
    const params = new URLSearchParams({
      latitude: String(midLat),
      longitude: String(midLon),
      current: 'weather_code',
      timezone: 'auto',
    });
    const res = await fetch(`${OPEN_METEO_URL}?${params}`);
    if (!res.ok) throw new Error('Weather API error');
    const data = await res.json();
    const code = data?.current?.weather_code ?? 0;
    return mapWeatherCode(code);
  } catch (err) {
    console.warn('Weather fetch failed, using clear:', err);
    return { condition: 'clear', multiplier: 1.0, description: 'Clear' };
  }
}

function mapWeatherCode(code: number): WeatherInfo {
  if (code === 0) return { condition: 'clear', multiplier: 1.0, description: 'Clear' };
  if (code <= 3) return { condition: 'cloudy', multiplier: 0.95, description: 'Cloudy' };
  if (code <= 48) return { condition: 'cloudy', multiplier: 0.95, description: 'Foggy / Cloudy' };
  if (code <= 57) return { condition: 'rain', multiplier: 0.8, description: 'Light rain' };
  if (code <= 67) return { condition: 'rain', multiplier: 0.8, description: 'Rain' };
  if (code <= 77) return { condition: 'heavy_rain', multiplier: 0.65, description: 'Heavy rain / Snow' };
  if (code <= 82) return { condition: 'heavy_rain', multiplier: 0.65, description: 'Heavy showers' };
  if (code <= 99) return { condition: 'storm', multiplier: 0.5, description: 'Thunderstorm' };
  return { condition: 'cloudy', multiplier: 0.95, description: 'Cloudy' };
}

/**
 * Real flight duration in seconds:
 * distance_km / (speed_mph * 1.60934 km/h) * 3600
 * Example: 10.5 km at 40 mph ≈ 587 seconds (~9m 47s)
 */
export function calculateFlightSeconds(distanceKm: number, speedMph: number): number {
  const speedKmh = mphToKmh(speedMph);
  if (speedKmh <= 0 || distanceKm <= 0) return 1;
  const hours = distanceKm / speedKmh;
  return Math.max(1, Math.round(hours * 3600));
}

/**
 * Apply admin time_multiplier.
 * multiplier 1 = real time
 * multiplier 3600 = 1 real second ≈ 1 simulated hour (fast testing)
 * Never force a 3s floor when using real time — only enforce min 1s.
 */
export function applyTimeMultiplier(realSeconds: number, timeMultiplier: number): number {
  const m = timeMultiplier > 0 ? timeMultiplier : 1;
  const scaled = Math.round(realSeconds / m);
  return Math.max(1, scaled);
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

export async function fetchTimeMultiplier(): Promise<number> {
  try {
    const { supabase } = await import('./supabase');
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'time_multiplier')
      .maybeSingle();
    if (!data?.value) return 1;
    const raw = data.value;
    const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/"/g, ''));
    return Number.isFinite(n) && n > 0 ? n : 1;
  } catch {
    return 1;
  }
}
