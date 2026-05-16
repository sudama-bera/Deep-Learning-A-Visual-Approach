import express, { type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { requireAuth, signToken, type AuthedRequest, hashPassword, verifyPassword } from "./auth.js";
import {
  addWorkspaceMember,
  createDocument,
  createUser,
  createWorkspace,
  getDocument,
  getMembership,
  getUserByEmail,
  type Role
} from "./db.js";
import { hasMinimumRole } from "./authz.js";

const registerBodySchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8)
});

const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const createWorkspaceSchema = z.object({
  name: z.string().min(1)
});

const createDocumentSchema = z.object({
  title: z.string().min(1),
  content: z.string().default("")
});

const addMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "editor", "viewer"]) as z.ZodType<Role>
});

function parseId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Invalid id");
  }
  return id;
}

async function requireWorkspaceRole(
  res: Response,
  workspaceId: number,
  userId: number,
  minRole: Role
): Promise<{ role: Role } | null> {
  const membership = await getMembership(workspaceId, userId);

  if (!membership || !hasMinimumRole(membership.role, minRole)) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }

  return membership;
}

export function createRouter(): express.Router {
  const router = express.Router();
  const authRateLimit = rateLimit({
    windowMs: 60_000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false
  });
  const apiRateLimit = rateLimit({
    windowMs: 60_000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false
  });

  router.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  router.post("/auth/register", authRateLimit, async (req, res) => {
    const parsed = registerBodySchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { email, name, password } = parsed.data;

    const existing = await getUserByEmail(email);
    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const passwordHash = await hashPassword(password);
    const user = await createUser(email, name, passwordHash);
    const token = signToken(user);

    res.status(201).json({ token, user });
  });

  router.post("/auth/login", authRateLimit, async (req, res) => {
    const parsed = loginBodySchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { email, password } = parsed.data;
    const user = await getUserByEmail(email);

    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const passwordOk = await verifyPassword(password, user.password_hash);
    if (!passwordOk) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const token = signToken({ id: user.id, email: user.email, name: user.name });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  });

  router.get("/me", apiRateLimit, requireAuth, (req: AuthedRequest, res) => {
    res.json({ user: req.auth });
  });

  router.post("/workspaces", apiRateLimit, requireAuth, async (req: AuthedRequest, res) => {
    const parsed = createWorkspaceSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const workspace = await createWorkspace(parsed.data.name, req.auth!.userId);
    res.status(201).json({ workspace });
  });

  router.post("/workspaces/:workspaceId/members", apiRateLimit, requireAuth, async (req: AuthedRequest, res) => {
    const workspaceId = parseId(String(req.params.workspaceId));
    const body = addMemberSchema.safeParse(req.body);

    if (!body.success) {
      res.status(400).json({ error: body.error.flatten() });
      return;
    }

    const allowed = await requireWorkspaceRole(res, workspaceId, req.auth!.userId, "owner");
    if (!allowed) {
      return;
    }

    const targetUser = await getUserByEmail(body.data.email);

    if (!targetUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    await addWorkspaceMember(workspaceId, targetUser.id, body.data.role);
    res.status(204).send();
  });

  router.post("/workspaces/:workspaceId/documents", apiRateLimit, requireAuth, async (req: AuthedRequest, res) => {
    const workspaceId = parseId(String(req.params.workspaceId));
    const body = createDocumentSchema.safeParse(req.body);

    if (!body.success) {
      res.status(400).json({ error: body.error.flatten() });
      return;
    }

    const allowed = await requireWorkspaceRole(res, workspaceId, req.auth!.userId, "editor");
    if (!allowed) {
      return;
    }

    const document = await createDocument(workspaceId, body.data.title, body.data.content, req.auth!.userId);
    res.status(201).json({ document });
  });

  router.get("/workspaces/:workspaceId/documents/:documentId", apiRateLimit, requireAuth, async (req: AuthedRequest, res) => {
    const workspaceId = parseId(String(req.params.workspaceId));
    const documentId = parseId(String(req.params.documentId));

    const allowed = await requireWorkspaceRole(res, workspaceId, req.auth!.userId, "viewer");
    if (!allowed) {
      return;
    }

    const document = await getDocument(workspaceId, documentId);

    if (!document) {
      res.status(404).json({ error: "Document not found" });
      return;
    }

    res.json({ document });
  });

  return router;
}
