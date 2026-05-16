"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
exports.signToken = signToken;
exports.verifyToken = verifyToken;
exports.requireAuth = requireAuth;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_js_1 = require("./config.js");
async function hashPassword(password) {
    return bcryptjs_1.default.hash(password, 10);
}
async function verifyPassword(password, hash) {
    return bcryptjs_1.default.compare(password, hash);
}
function signToken(user) {
    return jsonwebtoken_1.default.sign({
        sub: String(user.id),
        email: user.email,
        name: user.name
    }, config_js_1.env.JWT_SECRET, { expiresIn: "7d" });
}
function verifyToken(token) {
    const decoded = jsonwebtoken_1.default.verify(token, config_js_1.env.JWT_SECRET);
    if (typeof decoded !== "object" || !decoded.sub || !decoded.email || !decoded.name) {
        throw new Error("Invalid token payload");
    }
    return {
        sub: String(decoded.sub),
        email: String(decoded.email),
        name: String(decoded.name)
    };
}
function requireAuth(req, res, next) {
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
    }
    catch {
        res.status(401).json({ error: "Invalid token" });
    }
}
