import "dotenv/config";
import { app } from "./app.js";
import { DEFAULT_API_PORT, resolvePort } from "./lib/port.js";
import { logger } from "./lib/logger.js";

const { port: PORT, reason } = resolvePort(process.env.PORT);
if (reason) logger.warn(reason);

app.listen(PORT, () => {
  logger.info(`Server running at http://localhost:${PORT}`);
  if (PORT !== DEFAULT_API_PORT) {
    logger.warn(
      `API is not on the documented port ${DEFAULT_API_PORT} — ` +
        "update VITE_API_URL in web/.env to match.",
    );
  }
});
