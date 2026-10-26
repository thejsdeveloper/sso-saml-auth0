import { config } from "./config.ts";
import { createApp } from "./app.ts";

createApp().listen(config.port, () => {
  console.info(`SAML SP listening on ${config.baseUrl}`);
  console.info(`  SP metadata: ${config.baseUrl}/saml/metadata`);
});
