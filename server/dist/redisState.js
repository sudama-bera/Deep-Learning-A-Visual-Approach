"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRedisClients = createRedisClients;
exports.setPresenceState = setPresenceState;
exports.setCursorState = setCursorState;
exports.setTypingState = setTypingState;
exports.clearDocumentPresence = clearDocumentPresence;
const redis_1 = require("redis");
const config_js_1 = require("./config.js");
async function createRedisClients() {
    const pubClient = (0, redis_1.createClient)({ url: config_js_1.env.REDIS_URL });
    const subClient = pubClient.duplicate();
    const stateClient = pubClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect(), stateClient.connect()]);
    return { pubClient, subClient, stateClient };
}
async function setPresenceState(stateClient, documentId, userId, payload) {
    const key = `presence:${documentId}:${userId}`;
    await stateClient.set(key, JSON.stringify(payload), { EX: config_js_1.env.EPHEMERAL_TTL_SECONDS });
}
async function setCursorState(stateClient, documentId, userId, payload) {
    const key = `cursor:${documentId}:${userId}`;
    await stateClient.set(key, JSON.stringify(payload), { EX: config_js_1.env.EPHEMERAL_TTL_SECONDS });
}
async function setTypingState(stateClient, documentId, userId, payload) {
    const key = `typing:${documentId}:${userId}`;
    await stateClient.set(key, JSON.stringify(payload), { EX: config_js_1.env.EPHEMERAL_TTL_SECONDS });
}
async function clearDocumentPresence(stateClient, documentId, userId) {
    await Promise.all([
        stateClient.del(`presence:${documentId}:${userId}`),
        stateClient.del(`cursor:${documentId}:${userId}`),
        stateClient.del(`typing:${documentId}:${userId}`)
    ]);
}
