import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { ClamAVClient, EICAR_TEST_STRING } from '../services/worker/src/integrations/clamav.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenvConfig({ path: resolve(__dirname, '../.env') });

async function run(): Promise<void> {
  const client = new ClamAVClient();
  const buffer = Buffer.from(EICAR_TEST_STRING, 'utf-8');

  const result = await client.scanBuffer(buffer);

  console.log(`status=${result.status}`);
  if (result.threat) {
    console.log(`threat=${result.threat}`);
  }
  if (result.error) {
    console.log(`error=${result.error}`);
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
