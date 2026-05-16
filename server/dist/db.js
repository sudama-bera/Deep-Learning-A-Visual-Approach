"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
exports.initDb = initDb;
exports.getUserByEmail = getUserByEmail;
exports.createUser = createUser;
exports.createWorkspace = createWorkspace;
exports.getMembership = getMembership;
exports.addWorkspaceMember = addWorkspaceMember;
exports.createDocument = createDocument;
exports.getDocument = getDocument;
const pg_1 = require("pg");
const config_js_1 = require("./config.js");
exports.pool = new pg_1.Pool({
    connectionString: config_js_1.env.DATABASE_URL
});
async function initDb() {
    await exports.pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
    await exports.pool.query(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
    await exports.pool.query(`
    CREATE TABLE IF NOT EXISTS workspace_members (
      workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('owner', 'editor', 'viewer')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (workspace_id, user_id)
    );
  `);
    await exports.pool.query(`
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
async function getUserByEmail(email) {
    const result = await exports.pool.query(`SELECT id, email, name, password_hash FROM users WHERE email = $1`, [email.toLowerCase()]);
    return result.rows[0] ?? null;
}
async function createUser(email, name, passwordHash) {
    const result = await exports.pool.query(`INSERT INTO users (email, name, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, email, name`, [email.toLowerCase(), name, passwordHash]);
    return result.rows[0];
}
async function createWorkspace(name, createdBy) {
    const workspaceResult = await exports.pool.query(`INSERT INTO workspaces (name, created_by)
     VALUES ($1, $2)
     RETURNING id, name`, [name, createdBy]);
    const workspace = workspaceResult.rows[0];
    await exports.pool.query(`INSERT INTO workspace_members (workspace_id, user_id, role)
     VALUES ($1, $2, 'owner')
     ON CONFLICT (workspace_id, user_id) DO NOTHING`, [workspace.id, createdBy]);
    return workspace;
}
async function getMembership(workspaceId, userId) {
    const result = await exports.pool.query(`SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`, [workspaceId, userId]);
    return result.rows[0] ?? null;
}
async function addWorkspaceMember(workspaceId, userId, role) {
    await exports.pool.query(`INSERT INTO workspace_members (workspace_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role`, [workspaceId, userId, role]);
}
async function createDocument(workspaceId, title, content, createdBy) {
    const result = await exports.pool.query(`INSERT INTO documents (workspace_id, title, content, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING id, workspace_id, title, content`, [workspaceId, title, content, createdBy]);
    return result.rows[0];
}
async function getDocument(workspaceId, documentId) {
    const result = await exports.pool.query(`SELECT id, workspace_id, title, content
     FROM documents
     WHERE id = $1 AND workspace_id = $2`, [documentId, workspaceId]);
    return result.rows[0] ?? null;
}
