import express from "express";
import cors from "cors";
import { env } from "./config.js";
import { initDb } from "./db.js";
import { createRouter } from "./routes.js";
import { createRealtimeServer } from "./socket.js";

async function main(): Promise<void> {
  await initDb();

  const app = express();
  app.use(cors({ origin: env.CORS_ORIGINS }));
  app.use(express.json());
  app.use(createRouter());

  const { httpServer } = await createRealtimeServer(app);

  httpServer.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on http://localhost:${env.PORT}`);
  });
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Fatal startup error", error);
  process.exit(1);
});
