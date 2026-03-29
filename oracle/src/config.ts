/**
 * VaultGate Oracle — Configuration
 *
 * Loads and validates all environment variables at startup.
 * Fails fast with clear error messages if any required config is missing.
 */

import { z } from "zod";
import { config as loadDotenv } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(__dirname, "../.env") });

const configSchema = z.object({
  // Solana
  SOLANA_RPC_URL: z
    .string()
    .url()
    .default("https://api.devnet.solana.com"),
  ACCESS_REGISTRY_PROGRAM_ID: z
    .string()
    .min(1, "ACCESS_REGISTRY_PROGRAM_ID is required")
    .default("AccESSXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"),

  // Oracle keypair (base58 secret key)
  ORACLE_KEYPAIR: z
    .string()
    .min(1, "ORACLE_KEYPAIR is required for signing whitelist writes")
    .default(""),

  // Fireblocks
  FIREBLOCKS_API_KEY: z.string().default(""),
  FIREBLOCKS_API_SECRET_PATH: z
    .string()
    .default("./fireblocks_secret.key"),
  FIREBLOCKS_PUBLIC_KEY: z.string().default(""),
  FIREBLOCKS_BASE_URL: z
    .string()
    .url()
    .default("https://sandbox-api.fireblocks.io"),

  // Service
  PORT: z.coerce.number().int().positive().default(3001),
  LOG_DIR: z.string().default("./logs"),

  // Development
  MOCK_MODE: z
    .string()
    .transform((v) => v === "true")
    .default("false"),
});

export type Config = z.infer<typeof configSchema>;

let _config: Config | null = null;

export function getConfig(): Config {
  if (!_config) {
    const result = configSchema.safeParse(process.env);
    if (!result.success) {
      const errors = result.error.issues
        .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      console.error(`\n❌ Oracle configuration errors:\n${errors}\n`);
      console.error("Copy .env.example to .env and fill in the values.\n");
      process.exit(1);
    }
    _config = result.data;
  }
  return _config;
}

/** Reset config — used in tests */
export function resetConfig(): void {
  _config = null;
}
