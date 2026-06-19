import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { route } from '@/server/http';
import { logout, SESSION_COOKIE } from '@/lib/auth';

export const POST = route(async () => {
  const store = await cookies();
  await logout(store.get(SESSION_COOKIE)?.value);
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
});
