"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRouter = createRouter;
const express_1 = __importDefault(require("express"));
const zod_1 = require("zod");
const auth_js_1 = require("./auth.js");
const db_js_1 = require("./db.js");
const authz_js_1 = require("./authz.js");
const registerBodySchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    name: zod_1.z.string().min(1),
    password: zod_1.z.string().min(8)
});
const loginBodySchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8)
});
const createWorkspaceSchema = zod_1.z.object({
    name: zod_1.z.string().min(1)
});
const createDocumentSchema = zod_1.z.object({
    title: zod_1.z.string().min(1),
    content: zod_1.z.string().default("")
});
const addMemberSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    role: zod_1.z.enum(["owner", "editor", "viewer"])
});
function parseId(value) {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) {
        throw new Error("Invalid id");
    }
    return id;
}
async function requireWorkspaceRole(res, workspaceId, userId, minRole) {
    const membership = await (0, db_js_1.getMembership)(workspaceId, userId);
    if (!membership || !(0, authz_js_1.hasMinimumRole)(membership.role, minRole)) {
        res.status(403).json({ error: "Forbidden" });
        return null;
    }
    return membership;
}
function createRouter() {
    const router = express_1.default.Router();
    router.get("/health", (_req, res) => {
        res.json({ ok: true });
    });
    router.post("/auth/register", async (req, res) => {
        const parsed = registerBodySchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: parsed.error.flatten() });
            return;
        }
        const { email, name, password } = parsed.data;
        const existing = await (0, db_js_1.getUserByEmail)(email);
        if (existing) {
            res.status(409).json({ error: "Email already registered" });
            return;
        }
        const passwordHash = await (0, auth_js_1.hashPassword)(password);
        const user = await (0, db_js_1.createUser)(email, name, passwordHash);
        const token = (0, auth_js_1.signToken)(user);
        res.status(201).json({ token, user });
    });
    router.post("/auth/login", async (req, res) => {
        const parsed = loginBodySchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: parsed.error.flatten() });
            return;
        }
        const { email, password } = parsed.data;
        const user = await (0, db_js_1.getUserByEmail)(email);
        if (!user) {
            res.status(401).json({ error: "Invalid credentials" });
            return;
        }
        const passwordOk = await (0, auth_js_1.verifyPassword)(password, user.password_hash);
        if (!passwordOk) {
            res.status(401).json({ error: "Invalid credentials" });
            return;
        }
        const token = (0, auth_js_1.signToken)({ id: user.id, email: user.email, name: user.name });
        res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
    });
    router.get("/me", auth_js_1.requireAuth, (req, res) => {
        res.json({ user: req.auth });
    });
    router.post("/workspaces", auth_js_1.requireAuth, async (req, res) => {
        const parsed = createWorkspaceSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: parsed.error.flatten() });
            return;
        }
        const workspace = await (0, db_js_1.createWorkspace)(parsed.data.name, req.auth.userId);
        res.status(201).json({ workspace });
    });
    router.post("/workspaces/:workspaceId/members", auth_js_1.requireAuth, async (req, res) => {
        const workspaceId = parseId(String(req.params.workspaceId));
        const body = addMemberSchema.safeParse(req.body);
        if (!body.success) {
            res.status(400).json({ error: body.error.flatten() });
            return;
        }
        const allowed = await requireWorkspaceRole(res, workspaceId, req.auth.userId, "owner");
        if (!allowed) {
            return;
        }
        const targetUser = await (0, db_js_1.getUserByEmail)(body.data.email);
        if (!targetUser) {
            res.status(404).json({ error: "User not found" });
            return;
        }
        await (0, db_js_1.addWorkspaceMember)(workspaceId, targetUser.id, body.data.role);
        res.status(204).send();
    });
    router.post("/workspaces/:workspaceId/documents", auth_js_1.requireAuth, async (req, res) => {
        const workspaceId = parseId(String(req.params.workspaceId));
        const body = createDocumentSchema.safeParse(req.body);
        if (!body.success) {
            res.status(400).json({ error: body.error.flatten() });
            return;
        }
        const allowed = await requireWorkspaceRole(res, workspaceId, req.auth.userId, "editor");
        if (!allowed) {
            return;
        }
        const document = await (0, db_js_1.createDocument)(workspaceId, body.data.title, body.data.content, req.auth.userId);
        res.status(201).json({ document });
    });
    router.get("/workspaces/:workspaceId/documents/:documentId", auth_js_1.requireAuth, async (req, res) => {
        const workspaceId = parseId(String(req.params.workspaceId));
        const documentId = parseId(String(req.params.documentId));
        const allowed = await requireWorkspaceRole(res, workspaceId, req.auth.userId, "viewer");
        if (!allowed) {
            return;
        }
        const document = await (0, db_js_1.getDocument)(workspaceId, documentId);
        if (!document) {
            res.status(404).json({ error: "Document not found" });
            return;
        }
        res.json({ document });
    });
    return router;
}
