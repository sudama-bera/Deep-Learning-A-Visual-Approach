"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const config_js_1 = require("./config.js");
const db_js_1 = require("./db.js");
const routes_js_1 = require("./routes.js");
const socket_js_1 = require("./socket.js");
async function main() {
    await (0, db_js_1.initDb)();
    const app = (0, express_1.default)();
    app.use((0, cors_1.default)());
    app.use(express_1.default.json());
    app.use((0, routes_js_1.createRouter)());
    const { httpServer } = await (0, socket_js_1.createRealtimeServer)(app);
    httpServer.listen(config_js_1.env.PORT, () => {
        // eslint-disable-next-line no-console
        console.log(`Server listening on http://localhost:${config_js_1.env.PORT}`);
    });
}
main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Fatal startup error", error);
    process.exit(1);
});
