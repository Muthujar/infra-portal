// Starts the API server. Run with: npm run dev

import { createApp } from "./app";
import { config } from "./config";

const app = createApp();

app.listen(config.port, () => {
  console.log("API running on http://localhost:" + config.port);
  console.log("Provisioner: " + config.provisioner + ", configurator: " + config.configurator);
});
