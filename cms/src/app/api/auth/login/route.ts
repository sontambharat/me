import { NextResponse } from 'next/server';
import { route, body } from '@/server/http';
import { login, SESSION_COOKIE } from '@/lib/auth';
import { AppError } from '@/server/errors';

export const POST = route(async ({ req }) => {
  const { email, password } = await body<{ email: string; password: string }>(req);
  const result = await login(email, password);
  if (!result) throw new AppError('Invalid email or password', 401, 'unauthorized');
  const res = NextResponse.json({ user: result.user });
  res.cookies.set(SESSION_COOKIE, result.token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 12,
  });
  return res;
});
