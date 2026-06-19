import { prisma } from '@/lib/prisma';
import { parseJson, toJson } from '@/lib/json';
import { hasPermission, type SessionUser } from '@/lib/rbac';
import { forbidden, validation } from './errors';

/** Public form submission (from a preview or published page). No auth. */
export async function submitForm(input: {
  siteId: string;
  pageId?: string;
  instanceId: string;
  formTitle?: string;
  data: Record<string, any>;
}) {
  if (!input.siteId || !input.instanceId) throw validation('Missing form context');
  return prisma.formSubmission.create({
    data: {
      siteId: input.siteId,
      pageId: input.pageId ?? null,
      instanceId: input.instanceId,
      formTitle: input.formTitle ?? '',
      data: toJson(input.data ?? {}),
    },
  });
}

export async function listSubmissions(user: SessionUser, siteId: string) {
  if (!hasPermission(user, 'form:read', siteId)) throw forbidden('Missing permission: form:read');
  const rows = await prisma.formSubmission.findMany({ where: { siteId }, orderBy: { createdAt: 'desc' }, take: 200 });
  return rows.map((r) => ({ ...r, data: parseJson<Record<string, any>>(r.data, {}) }));
}
