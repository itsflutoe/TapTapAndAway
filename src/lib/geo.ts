import type { GeocodeResult, WeatherInfo } from '../types';
import { supabase } from './supabase';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

/** Default weather speed multipliers (overridden by system_settings.weather_modifiers). */
export const DEFAULT_WEATHER_MODIFIERS: Record<string, number> = {
  clear: 1.0,
  cloudy: 0.95,
  fog: 0.95,
  rain: 0.8,
  heavy_rain: 0.65,
  storm: 0.5,
  snow: 0.65,
};

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

/**
 * Stamp cost from distance.
 * cost = max(minCost, ceil(distanceKm / kmPerStamp))
 * When free event is active the caller may force 0.
 */
export function calculateStampCost(
  distanceKm: number,
  kmPerStamp = 10,
  minCost = 1
): number {
  const per = Number(kmPerStamp);
  const k = Number.isFinite(per) && per > 0 ? per : 10;
  const min = Number.isFinite(Number(minCost)) && Number(minCost) >= 0 ? Number(minCost) : 1;
  if (distanceKm <= 0) return Math.max(min, 0);
  return Math.max(min, Math.ceil(distanceKm / k));
}

async function readSettingRaw(key: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    if (data?.value == null) return null;
    return typeof data.value === 'string' ? data.value : JSON.stringify(data.value);
  } catch {
    return null;
  }
}

export async function fetchKmPerStamp(
  getSetting?: (key: string) => Promise<string | null>
): Promise<number> {
  try {
    const raw = getSetting ? await getSetting('km_per_stamp') : await readSettingRaw('km_per_stamp');
    const n = raw != null ? Number(String(raw).replace(/"/g, '')) : 10;
    return Number.isFinite(n) && n > 0 ? n : 10;
  } catch {
    return 10;
  }
}

export async function fetchMinStampCost(): Promise<number> {
  try {
    const raw = await readSettingRaw('min_stamp_cost');
    const n = raw != null ? Number(String(raw).replace(/"/g, '')) : 1;
    return Number.isFinite(n) && n >= 0 ? n : 1;
  } catch {
    return 1;
  }
}

export async function fetchWeatherModifiers(): Promise<Record<string, number>> {
  try {
    const raw = await readSettingRaw('weather_modifiers');
    if (!raw) return { ...DEFAULT_WEATHER_MODIFIERS };
    let text = String(raw).trim();
    if (text.startsWith('"') && text.endsWith('"')) {
      text = JSON.parse(text);
    }
    const parsed = typeof text === 'string' ? JSON.parse(text) : text;
    const out: Record<string, number> = { ...DEFAULT_WEATHER_MODIFIERS };
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0 && n <= 2) {
        out[k] = n;
      }
    }
    return out;
  } catch {
    return { ...DEFAULT_WEATHER_MODIFIERS };
  }
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
  const modifiers = await fetchWeatherModifiers();

  try {
    const params = new URLSearchParams({
      latitude: String(midLat),
      longitude: String(midLon),
      current: 'weather_code',
      timezone: 'auto',
    });
    const res = await fetch(`${OPEN_METEO_URL}?${params}`);
    if (!res.ok) {
      return applyModifiers(mapWeatherCode(0), modifiers);
    }
    const data = await res.json();
    const code = data?.current?.weather_code ?? 0;
    return applyModifiers(mapWeatherCode(code), modifiers);
  } catch {
    return applyModifiers(mapWeatherCode(0), modifiers);
  }
}

function applyModifiers(info: WeatherInfo, modifiers: Record<string, number>): WeatherInfo {
  const m = modifiers[info.condition];
  if (m != null && Number.isFinite(m) && m > 0) {
    return { ...info, multiplier: m };
  }
  return info;
}

/**
 * Map Open-Meteo weather codes → condition keys.
 * Multipliers here are fallbacks only; admin weather_modifiers override them.
 */
function mapWeatherCode(code: number): WeatherInfo {
  if (code === 0) return { condition: 'clear', multiplier: 1.0, description: 'Clear' };
  if (code <= 3) return { condition: 'cloudy', multiplier: 0.95, description: 'Cloudy' };
  if (code <= 48) return { condition: 'fog', multiplier: 0.95, description: 'Foggy / Cloudy' };
  if (code <= 57) return { condition: 'rain', multiplier: 0.8, description: 'Light rain' };
  if (code <= 67) return { condition: 'rain', multiplier: 0.8, description: 'Rain' };
  if (code <= 77) return { condition: 'snow', multiplier: 0.65, description: 'Snow / Ice pellets' };
  if (code <= 82) return { condition: 'heavy_rain', multiplier: 0.65, description: 'Heavy showers' };
  if (code <= 99) return { condition: 'storm', multiplier: 0.5, description: 'Thunderstorm' };
  return { condition: 'cloudy', multiplier: 0.95, description: 'Cloudy' };
}

/**
 * Real flight duration in seconds:
 * distance_km / (speed_mph * 1.60934 km/h) * 3600
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
    const raw = await readSettingRaw('time_multiplier');
    if (!raw) return 1;
    const n = parseFloat(String(raw).replace(/"/g, ''));
    return Number.isFinite(n) && n > 0 ? n : 1;
  } catch {
    return 1;
  }
}

export async function fetchPigeonBaseSpeedMph(fallback = 40): Promise<number> {
  try {
    const raw = await readSettingRaw('pigeon_base_speed_mph');
    if (!raw) return fallback;
    const n = parseFloat(String(raw).replace(/"/g, ''));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch {
    return fallback;
  }
}

export async function fetchRateLimitConfig(): Promise<{ max: number; windowSeconds: number }> {
  try {
    const [maxRaw, winRaw] = await Promise.all([
      readSettingRaw('rate_limit_max'),
      readSettingRaw('rate_limit_window_seconds'),
    ]);
    const max = maxRaw != null ? Number(String(maxRaw).replace(/"/g, '')) : 5;
    const windowSeconds = winRaw != null ? Number(String(winRaw).replace(/"/g, '')) : 60;
    return {
      max: Number.isFinite(max) && max > 0 ? max : 5,
      windowSeconds: Number.isFinite(windowSeconds) && windowSeconds > 0 ? windowSeconds : 60,
    };
  } catch {
    return { max: 5, windowSeconds: 60 };
  }
}
