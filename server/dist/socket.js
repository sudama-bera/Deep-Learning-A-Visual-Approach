"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRealtimeServer = createRealtimeServer;
const node_http_1 = require("node:http");
const socket_io_1 = require("socket.io");
const redis_adapter_1 = require("@socket.io/redis-adapter");
const auth_js_1 = require("./auth.js");
const db_js_1 = require("./db.js");
const authz_js_1 = require("./authz.js");
const redisState_js_1 = require("./redisState.js");
function roomName(documentId) {
    return `document:${documentId}`;
}
async function createRealtimeServer(app) {
    const httpServer = (0, node_http_1.createServer)(app);
    const io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: "*"
        }
    });
    const { pubClient, subClient, stateClient } = await (0, redisState_js_1.createRedisClients)();
    io.adapter((0, redis_adapter_1.createAdapter)(pubClient, subClient));
    io.use((socket, next) => {
        const token = (typeof socket.handshake.auth.token === "string" && socket.handshake.auth.token) ||
            (socket.handshake.headers.authorization?.startsWith("Bearer ")
                ? socket.handshake.headers.authorization.slice("Bearer ".length)
                : undefined);
        if (!token) {
            next(new Error("Missing token"));
            return;
        }
        try {
            const claims = (0, auth_js_1.verifyToken)(token);
            socket.data.userId = Number(claims.sub);
            socket.data.email = claims.email;
            socket.data.name = claims.name;
            next();
        }
        catch {
            next(new Error("Invalid token"));
        }
    });
    io.on("connection", (socket) => {
        const joinedDocuments = new Set();
        const user = socket.data;
        socket.on("document:join", async (payload, ack) => {
            if (!payload?.workspaceId || !payload?.documentId) {
                ack?.({ ok: false, error: "Invalid payload" });
                return;
            }
            const membership = await (0, db_js_1.getMembership)(payload.workspaceId, user.userId);
            if (!membership || !(0, authz_js_1.hasMinimumRole)(membership.role, "viewer")) {
                ack?.({ ok: false, error: "Forbidden" });
                return;
            }
            const document = await (0, db_js_1.getDocument)(payload.workspaceId, payload.documentId);
            if (!document) {
                ack?.({ ok: false, error: "Document not found" });
                return;
            }
            const room = roomName(payload.documentId);
            await socket.join(room);
            joinedDocuments.add(payload.documentId);
            await (0, redisState_js_1.setPresenceState)(stateClient, payload.documentId, user.userId, {
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
        socket.on("document:event", async (payload, ack) => {
            if (!payload?.workspaceId || !payload?.documentId) {
                ack?.({ ok: false, error: "Invalid payload" });
                return;
            }
            if (!joinedDocuments.has(payload.documentId)) {
                ack?.({ ok: false, error: "Join room first" });
                return;
            }
            const membership = await (0, db_js_1.getMembership)(payload.workspaceId, user.userId);
            if (!membership || !(0, authz_js_1.hasMinimumRole)(membership.role, "editor")) {
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
        socket.on("presence:cursor", async (payload) => {
            if (!payload?.documentId || !joinedDocuments.has(payload.documentId)) {
                return;
            }
            await (0, redisState_js_1.setCursorState)(stateClient, payload.documentId, user.userId, payload.data ?? {});
            socket.to(roomName(payload.documentId)).emit("presence:cursor", {
                userId: user.userId,
                documentId: payload.documentId,
                data: payload.data ?? {}
            });
        });
        socket.on("presence:typing", async (payload) => {
            if (!payload?.documentId || !joinedDocuments.has(payload.documentId)) {
                return;
            }
            await (0, redisState_js_1.setTypingState)(stateClient, payload.documentId, user.userId, payload.data ?? {});
            socket.to(roomName(payload.documentId)).emit("presence:typing", {
                userId: user.userId,
                documentId: payload.documentId,
                data: payload.data ?? {}
            });
        });
        socket.on("disconnect", async () => {
            await Promise.all([...joinedDocuments].map(async (documentId) => {
                await (0, redisState_js_1.clearDocumentPresence)(stateClient, documentId, user.userId);
                io.to(roomName(documentId)).emit("presence:update", {
                    documentId,
                    userId: user.userId,
                    status: "offline"
                });
            }));
        });
    });
    return { httpServer, io };
}
