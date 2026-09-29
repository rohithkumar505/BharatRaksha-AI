"use client";

import { useMemo } from "react";
import Map, { Marker, Source, Layer, NavigationControl } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

const MAP_STYLE = "https://demotiles.maplibre.org/style.json";

interface GeoPoint {
  id: string;
  entityRef: string | null;
  latitude: number;
  longitude: number;
  label: string;
  timestamp: string;
  eventType: string;
}

interface MovementPath {
  entityRef: string;
  points: Array<{ lat: number; lng: number; timestamp: string; label: string }>;
  distanceKm: number;
}

interface Hotspot {
  id: string;
  latitude: number;
  longitude: number;
  intensity: number;
  eventCount: number;
  label: string;
}

interface Props {
  center: { lat: number; lng: number };
  zoom: number;
  markers: GeoPoint[];
  paths: MovementPath[];
  hotspots: Hotspot[];
  highlightId?: string | null;
  onMarkerClick?: (marker: GeoPoint) => void;
}

const TYPE_COLORS: Record<string, string> = {
  LOCATION: "#ef4444",
  CALL: "#22c55e",
  TOWER: "#3b82f6",
};

export function CaseMapView({
  center,
  zoom,
  markers,
  paths,
  hotspots,
  highlightId,
  onMarkerClick,
}: Props) {
  const pathGeoJson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: paths.map((p, idx) => ({
        type: "Feature" as const,
        id: `path-${idx}`,
        properties: { entityRef: p.entityRef, distanceKm: p.distanceKm },
        geometry: {
          type: "LineString" as const,
          coordinates: p.points.map((pt) => [pt.lng, pt.lat]),
        },
      })),
    }),
    [paths]
  );

  const hotspotGeoJson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: hotspots.map((h) => ({
        type: "Feature" as const,
        properties: { intensity: h.intensity, label: h.label },
        geometry: {
          type: "Point" as const,
          coordinates: [h.longitude, h.latitude],
        },
      })),
    }),
    [hotspots]
  );

  return (
    <div style={{ width: "100%", height: 420, borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }}>
      <Map
        initialViewState={{ longitude: center.lng, latitude: center.lat, zoom }}
        style={{ width: "100%", height: "100%" }}
        mapStyle={MAP_STYLE}
        attributionControl={false}
      >
        <NavigationControl position="top-right" />

        {paths.length > 0 && (
          <Source id="movement-paths" type="geojson" data={pathGeoJson}>
            <Layer
              id="movement-lines"
              type="line"
              paint={{
                "line-color": "#6366f1",
                "line-width": 3,
                "line-opacity": 0.75,
                "line-dasharray": [2, 1],
              }}
            />
          </Source>
        )}

        {hotspots.length > 0 && (
          <Source id="hotspots" type="geojson" data={hotspotGeoJson}>
            <Layer
              id="hotspot-circles"
              type="circle"
              paint={{
                "circle-radius": ["interpolate", ["linear"], ["get", "intensity"], 0, 12, 100, 40],
                "circle-color": "#f59e0b",
                "circle-opacity": 0.35,
                "circle-stroke-width": 2,
                "circle-stroke-color": "#f59e0b",
              }}
            />
          </Source>
        )}

        {markers.map((m) => {
          const isHighlight = highlightId === m.id;
          const color = TYPE_COLORS[m.eventType] ?? "#94a3b8";
          return (
            <Marker
              key={m.id}
              longitude={m.longitude}
              latitude={m.latitude}
              anchor="center"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                onMarkerClick?.(m);
              }}
            >
              <div
                title={`${m.label} — ${m.entityRef ?? "unknown"}`}
                style={{
                  width: isHighlight ? 18 : 12,
                  height: isHighlight ? 18 : 12,
                  borderRadius: "50%",
                  background: color,
                  border: isHighlight ? "3px solid white" : "2px solid white",
                  boxShadow: isHighlight ? `0 0 0 3px ${color}` : "0 1px 4px rgba(0,0,0,0.4)",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              />
            </Marker>
          );
        })}
      </Map>
    </div>
  );
}
