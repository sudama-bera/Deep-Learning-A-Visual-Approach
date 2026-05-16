import { createServer, type Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import type { Express } from "express";
import { verifyToken } from "./auth.js";
import { getDocument, getMembership } from "./db.js";
import { hasMinimumRole } from "./authz.js";
import {
  clearDocumentPresence,
  createRedisClients,
  setCursorState,
  setPresenceState,
  setTypingState
} from "./redisState.js";

interface JoinPayload {
  workspaceId: number;
  documentId: number;
}

interface DocumentEventPayload {
  workspaceId: number;
  documentId: number;
  event: unknown;
}

interface PresencePayload {
  workspaceId: number;
  documentId: number;
  data: Record<string, unknown>;
}

interface SocketUserData {
  userId: number;
  email: string;
  name: string;
}

function roomName(documentId: number): string {
  return `document:${documentId}`;
}

export async function createRealtimeServer(app: Express): Promise<{ httpServer: HttpServer; io: Server }> {
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*"
    }
  });

  const { pubClient, subClient, stateClient } = await createRedisClients();
  io.adapter(createAdapter(pubClient, subClient));

  io.use((socket, next) => {
    const token =
      (typeof socket.handshake.auth.token === "string" && socket.handshake.auth.token) ||
      (socket.handshake.headers.authorization?.startsWith("Bearer ")
        ? socket.handshake.headers.authorization.slice("Bearer ".length)
        : undefined);

    if (!token) {
      next(new Error("Missing token"));
      return;
    }

    try {
      const claims = verifyToken(token);
      (socket.data as SocketUserData).userId = Number(claims.sub);
      (socket.data as SocketUserData).email = claims.email;
      (socket.data as SocketUserData).name = claims.name;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const joinedDocuments = new Set<number>();
    const user = socket.data as SocketUserData;

    socket.on("document:join", async (payload: JoinPayload, ack?: (result: unknown) => void) => {
      if (!payload?.workspaceId || !payload?.documentId) {
        ack?.({ ok: false, error: "Invalid payload" });
        return;
      }

      const membership = await getMembership(payload.workspaceId, user.userId);
      if (!membership || !hasMinimumRole(membership.role, "viewer")) {
        ack?.({ ok: false, error: "Forbidden" });
        return;
      }

      const document = await getDocument(payload.workspaceId, payload.documentId);
      if (!document) {
        ack?.({ ok: false, error: "Document not found" });
        return;
      }

      const room = roomName(payload.documentId);
      await socket.join(room);
      joinedDocuments.add(payload.documentId);

      await setPresenceState(stateClient, payload.documentId, user.userId, {
        status: "online",
        at: new Date().toISOString()
      });

      io.to(room).emit("presence:update", {
        documentId: payload.documentId,
        userId: user.userId,
        status: "online"
      });

      ack?.({ ok: true, room });
    });

    socket.on("document:event", async (payload: DocumentEventPayload, ack?: (result: unknown) => void) => {
      if (!payload?.workspaceId || !payload?.documentId) {
        ack?.({ ok: false, error: "Invalid payload" });
        return;
      }

      if (!joinedDocuments.has(payload.documentId)) {
        ack?.({ ok: false, error: "Join room first" });
        return;
      }

      const membership = await getMembership(payload.workspaceId, user.userId);
      if (!membership || !hasMinimumRole(membership.role, "editor")) {
        ack?.({ ok: false, error: "Forbidden" });
        return;
      }

      socket.to(roomName(payload.documentId)).emit("document:event", {
        userId: user.userId,
        documentId: payload.documentId,
        event: payload.event
      });

      ack?.({ ok: true });
    });

    socket.on("presence:cursor", async (payload: PresencePayload) => {
      if (!payload?.documentId || !joinedDocuments.has(payload.documentId)) {
        return;
      }

      await setCursorState(stateClient, payload.documentId, user.userId, payload.data ?? {});
      socket.to(roomName(payload.documentId)).emit("presence:cursor", {
        userId: user.userId,
        documentId: payload.documentId,
        data: payload.data ?? {}
      });
    });

    socket.on("presence:typing", async (payload: PresencePayload) => {
      if (!payload?.documentId || !joinedDocuments.has(payload.documentId)) {
        return;
      }

      await setTypingState(stateClient, payload.documentId, user.userId, payload.data ?? {});
      socket.to(roomName(payload.documentId)).emit("presence:typing", {
        userId: user.userId,
        documentId: payload.documentId,
        data: payload.data ?? {}
      });
    });

    socket.on("disconnect", async () => {
      await Promise.all(
        [...joinedDocuments].map(async (documentId) => {
          await clearDocumentPresence(stateClient, documentId, user.userId);
          io.to(roomName(documentId)).emit("presence:update", {
            documentId,
            userId: user.userId,
            status: "offline"
          });
        })
      );
    });
  });

  return { httpServer, io };
}
