import { prisma } from '@/lib/prisma';
import { toJson } from '@/lib/json';

/**
 * Notification outbox. No real mail provider in the sandbox — messages are
 * persisted and logged. Swap `deliver` for Resend/Postmark/Azure Communication
 * Services in production.
 */
export async function sendNotification(input: {
  to: string;
  subject: string;
  body: string;
  kind: string;
  meta?: Record<string, any>;
}) {
  const msg = await prisma.outbox.create({
    data: { to: input.to, subject: input.subject, body: input.body, kind: input.kind, meta: toJson(input.meta ?? {}) },
  });
  console.log(`[outbox] → ${msg.to}: ${msg.subject}`);
  return msg;
}
