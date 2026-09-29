import { getRedis } from "./redis";

const ALERT_CHANNEL = "bharatraksha:alerts";

export interface AlertEvent {
  id: string;
  type: string;
  title: string;
  message: string;
  confidence?: number;
  caseId?: string;
  caseNumber?: string;
  createdAt: string;
}

export async function publishAlertEvent(event: AlertEvent): Promise<void> {
  try {
    const redis = getRedis();
    await redis.publish(ALERT_CHANNEL, JSON.stringify(event));
    await redis.lpush("bharatraksha:alerts:recent", JSON.stringify(event));
    await redis.ltrim("bharatraksha:alerts:recent", 0, 99);
  } catch {
    // Redis optional for local dev
  }
}

export function getAlertChannel(): string {
  return ALERT_CHANNEL;
}

export async function getRecentAlertEvents(limit = 20): Promise<AlertEvent[]> {
  try {
    const redis = getRedis();
    const items = await redis.lrange("bharatraksha:alerts:recent", 0, limit - 1);
    return items.map((item) => JSON.parse(item) as AlertEvent);
  } catch {
    return [];
  }
}
