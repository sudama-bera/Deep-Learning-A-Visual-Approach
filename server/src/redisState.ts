import { createClient } from "redis";
import { env } from "./config.js";

type AppRedisClient = ReturnType<typeof createClient>;

export interface RedisBundle {
  pubClient: AppRedisClient;
  subClient: AppRedisClient;
  stateClient: AppRedisClient;
}

export async function createRedisClients(): Promise<RedisBundle> {
  const pubClient = createClient({ url: env.REDIS_URL });
  const subClient = pubClient.duplicate();
  const stateClient = pubClient.duplicate();

  await Promise.all([pubClient.connect(), subClient.connect(), stateClient.connect()]);

  return { pubClient, subClient, stateClient };
}

export async function setPresenceState(
  stateClient: AppRedisClient,
  documentId: number,
  userId: number,
  payload: Record<string, unknown>
): Promise<void> {
  const key = `presence:${documentId}:${userId}`;
  await stateClient.set(key, JSON.stringify(payload), { EX: env.EPHEMERAL_TTL_SECONDS });
}

export async function setCursorState(
  stateClient: AppRedisClient,
  documentId: number,
  userId: number,
  payload: Record<string, unknown>
): Promise<void> {
  const key = `cursor:${documentId}:${userId}`;
  await stateClient.set(key, JSON.stringify(payload), { EX: env.EPHEMERAL_TTL_SECONDS });
}

export async function setTypingState(
  stateClient: AppRedisClient,
  documentId: number,
  userId: number,
  payload: Record<string, unknown>
): Promise<void> {
  const key = `typing:${documentId}:${userId}`;
  await stateClient.set(key, JSON.stringify(payload), { EX: env.EPHEMERAL_TTL_SECONDS });
}

export async function clearDocumentPresence(
  stateClient: AppRedisClient,
  documentId: number,
  userId: number
): Promise<void> {
  await Promise.all([
    stateClient.del(`presence:${documentId}:${userId}`),
    stateClient.del(`cursor:${documentId}:${userId}`),
    stateClient.del(`typing:${documentId}:${userId}`)
  ]);
}
