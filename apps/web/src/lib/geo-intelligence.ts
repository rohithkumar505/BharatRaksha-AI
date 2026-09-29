import { prisma } from "./db";
import { getRedis } from "./redis";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const GEOCODE_TTL_SEC = 60 * 60 * 24 * 30; // 30 days
const USER_AGENT = "BharatRaksha-AI/1.0 (investigation-platform)";

/** Known Bengaluru cell tower approximations for testdata tower names */
const TOWER_COORDS: Record<string, { lat: number; lng: number }> = {
  "mg road tower": { lat: 12.975, lng: 77.6063 },
  "koramangala tower": { lat: 12.9352, lng: 77.6245 },
  "indiranagar tower": { lat: 12.9784, lng: 77.6408 },
  "whitefield tower": { lat: 12.9698, lng: 77.75 },
  "twr-blr-4521": { lat: 12.9716, lng: 77.5946 },
  "twr-blr-8832": { lat: 12.9352, lng: 77.6245 },
};

export interface GeoPoint {
  id: string;
  entityRef: string | null;
  latitude: number;
  longitude: number;
  label: string;
  towerId?: string | null;
  address?: string | null;
  timestamp: string;
  source: string;
  eventType: "LOCATION" | "CALL" | "TOWER";
}

export interface MovementPath {
  entityRef: string;
  points: Array<{ lat: number; lng: number; timestamp: string; label: string }>;
  distanceKm: number;
}

export interface CommonLocation {
  locationKey: string;
  latitude: number;
  longitude: number;
  entities: string[];
  eventCount: number;
  firstSeen: string;
  lastSeen: string;
  reason: string;
}

export interface Hotspot {
  id: string;
  latitude: number;
  longitude: number;
  intensity: number;
  eventCount: number;
  entities: string[];
  label: string;
}

export interface TimelineEvent {
  id: string;
  type: "CALL" | "TRANSACTION" | "LOCATION" | "MOVEMENT";
  timestamp: string;
  summary: string;
  entityRef?: string;
  latitude?: number;
  longitude?: number;
  metadata?: Record<string, unknown>;
}

export interface CorrelatedSequence {
  pattern: string;
  events: TimelineEvent[];
  timeSpanMinutes: number;
  note: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
}

export interface MapDataResult {
  center: { lat: number; lng: number };
  zoom: number;
  markers: GeoPoint[];
  paths: MovementPath[];
  commonLocations: CommonLocation[];
  hotspots: Hotspot[];
  bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  computedAt: string;
}

export interface UnifiedTimelineResult {
  events: TimelineEvent[];
  correlatedSequences: CorrelatedSequence[];
  summary: {
    totalEvents: number;
    calls: number;
    transactions: number;
    locations: number;
    dateRange: { from: string | null; to: string | null };
  };
  computedAt: string;
}

function cacheKey(query: string): string {
  return `geocode:${query.toLowerCase().replace(/\s+/g, " ").trim()}`;
}

export async function geocodeAddress(
  query: string
): Promise<{ lat: number; lng: number; displayName: string } | null> {
  const normalized = query.trim();
  if (!normalized) return null;

  const towerKey = normalized.toLowerCase();
  if (TOWER_COORDS[towerKey]) {
    return { lat: TOWER_COORDS[towerKey].lat, lng: TOWER_COORDS[towerKey].lng, displayName: normalized };
  }

  try {
    const redis = getRedis();
    const cached = await redis.get(cacheKey(normalized));
    if (cached) return JSON.parse(cached);
  } catch {
    // Redis optional
  }

  try {
    const params = new URLSearchParams({
      q: normalized.includes("India") ? normalized : `${normalized}, India`,
      format: "json",
      limit: "1",
    });
    const res = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const result = {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      displayName: data[0].display_name as string,
    };

    try {
      const redis = getRedis();
      await redis.setex(cacheKey(normalized), GEOCODE_TTL_SEC, JSON.stringify(result));
    } catch {
      // cache write optional
    }

    return result;
  } catch {
    return null;
  }
}

