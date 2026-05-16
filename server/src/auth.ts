import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { env } from "./config.js";

export interface AuthClaims {
  sub: string;
  email: string;
  name: string;
}

export interface AuthedRequest extends Request {
  auth?: {
    userId: number;
    email: string;
    name: string;
  };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(user: { id: number; email: string; name: string }): string {
  return jwt.sign(
    {
      sub: String(user.id),
      email: user.email,
      name: user.name
    } satisfies AuthClaims,
    env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export function verifyToken(token: string): AuthClaims {
  const decoded = jwt.verify(token, env.JWT_SECRET);

  if (typeof decoded !== "object" || !decoded.sub || !decoded.email || !decoded.name) {
    throw new Error("Invalid token payload");
  }

  return {
    sub: String(decoded.sub),
    email: String(decoded.email),
    name: String(decoded.name)
  };
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.header("authorization") ?? "";
  const [scheme, token] = header.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  try {
    const claims = verifyToken(token);
    req.auth = {
      userId: Number(claims.sub),
      email: claims.email,
      name: claims.name
    };
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}
