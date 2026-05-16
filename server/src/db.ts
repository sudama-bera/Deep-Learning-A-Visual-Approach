import { Pool } from "pg";
import { env } from "./config.js";

export const pool = new Pool({
  connectionString: env.DATABASE_URL
});

export type Role = "owner" | "editor" | "viewer";

export async function initDb(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS workspace_members (
      workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('owner', 'editor', 'viewer')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (workspace_id, user_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id BIGSERIAL PRIMARY KEY,
      workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export async function getUserByEmail(email: string): Promise<{ id: number; email: string; name: string; password_hash: string } | null> {
  const result = await pool.query(
    `SELECT id, email, name, password_hash FROM users WHERE email = $1`,
    [email.toLowerCase()]
  );

  return result.rows[0] ?? null;
}

export async function createUser(email: string, name: string, passwordHash: string): Promise<{ id: number; email: string; name: string }> {
  const result = await pool.query(
    `INSERT INTO users (email, name, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, email, name`,
    [email.toLowerCase(), name, passwordHash]
  );

  return result.rows[0];
}

export async function createWorkspace(name: string, createdBy: number): Promise<{ id: number; name: string }> {
  const workspaceResult = await pool.query(
    `INSERT INTO workspaces (name, created_by)
     VALUES ($1, $2)
     RETURNING id, name`,
    [name, createdBy]
  );

  const workspace = workspaceResult.rows[0];

  await pool.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role)
     VALUES ($1, $2, 'owner')
     ON CONFLICT (workspace_id, user_id) DO NOTHING`,
    [workspace.id, createdBy]
  );

  return workspace;
}

export async function getMembership(workspaceId: number, userId: number): Promise<{ role: Role } | null> {
  const result = await pool.query(
    `SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, userId]
  );

  return result.rows[0] ?? null;
}

export async function addWorkspaceMember(workspaceId: number, userId: number, role: Role): Promise<void> {
  await pool.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [workspaceId, userId, role]
  );
}

export async function createDocument(workspaceId: number, title: string, content: string, createdBy: number): Promise<{ id: number; workspace_id: number; title: string; content: string }> {
  const result = await pool.query(
    `INSERT INTO documents (workspace_id, title, content, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING id, workspace_id, title, content`,
    [workspaceId, title, content, createdBy]
  );

  return result.rows[0];
}

export async function getDocument(workspaceId: number, documentId: number): Promise<{ id: number; workspace_id: number; title: string; content: string } | null> {
  const result = await pool.query(
    `SELECT id, workspace_id, title, content
     FROM documents
     WHERE id = $1 AND workspace_id = $2`,
    [documentId, workspaceId]
  );

  return result.rows[0] ?? null;
}
