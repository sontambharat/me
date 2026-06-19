import { prisma } from '@/lib/prisma';
import { hasPermission, type SessionUser } from '@/lib/rbac';
import { putBlob, deleteBlob } from '@/lib/storage';
import { notFound, forbidden, validation } from './errors';

const MAX_BYTES = 8 * 1024 * 1024; // 8MB

export async function listAssets(user: SessionUser, siteId: string) {
  if (!hasPermission(user, 'asset:read', siteId)) throw forbidden('Missing permission: asset:read');
  const rows = await prisma.asset.findMany({ where: { siteId }, orderBy: { createdAt: 'desc' } });
  return rows.map((a) => ({ ...a, url: `/api/media/${a.storageKey}` }));
}

export async function uploadAsset(
  user: SessionUser,
  siteId: string,
  file: { name: string; mimeType: string; data: Buffer },
) {
  if (!hasPermission(user, 'asset:write', siteId)) throw forbidden('Missing permission: asset:write');
  if (!file?.data?.length) throw validation('Empty file');
  if (file.data.length > MAX_BYTES) throw validation('File exceeds 8MB limit');
  const { key } = await putBlob(siteId, file.name, file.data, file.mimeType);
  const asset = await prisma.asset.create({
    data: {
      siteId,
      name: file.name,
      mimeType: file.mimeType,
      size: file.data.length,
      storageKey: key,
      createdBy: user.id,
    },
  });
  return { ...asset, url: `/api/media/${asset.storageKey}` };
}

export async function deleteAsset(user: SessionUser, id: string) {
  const asset = await prisma.asset.findUnique({ where: { id } });
  if (!asset) throw notFound('Asset');
  if (!hasPermission(user, 'asset:write', asset.siteId)) throw forbidden('Missing permission: asset:write');
  await deleteBlob(asset.storageKey);
  await prisma.asset.delete({ where: { id } });
  return { ok: true };
}