/** Geocode case ADDRESS entities + tower names missing coordinates */
export async function geocodeCaseLocations(caseId: string): Promise<number> {
  let geocoded = 0;

  const addressEntities = await prisma.entity.findMany({
    where: { caseId, type: { in: ["ADDRESS", "LOCATION"] }, mergedIntoId: null },
  });

  for (const entity of addressEntities) {
    const existing = await prisma.locationEvent.findFirst({
      where: { caseId, entityRef: entity.normalizedValue, latitude: { not: null } },
    });
    if (existing) continue;

    const coords = await geocodeAddress(entity.normalizedValue);
    if (!coords) continue;

    await prisma.locationEvent.create({
      data: {
        caseId,
        entityRef: entity.normalizedValue,
        latitude: coords.lat,
        longitude: coords.lng,
        address: coords.displayName,
        timestamp: new Date(),
        source: "GEOCODED",
      },
    });
    geocoded++;

    await new Promise((r) => setTimeout(r, 1100)); // Nominatim rate limit
  }

  const eventsWithoutCoords = await prisma.locationEvent.findMany({
    where: { caseId, OR: [{ latitude: null }, { longitude: null }] },
  });

  for (const ev of eventsWithoutCoords) {
    const query = ev.towerId ?? ev.address ?? ev.entityRef;
    if (!query) continue;
    const coords = await geocodeAddress(query);
    if (!coords) continue;

    await prisma.locationEvent.update({
      where: { id: ev.id },
      data: { latitude: coords.lat, longitude: coords.lng, address: coords.displayName },
    });
    geocoded++;
    await new Promise((r) => setTimeout(r, 1100));
  }

  return geocoded;
}

