import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { uuid, token } from '../core/ids.js';
import { AuthError, ValidationError } from '../core/errors.js';
import { ROLES } from './rbac.js';

const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12h

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password, stored) {
  const [salt, derived] = stored.split(':');
  const expected = Buffer.from(derived, 'hex');
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export class AuthService {
  constructor(store) {
    this.store = store;
  }

  createUser({ email, password, name, roles = [] }) {
    if (!email || !password) throw new ValidationError('email and password are required');
    if (this.store.findOne('users', (u) => u.email === email)) {
      throw new ValidationError('A user with that email already exists');
    }
    for (const r of roles) {
      if (!ROLES.includes(r.role)) throw new ValidationError(`Unknown role: ${r.role}`);
    }
    const now = new Date().toISOString();
    const user = {
      id: uuid(),
      email,
      name: name ?? email,
      passwordHash: hashPassword(password),
      roles, // [{ role, siteId|null }]
      createdAt: now,
      updatedAt: now,
    };
    return this.store.insert('users', user);
  }

  login(email, password) {
    const user = this.store.findOne('users', (u) => u.email === email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new AuthError('Invalid email or password');
    }
    const session = {
      id: uuid(),
      token: token(),
      userId: user.id,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    };
    this.store.insert('sessions', session);
    return { token: session.token, user: publicUser(user) };
  }

  logout(tok) {
    const session = this.store.findOne('sessions', (s) => s.token === tok);
    if (session) this.store.remove('sessions', session.id);
  }

  /** Resolve a bearer token to a user, or null. Expired sessions are pruned. */
  userForToken(tok) {
    if (!tok) return null;
    const session = this.store.findOne('sessions', (s) => s.token === tok);
    if (!session) return null;
    if (new Date(session.expiresAt) < new Date()) {
      this.store.remove('sessions', session.id);
      return null;
    }
    return this.store.byId('users', session.userId);
  }
}

export function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  return rest;
}
