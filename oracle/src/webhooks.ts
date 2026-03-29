/**
 * VaultGate Oracle — Webhook Handler
 *
 * Receives Fireblocks KYC status change events via POST /webhook/fireblocks.
 * Verifies ECDSA signature, validates payload, and enqueues events for
 * on-chain synchronization.
 *
 * Per AGENTS.md:
 * - "receives Fireblocks KYC status change events"
 * - Verifies ECDSA webhook signature before processing
 *
 * Per SKILLS.md:
 * - Uses crypto.createVerify("SHA512") with FIREBLOCKS_PUBLIC_KEY
 */

import { createVerify } from "crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getConfig } from "./config.js";
import { getLogger, logWebhookReceived } from "./logger.js";
import {
  FireblocksWebhookSchema,
  KYC_EXPIRY_SECONDS,
  type KycEvent,
} from "./types.js";
import { enqueue } from "./queue.js";
import { randomUUID } from "crypto";

// ── Signature Verification ──────────────────────────────────────────────

/**
 * Verify a Fireblocks webhook ECDSA signature.
 *
 * Fireblocks signs the raw request body with SHA512. The signature is
 * sent in the `fireblocks-signature` header as base64.
 */
export function verifyFireblocksWebhook(
  payload: string,
  signature: string,
  publicKey: string
): boolean {
  if (!publicKey) {
    getLogger().warn("No FIREBLOCKS_PUBLIC_KEY configured — skipping signature verification");
    return true; // Allow in dev mode without a key
  }

  try {
    const verify = createVerify("SHA512");
    verify.update(payload);
    return verify.verify(publicKey, signature, "base64");
  } catch (err) {
    getLogger().error({ err }, "Signature verification error");
    return false;
  }
}

// ── Route Registration ──────────────────────────────────────────────────

export async function registerWebhookRoutes(
  fastify: FastifyInstance
): Promise<void> {
  /**
   * POST /webhook/fireblocks
   *
   * Receives KYC status change events from Fireblocks.
   * Flow: verify signature → validate payload → enqueue for processing
   */
  fastify.post(
    "/webhook/fireblocks",
    async (
      req: FastifyRequest<{ Body: unknown }>,
      reply: FastifyReply
    ) => {
      const logger = getLogger();
      const config = getConfig();

      // ── Step 1: Verify webhook signature ────────────────────────────
      const signature = req.headers["fireblocks-signature"] as
        | string
        | undefined;

      if (!signature && config.FIREBLOCKS_PUBLIC_KEY) {
        logger.warn("Missing fireblocks-signature header");
        return reply.code(401).send({
          error: "Missing webhook signature",
        });
      }

      const rawBody =
        (req as any).rawBody || JSON.stringify(req.body);

      if (signature) {
        const isValid = verifyFireblocksWebhook(
          rawBody,
          signature,
          config.FIREBLOCKS_PUBLIC_KEY
        );

        if (!isValid) {
          logger.warn("Invalid Fireblocks webhook signature");
          return reply.code(401).send({
            error: "Invalid webhook signature",
          });
        }
      }

      // ── Step 2: Validate payload schema ─────────────────────────────
      const parseResult = FireblocksWebhookSchema.safeParse(req.body);

      if (!parseResult.success) {
        const errors = parseResult.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
        logger.warn({ errors }, "Invalid webhook payload");
        return reply.code(400).send({
          error: "Invalid payload",
          details: errors,
        });
      }

      const payload = parseResult.data;

      // ── Step 3: Log the webhook receipt ─────────────────────────────
      logWebhookReceived(
        payload.data.walletAddress,
        payload.data.status,
        !!signature
      );

      // ── Step 4: Create KYC event and enqueue ────────────────────────
      const now = Math.floor(Date.now() / 1000);
      const verifiedAt = payload.data.verifiedAt || now;

      const event: KycEvent = {
        eventId: randomUUID(),
        wallet: payload.data.walletAddress,
        status: payload.data.status,
        jurisdiction: payload.data.jurisdiction ?? "XX",
        tier: payload.data.tier ?? 2,
        verifiedAt,
        expiresAt: verifiedAt + KYC_EXPIRY_SECONDS,
        receivedAt: Date.now(),
        attempts: 0,
        synced: false,
      };

      enqueue(event);

      logger.info(
        {
          eventId: event.eventId,
          wallet: event.wallet,
          status: event.status,
        },
        "Webhook processed — event enqueued"
      );

      return reply.code(200).send({
        ok: true,
        eventId: event.eventId,
      });
    }
  );

  /**
   * POST /webhook/test
   *
   * Test endpoint that accepts a simplified payload without signature
   * verification. Only available in MOCK_MODE.
   */
  fastify.post(
    "/webhook/test",
    async (
      req: FastifyRequest<{ Body: unknown }>,
      reply: FastifyReply
    ) => {
      const config = getConfig();
      if (!config.MOCK_MODE) {
        return reply.code(404).send({ error: "Not found" });
      }

      const body = req.body as {
        walletAddress?: string;
        status?: string;
        jurisdiction?: string;
        tier?: number;
      };

      if (!body?.walletAddress) {
        return reply.code(400).send({
          error: "walletAddress is required",
        });
      }

      const now = Math.floor(Date.now() / 1000);
      const event: KycEvent = {
        eventId: randomUUID(),
        wallet: body.walletAddress,
        status: (body.status as KycEvent["status"]) || "APPROVED",
        jurisdiction: body.jurisdiction || "CH",
        tier: body.tier || 2,
        verifiedAt: now,
        expiresAt: now + KYC_EXPIRY_SECONDS,
        receivedAt: Date.now(),
        attempts: 0,
        synced: false,
      };

      enqueue(event);

      return reply.code(200).send({
        ok: true,
        eventId: event.eventId,
        message: "Test event enqueued",
      });
    }
  );
}