async function resolveLocationPoints(caseId: string): Promise<GeoPoint[]> {
  const [locationEvents, cdrRecords] = await Promise.all([
    prisma.locationEvent.findMany({ where: { caseId }, orderBy: { timestamp: "asc" } }),
    prisma.cdrRecord.findMany({ where: { caseId }, orderBy: { timestamp: "asc" } }),
  ]);

  const points: GeoPoint[] = [];

  for (const l of locationEvents) {
    let lat = l.latitude;
    let lng = l.longitude;
    if (lat == null || lng == null) {
      const key = (l.towerId ?? l.address ?? "").toLowerCase();
      const fallback = TOWER_COORDS[key];
      if (fallback) {
        lat = fallback.lat;
        lng = fallback.lng;
      }
    }
    if (lat == null || lng == null) continue;

    points.push({
      id: l.id,
      entityRef: l.entityRef,
      latitude: lat,
      longitude: lng,
      label: l.towerId ?? l.address ?? l.entityRef ?? "Location",
      towerId: l.towerId,
      address: l.address,
      timestamp: l.timestamp.toISOString(),
      source: l.source ?? "LOCATION",
      eventType: "LOCATION",
    });
  }

  for (const cdr of cdrRecords) {
    const tower = cdr.towerId ?? cdr.location;
    if (!tower) continue;
    const key = tower.toLowerCase();
    const coords = TOWER_COORDS[key];
    if (!coords) continue;

    points.push({
      id: `cdr-loc-${cdr.id}`,
      entityRef: cdr.caller,
      latitude: coords.lat,
      longitude: coords.lng,
      label: tower,
      towerId: tower,
      timestamp: cdr.timestamp.toISOString(),
      source: "CDR",
      eventType: "CALL",
    });
  }

  return points;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function buildMovementPaths(points: GeoPoint[]): MovementPath[] {
  const byEntity = new Map<string, GeoPoint[]>();
  for (const p of points) {
    if (!p.entityRef) continue;
    if (!byEntity.has(p.entityRef)) byEntity.set(p.entityRef, []);
    byEntity.get(p.entityRef)!.push(p);
  }

  const paths: MovementPath[] = [];
  for (const [entityRef, entityPoints] of byEntity) {
    if (entityPoints.length < 2) continue;
    const sorted = [...entityPoints].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    let distance = 0;
    for (let i = 1; i < sorted.length; i++) {
      distance += haversineKm(
        sorted[i - 1].latitude,
        sorted[i - 1].longitude,
        sorted[i].latitude,
        sorted[i].longitude
      );
    }

    paths.push({
      entityRef,
      points: sorted.map((p) => ({
        lat: p.latitude,
        lng: p.longitude,
        timestamp: p.timestamp,
        label: p.label,
      })),
      distanceKm: Math.round(distance * 100) / 100,
    });
  }

  return paths.sort((a, b) => b.distanceKm - a.distanceKm);
}

export function detectCommonLocations(points: GeoPoint[]): CommonLocation[] {
  const grid = new Map<
    string,
    { lat: number; lng: number; entities: Set<string>; count: number; times: string[]; label: string }
  >();

  for (const p of points) {
    const cellKey = `${p.latitude.toFixed(3)},${p.longitude.toFixed(3)}`;
    if (!grid.has(cellKey)) {
      grid.set(cellKey, {
        lat: p.latitude,
        lng: p.longitude,
        entities: new Set(),
        count: 0,
        times: [],
        label: p.label,
      });
    }
    const cell = grid.get(cellKey)!;
    if (p.entityRef) cell.entities.add(p.entityRef);
    cell.count++;
    cell.times.push(p.timestamp);
  }

  return [...grid.entries()]
    .filter(([, v]) => v.entities.size >= 2 || v.count >= 3)
    .map(([key, v]) => ({
      locationKey: key,
      latitude: v.lat,
      longitude: v.lng,
      entities: [...v.entities],
      eventCount: v.count,
      firstSeen: v.times.sort()[0],
      lastSeen: v.times.sort().reverse()[0],
      reason: `${v.entities.size} entities at ${v.label} (${v.count} events) — potential meeting point.`,
    }))
    .sort((a, b) => b.entities.length - a.entities.length);
}

/** Grid-based hotspot clustering (Getis-Ord style density zones) */
export function detectHotspots(points: GeoPoint[], gridSize = 0.02): Hotspot[] {
  const grid = new Map<string, { lat: number; lng: number; count: number; entities: Set<string> }>();

  for (const p of points) {
    const cellLat = Math.floor(p.latitude / gridSize) * gridSize + gridSize / 2;
    const cellLng = Math.floor(p.longitude / gridSize) * gridSize + gridSize / 2;
    const key = `${cellLat.toFixed(4)},${cellLng.toFixed(4)}`;
    if (!grid.has(key)) {
      grid.set(key, { lat: cellLat, lng: cellLng, count: 0, entities: new Set() });
    }
    const cell = grid.get(key)!;
    cell.count++;
    if (p.entityRef) cell.entities.add(p.entityRef);
  }

  const maxCount = Math.max(...[...grid.values()].map((v) => v.count), 1);

  return [...grid.entries()]
    .filter(([, v]) => v.count >= 2)
    .map(([key, v]) => ({
      id: key,
      latitude: v.lat,
      longitude: v.lng,
      intensity: Math.round((v.count / maxCount) * 100),
      eventCount: v.count,
      entities: [...v.entities],
      label: `Hotspot (${v.count} events, ${v.entities.size} entities)`,
    }))
    .sort((a, b) => b.intensity - a.intensity)
    .slice(0, 15);
}

export async function getMapData(caseId: string): Promise<MapDataResult> {
  const points = await resolveLocationPoints(caseId);

  const caseData = await prisma.case.findUnique({ where: { id: caseId } });
  let center = { lat: 20.5937, lng: 78.9629 }; // India center
  let zoom = 5;

  if (points.length > 0) {
    const lats = points.map((p) => p.latitude);
    const lngs = points.map((p) => p.longitude);
    center = {
      lat: lats.reduce((s, v) => s + v, 0) / lats.length,
      lng: lngs.reduce((s, v) => s + v, 0) / lngs.length,
    };
    zoom = points.length === 1 ? 14 : 12;
  } else if (caseData?.location) {
    const coords = await geocodeAddress(caseData.location);
    if (coords) {
      center = { lat: coords.lat, lng: coords.lng };
      zoom = 11;
    }
  }

  const paths = buildMovementPaths(points);
  const commonLocations = detectCommonLocations(points);
  const hotspots = detectHotspots(points);

  let bounds;
  if (points.length > 0) {
    const lats = points.map((p) => p.latitude);
    const lngs = points.map((p) => p.longitude);
    bounds = {
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLng: Math.min(...lngs),
      maxLng: Math.max(...lngs),
    };
  }

  return {
    center,
    zoom,
    markers: points,
    paths,
    commonLocations,
    hotspots,
    bounds,
    computedAt: new Date().toISOString(),
  };
}

const PATTERN_RULES: Array<{ pattern: string; types: TimelineEvent["type"][]; note: string; severity: CorrelatedSequence["severity"] }> = [
  { pattern: "CALL→TRANSFER", types: ["CALL", "TRANSACTION"], note: "Call followed by money transfer — review financial link", severity: "MEDIUM" },
  { pattern: "CALL→TRANSFER→CALL", types: ["CALL", "TRANSACTION", "CALL"], note: "Call-transfer-call sequence — coordinated activity indicator", severity: "HIGH" },
  { pattern: "CALL→TRANSFER→MOVEMENT", types: ["CALL", "TRANSACTION", "LOCATION"], note: "Call, transfer, then movement — possible flee pattern", severity: "HIGH" },
  { pattern: "TRANSFER→CALL", types: ["TRANSACTION", "CALL"], note: "Transfer then immediate call — confirmation pattern", severity: "MEDIUM" },
  { pattern: "MOVEMENT→CALL→TRANSFER", types: ["LOCATION", "CALL", "TRANSACTION"], note: "Location change, call, then transfer — on-site coordination", severity: "HIGH" },
  { pattern: "CALL→MOVEMENT", types: ["CALL", "LOCATION"], note: "Call followed by location change — movement after contact", severity: "LOW" },
];

export function detectCorrelatedSequences(events: TimelineEvent[], maxWindowMs = 2 * 60 * 60 * 1000): CorrelatedSequence[] {
  const sequences: CorrelatedSequence[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < events.length; i++) {
    for (const rule of PATTERN_RULES) {
      const len = rule.types.length;
      if (i + len > events.length) continue;

      const window = events.slice(i, i + len);
      const timeSpan = new Date(window[len - 1].timestamp).getTime() - new Date(window[0].timestamp).getTime();
      if (timeSpan > maxWindowMs) continue;

      const matches = window.every((e, idx) => e.type === rule.types[idx]);
      if (!matches) continue;

      const key = `${rule.pattern}|${window[0].id}|${window[len - 1].id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      sequences.push({
        pattern: rule.pattern,
        events: window,
        timeSpanMinutes: Math.round(timeSpan / 60000),
        note: rule.note,
        severity: rule.severity,
      });
    }
  }

  return sequences.sort((a, b) => {
    const sev = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    return sev[b.severity] - sev[a.severity];
  });
}

export async function getUnifiedTimeline(caseId: string): Promise<UnifiedTimelineResult> {
  const [cdrRecords, transactions, locations] = await Promise.all([
    prisma.cdrRecord.findMany({ where: { caseId }, orderBy: { timestamp: "asc" } }),
    prisma.transaction.findMany({ where: { caseId }, orderBy: { timestamp: "asc" } }),
    prisma.locationEvent.findMany({ where: { caseId }, orderBy: { timestamp: "asc" } }),
  ]);

  const mapPoints = await resolveLocationPoints(caseId);
  const locCoordMap = new Map(mapPoints.map((p) => [p.id, p]));

  const events: TimelineEvent[] = [
    ...cdrRecords.map((r) => ({
      id: r.id,
      type: "CALL" as const,
      timestamp: r.timestamp.toISOString(),
      summary: `Call: ${r.caller} → ${r.receiver} (${r.duration}s)${r.location ? ` @ ${r.location}` : ""}`,
      entityRef: r.caller,
      metadata: { caller: r.caller, receiver: r.receiver, duration: r.duration, tower: r.location },
    })),
    ...transactions.map((t) => ({
      id: t.id,
      type: "TRANSACTION" as const,
      timestamp: t.timestamp.toISOString(),
      summary: `Transfer: ₹${Number(t.amount).toLocaleString("en-IN")} ${t.sender} → ${t.receiver}`,
      entityRef: t.sender,
      metadata: { sender: t.sender, receiver: t.receiver, amount: Number(t.amount) },
    })),
    ...locations.map((l) => {
      const mp = locCoordMap.get(l.id);
      return {
        id: l.id,
        type: "LOCATION" as const,
        timestamp: l.timestamp.toISOString(),
        summary: `Location: ${l.entityRef ?? "Unknown"} at ${l.towerId ?? l.address ?? `${l.latitude},${l.longitude}`}`,
        entityRef: l.entityRef ?? undefined,
        latitude: mp?.latitude ?? l.latitude ?? undefined,
        longitude: mp?.longitude ?? l.longitude ?? undefined,
        metadata: { towerId: l.towerId, source: l.source },
      };
    }),
  ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const correlatedSequences = detectCorrelatedSequences(events);

  return {
    events,
    correlatedSequences,
    summary: {
      totalEvents: events.length,
      calls: events.filter((e) => e.type === "CALL").length,
      transactions: events.filter((e) => e.type === "TRANSACTION").length,
      locations: events.filter((e) => e.type === "LOCATION").length,
      dateRange: {
        from: events[0]?.timestamp ?? null,
        to: events[events.length - 1]?.timestamp ?? null,
      },
    },
    computedAt: new Date().toISOString(),
  };
}

export async function createGeoAlerts(caseId: string): Promise<number> {
  const mapData = await getMapData(caseId);
  let created = 0;

  for (const loc of mapData.commonLocations.slice(0, 5)) {
    const existing = await prisma.alert.findFirst({
      where: {
        caseId,
        type: "COMMON_LOCATION",
        message: { contains: loc.locationKey },
        status: { in: ["NEW", "ACKNOWLEDGED", "INVESTIGATING"] },
      },
    });
    if (existing) continue;

    await prisma.alert.create({
      data: {
        type: "COMMON_LOCATION",
        title: `Common location: ${loc.entities.length} entities`,
        message: loc.reason,
        confidence: Math.min(loc.entities.length / 5, 0.95),
        caseId,
        metadata: { ...loc },
      },
    });
    created++;
  }

  return created;
}
