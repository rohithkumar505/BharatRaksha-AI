"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import {
  MapPin,
  Clock,
  RefreshCw,
  Loader2,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  AlertTriangle,
  Route,
  Users,
  Flame,
} from "lucide-react";
import { forceRerunLabel, useInvestigationMode } from "@/hooks/useInvestigationMode";

const CaseMapView = dynamic(() => import("./CaseMapView").then((m) => m.CaseMapView), {
  ssr: false,
  loading: () => (
    <div style={{ height: 420, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-secondary)", borderRadius: 8 }}>
      <Loader2 size={24} className="spin" />
    </div>
  ),
});

interface MapData {
  center: { lat: number; lng: number };
  zoom: number;
  markers: Array<{
    id: string;
    entityRef: string | null;
    latitude: number;
    longitude: number;
    label: string;
    timestamp: string;
    eventType: string;
  }>;
  paths: Array<{
    entityRef: string;
    points: Array<{ lat: number; lng: number; timestamp: string; label: string }>;
    distanceKm: number;
  }>;
  commonLocations: Array<{
    locationKey: string;
    latitude: number;
    longitude: number;
    entities: string[];
    eventCount: number;
    reason: string;
  }>;
  hotspots: Array<{
    id: string;
    latitude: number;
    longitude: number;
    intensity: number;
    eventCount: number;
    label: string;
  }>;
}

interface TimelineData {
  events: Array<{
    id: string;
    type: string;
    timestamp: string;
    summary: string;
    entityRef?: string;
    latitude?: number;
    longitude?: number;
  }>;
  correlatedSequences: Array<{
    pattern: string;
    timeSpanMinutes: number;
    note: string;
    severity: string;
    events: Array<{ id: string; summary: string }>;
  }>;
  summary: {
    totalEvents: number;
    calls: number;
    transactions: number;
    locations: number;
    dateRange: { from: string | null; to: string | null };
  };
}

const SEVERITY_COLORS: Record<string, string> = {
  HIGH: "#ef4444",
  MEDIUM: "#f59e0b",
  LOW: "#94a3b8",
};

const EVENT_COLORS: Record<string, string> = {
  CALL: "#22c55e",
  TRANSACTION: "#f59e0b",
  LOCATION: "#ef4444",
};

interface Props {
  caseId: string;
}

export function GeoIntelPanel({ caseId }: Props) {
  const mode = useInvestigationMode(caseId);
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1500);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/cases/${caseId}/map-data`).then((r) => r.json()),
      fetch(`/api/cases/${caseId}/timeline`).then((r) => r.json()),
    ])
      .then(([map, tl]) => {
        setMapData(map);
        setTimeline(tl);
      })
      .finally(() => setLoading(false));
  }, [caseId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!isPlaying || !timeline?.events.length) return;
    timerRef.current = setInterval(() => {
      setReplayIndex((i) => {
        if (i >= timeline.events.length - 1) {
          setIsPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, playbackSpeed);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, timeline, playbackSpeed]);

  async function runGeoAnalysis() {
    setAnalyzing(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/map-data`, { method: "POST" });
      if (res.ok) {
        const result = await res.json();
        setMapData(result.mapData);
        const tl = await fetch(`/api/cases/${caseId}/timeline`).then((r) => r.json());
        setTimeline(tl);
      }
    } finally {
      setAnalyzing(false);
    }
  }

  const currentEvent = timeline?.events[replayIndex];
  const highlightId =
    currentEvent?.latitude != null
      ? mapData?.markers.find(
          (m) =>
            m.timestamp === currentEvent.timestamp ||
            (Math.abs(m.latitude - (currentEvent.latitude ?? 0)) < 0.001 &&
              Math.abs(m.longitude - (currentEvent.longitude ?? 0)) < 0.001)
        )?.id ?? null
      : null;

  if (loading) {
    return (
      <div className="card" style={{ padding: "3rem", textAlign: "center" }}>
        <Loader2 size={24} className="spin" style={{ color: "var(--accent)" }} />
        <p style={{ marginTop: "0.5rem", color: "var(--text-secondary)" }}>Loading geo & timeline intelligence...</p>
      </div>
    );
  }

  const hasData = (timeline?.summary.totalEvents ?? 0) > 0 || (mapData?.markers.length ?? 0) > 0;

  if (!hasData) {
    return (
      <div className="card" style={{ padding: "2rem", textAlign: "center" }}>
        <MapPin size={32} style={{ color: "var(--text-secondary)", margin: "0 auto 1rem" }} />
        <h3 style={{ fontWeight: 600, marginBottom: "0.5rem" }}>No Geo or Timeline Data</h3>
        <p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>
          Upload CDR, tower/location logs, or bank transactions to build the investigation map and timeline.
        </p>
        <button className="btn btn-primary" onClick={runGeoAnalysis} disabled={analyzing}>
          {analyzing ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
          {forceRerunLabel(mode, "Run Geo Analysis")}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <MapPin size={18} /> Investigation Map
          </h2>
          <button className="btn" onClick={runGeoAnalysis} disabled={analyzing}>
            {analyzing ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
            {forceRerunLabel(mode, "Geocode & Analyze")}
          </button>
        </div>

        {mapData && (
          <CaseMapView
            center={mapData.center}
            zoom={mapData.zoom}
            markers={mapData.markers}
            paths={mapData.paths}
            hotspots={mapData.hotspots}
            highlightId={highlightId}
          />
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem", marginTop: "1rem" }}>
          <Stat label="Map Markers" value={mapData?.markers.length ?? 0} icon={<MapPin size={14} />} />
          <Stat label="Movement Paths" value={mapData?.paths.length ?? 0} icon={<Route size={14} />} />
          <Stat label="Common Locations" value={mapData?.commonLocations.length ?? 0} icon={<Users size={14} />} />
          <Stat label="Hotspots" value={mapData?.hotspots.length ?? 0} icon={<Flame size={14} />} />
        </div>
      </div>

      {(mapData?.commonLocations.length ?? 0) > 0 && (
        <div className="card">
          <h3 style={{ fontWeight: 600, marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Users size={16} /> Common Locations
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {mapData!.commonLocations.slice(0, 5).map((loc) => (
              <div key={loc.locationKey} style={{ padding: "0.75rem", background: "var(--bg-secondary)", borderRadius: 8, fontSize: "0.875rem" }}>
                <p style={{ fontWeight: 500 }}>{loc.entities.join(", ")}</p>
                <p style={{ color: "var(--text-secondary)" }}>{loc.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Clock size={18} /> Investigation Timeline
          </h2>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button className="btn" onClick={() => setReplayIndex((i) => Math.max(0, i - 1))} title="Previous">
              <SkipBack size={16} />
            </button>
            <button
              className="btn btn-primary"
              onClick={() => setIsPlaying((p) => !p)}
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button
              className="btn"
              onClick={() => setReplayIndex((i) => Math.min((timeline?.events.length ?? 1) - 1, i + 1))}
              title="Next"
            >
              <SkipForward size={16} />
            </button>
            <select
              value={playbackSpeed}
              onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
              style={{ fontSize: "0.75rem" }}
            >
              <option value={3000}>0.5x</option>
              <option value={1500}>1x</option>
              <option value={750}>2x</option>
              <option value={400}>4x</option>
            </select>
          </div>
        </div>

        {timeline && (
          <>
            <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", fontSize: "0.875rem", flexWrap: "wrap" }}>
              <span>{timeline.summary.totalEvents} events</span>
              <span style={{ color: EVENT_COLORS.CALL }}>{timeline.summary.calls} calls</span>
              <span style={{ color: EVENT_COLORS.TRANSACTION }}>{timeline.summary.transactions} transfers</span>
              <span style={{ color: EVENT_COLORS.LOCATION }}>{timeline.summary.locations} locations</span>
              {timeline.summary.dateRange.from && (
                <span style={{ color: "var(--text-secondary)" }}>
                  {new Date(timeline.summary.dateRange.from).toLocaleDateString("en-IN")} —{" "}
                  {timeline.summary.dateRange.to
                    ? new Date(timeline.summary.dateRange.to).toLocaleDateString("en-IN")
                    : "—"}
                </span>
              )}
            </div>

            <div style={{ marginBottom: "0.75rem" }}>
              <input
                type="range"
                min={0}
                max={Math.max(0, timeline.events.length - 1)}
                value={replayIndex}
                onChange={(e) => {
                  setIsPlaying(false);
                  setReplayIndex(Number(e.target.value));
                }}
                style={{ width: "100%" }}
              />
              <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                Event {replayIndex + 1} of {timeline.events.length}
                {currentEvent && ` — ${new Date(currentEvent.timestamp).toLocaleString("en-IN")}`}
              </p>
            </div>

            <div style={{ position: "relative", paddingLeft: "2rem", maxHeight: 400, overflowY: "auto" }}>
              {timeline.events.map((event, i) => {
                const isActive = i === replayIndex;
                const isPast = i < replayIndex;
                return (
                  <div
                    key={event.id}
                    style={{
                      marginBottom: "1rem",
                      position: "relative",
                      opacity: isPast ? 0.5 : 1,
                      background: isActive ? "var(--bg-secondary)" : "transparent",
                      padding: isActive ? "0.5rem" : 0,
                      borderRadius: 8,
                      transition: "all 0.2s",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: "-2rem",
                        width: isActive ? 14 : 10,
                        height: isActive ? 14 : 10,
                        borderRadius: "50%",
                        background: EVENT_COLORS[event.type] ?? "#94a3b8",
                        marginTop: 4,
                        boxShadow: isActive ? `0 0 0 3px ${EVENT_COLORS[event.type]}40` : "none",
                      }}
                    />
                    {i < timeline.events.length - 1 && (
                      <div
                        style={{
                          position: "absolute",
                          left: "-1.55rem",
                          top: 16,
                          width: 2,
                          height: "calc(100% + 0.5rem)",
                          background: isPast ? EVENT_COLORS[event.type] : "var(--border)",
                        }}
                      />
                    )}
                    <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                      {new Date(event.timestamp).toLocaleString("en-IN")}
                    </p>
                    <p style={{ fontWeight: isActive ? 600 : 500, fontSize: "0.875rem" }}>{event.summary}</p>
                    <span className="badge badge-new" style={{ fontSize: "0.7rem" }}>
                      {event.type}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {(timeline?.correlatedSequences.length ?? 0) > 0 && (
        <div className="card">
          <h3 style={{ fontWeight: 600, marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <AlertTriangle size={16} style={{ color: "var(--warning)" }} /> Correlated Sequences
          </h3>
          {timeline!.correlatedSequences.map((seq, i) => (
            <div
              key={i}
              style={{
                padding: "0.75rem",
                marginBottom: "0.5rem",
                background: "var(--bg-secondary)",
                borderRadius: 8,
                borderLeft: `3px solid ${SEVERITY_COLORS[seq.severity] ?? "#94a3b8"}`,
              }}
            >
              <p style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                {seq.pattern} <span style={{ color: SEVERITY_COLORS[seq.severity], fontSize: "0.75rem" }}>({seq.severity})</span>
              </p>
              <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                {seq.note} — within {seq.timeSpanMinutes} min
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div style={{ padding: "0.75rem", background: "var(--bg-secondary)", borderRadius: 8, textAlign: "center" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.25rem", color: "var(--text-secondary)", fontSize: "0.75rem" }}>
        {icon} {label}
      </div>
      <p style={{ fontWeight: 700, fontSize: "1.25rem", marginTop: "0.25rem" }}>{value}</p>
    </div>
  );
}
