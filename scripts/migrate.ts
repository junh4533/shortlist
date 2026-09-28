/** CLI: apply pending database migrations (`npm run migrate`). */
import { migrate } from "../src/lib/db/migrate";

migrate({ log: true }).catch((error) => {
  console.error(error);
  process.exit(1);
});
