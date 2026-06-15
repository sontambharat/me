import { randomUUID, randomBytes } from 'node:crypto';

/** RFC 4122 v4 UUID — used for all entity ids. */
export function uuid() {
  return randomUUID();
}

/** URL-safe opaque token, used for shareable preview links. */
export function token(bytes = 24) {
  return randomBytes(bytes).toString('base64url');
}

/** Short, human-scannable id fragment for logs. */
export function shortId() {
  return randomBytes(4).toString('hex');
}
