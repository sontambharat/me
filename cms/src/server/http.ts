import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import type { SessionUser } from '@/lib/rbac';
import { AppError, unauthorized } from './errors';

export interface Ctx {
  req: NextRequest;
  params: Record<string, string>;
  user: SessionUser | null;
}

type Handler = (ctx: Ctx) => Promise<unknown> | unknown;

/** Wrap a route handler: resolves the session user and translates errors. */
export function route(fn: Handler) {
  return async (req: NextRequest, context: { params: Promise<Record<string, string>> }) => {
    try {
      const params = (await context.params) ?? {};
      const user = await getCurrentUser();
      const result = await fn({ req, params, user });
      if (result instanceof NextResponse || result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (err) {
      const e = err as AppError;
      const status = e instanceof AppError ? e.status : 500;
      if (status === 500) console.error('[api] unhandled:', err);
      return NextResponse.json(
        { error: e.message ?? 'Internal error', code: e.code ?? 'internal_error', details: e.details },
        { status },
      );
    }
  };
}

export function requireUser(user: SessionUser | null): SessionUser {
  if (!user) throw unauthorized();
  return user;
}

export async function body<T = any>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
