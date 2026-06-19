import { cookies } from 'next/headers';
import { randomBytes } from 'node:crypto';
import { prisma } from './prisma';
import { verifyPassword } from './password';
import type { Role, SessionUser } from './rbac';

export const SESSION_COOKIE = 'cms_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12h

export async function login(email: string, password: string): Promise<{ token: string; user: SessionUser } | null> {
  const user = await prisma.user.findUnique({ where: { email }, include: { roles: true } });
  if (!user || !verifyPassword(password, user.passwordHash)) return null;
  const token = randomBytes(24).toString('base64url');
  await prisma.session.create({
    data: { token, userId: user.id, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });
  return { token, user: toSessionUser(user) };
}

export async function logout(token: string | undefined) {
  if (!token) return;
  await prisma.session.deleteMany({ where: { token } });
}

/** Resolve the current request's user from the session cookie, or null. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return userForToken(token);
}

export async function userForToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { token }, include: { user: { include: { roles: true } } } });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return toSessionUser(session.user);
}

function toSessionUser(user: { id: string; email: string; name: string; roles: { role: string; siteId: string | null }[] }): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    roles: user.roles.map((r) => ({ role: r.role as Role, siteId: r.siteId })),
  };
}
