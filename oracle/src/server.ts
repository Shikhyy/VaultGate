/**
 * VaultGate Oracle — Server Entrypoint
 *
 * Fastify HTTP server that:
 * 1. Receives Fireblocks webhook events (POST /webhook/fireblocks)
 * 2. Processes KYC events via a durable queue
 * 3. Syncs verified wallets to on-chain AccessRegistry PDAs
 * 4. Exposes health check endpoint (GET /health)
 *
 * Per AGENTS.md Agent 2 spec — this is the main oracle service.
 */

import Fastify from "fastify";
import rawBody from "fastify-raw-body";
import { getConfig } from "./config.js";
import { getLogger } from "./logger.js";
import { registerWebhookRoutes } from "./webhooks.js";
import { startQueueProcessor, stopQueueProcessor, getQueueStats } from "./queue.js";
import { checkFireblocksHealth } from "./fireblocks.js";

async function main(): Promise<void> {
  // Load config first — fails fast if env vars are missing
  const config = getConfig();
  const logger = getLogger();

  logger.info("─── VaultGate KYC Oracle Service ───");
  logger.info({
    mockMode: config.MOCK_MODE,
    port: config.PORT,
    rpc: config.SOLANA_RPC_URL,
    programId: config.ACCESS_REGISTRY_PROGRAM_ID,
  }, "Configuration loaded");

  // ── Initialize Fastify ────────────────────────────────────────────────
  const fastify = Fastify({
    logger: false, // We use our own pino logger
    bodyLimit: 1_048_576, // 1MB — generous for webhook payloads
  });

  // Register raw body plugin — needed for webhook signature verification
  await fastify.register(rawBody, {
    field: "rawBody",
    global: true,
    encoding: "utf8",
    runFirst: true,
  });

  // ── Health endpoint ───────────────────────────────────────────────────
  fastify.get("/health", async (_req, reply) => {
    const queueStats = getQueueStats();
    const fireblocksOk = await checkFireblocksHealth();

    const healthy = fireblocksOk && queueStats.failed === 0;

    return reply.code(healthy ? 200 : 503).send({
      status: healthy ? "healthy" : "degraded",
      mockMode: config.MOCK_MODE,
      queue: queueStats,
      fireblocks: fireblocksOk ? "connected" : "unreachable",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // ── Register webhook routes ───────────────────────────────────────────
  await registerWebhookRoutes(fastify);

  // ── Start the queue processor ─────────────────────────────────────────
  startQueueProcessor();

  // ── Graceful shutdown ─────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down oracle service");
    stopQueueProcessor();
    await fastify.close();
    logger.info("Oracle service stopped");
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  // ── Start listening ───────────────────────────────────────────────────
  try {
    const address = await fastify.listen({
      port: config.PORT,
      host: "0.0.0.0",
    });
    logger.info(`Oracle service listening on ${address}`);
    logger.info("─── Ready to receive Fireblocks webhooks ───");

    if (config.MOCK_MODE) {
      logger.warn("⚠️  MOCK_MODE enabled — on-chain writes are simulated");
      logger.info(
        `Test endpoint: POST http://localhost:${config.PORT}/webhook/test`
      );
    }
  } catch (err) {
    logger.error({ err }, "Failed to start oracle service");
    process.exit(1);
  }
}

// ── Run ─────────────────────────────────────────────────────────────────
main().catch((err) => {
  console.error("Fatal error starting oracle:", err);
  process.exit(1);
});
