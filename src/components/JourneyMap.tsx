import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

type Props = {
  origin: [number, number]; // [lat, lng]
  dest: [number, number];
  progress: number; // 0–100
  pigeonEmoji?: string;
};

/** OpenFreeMap / OSM-style vector tiles via MapLibre (no API key). */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export default function JourneyMap({ origin, dest, progress }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [origin[1], origin[0]],
      zoom: 3,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    map.on('load', () => {
      const o: [number, number] = [origin[1], origin[0]];
      const d: [number, number] = [dest[1], dest[0]];

      map.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: [o, d] },
        },
      });
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        paint: {
          'line-color': '#2563eb',
          'line-width': 4,
          'line-opacity': 0.85,
        },
      });

      new maplibregl.Marker({ color: '#16a34a' }).setLngLat(o).addTo(map);
      new maplibregl.Marker({ color: '#dc2626' }).setLngLat(d).addTo(map);

      const el = document.createElement('div');
      el.textContent = '🐦';
      el.style.fontSize = '22px';
      el.style.filter = 'drop-shadow(0 2px 2px rgba(0,0,0,0.25))';
      markerRef.current = new maplibregl.Marker({ element: el }).setLngLat(o).addTo(map);

      const bounds = new maplibregl.LngLatBounds(o, o);
      bounds.extend(d);
      map.fitBounds(bounds, { padding: 48, maxZoom: 10, duration: 0 });
    });

    return () => {
      markerRef.current?.remove();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [origin[0], origin[1], dest[0], dest[1]]);

  useEffect(() => {
    const t = Math.max(0, Math.min(1, progress / 100));
    const lng = lerp(origin[1], dest[1], t);
    const lat = lerp(origin[0], dest[0], t);
    markerRef.current?.setLngLat([lng, lat]);
  }, [progress, origin, dest]);

  return <div ref={containerRef} className="maplibre-map" style={{ width: '100%', height: '100%' }} />;
}
