import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Media storage abstraction for the Media Library / DAM.
 *
 * Production uses Azure Blob Storage (set AZURE_STORAGE_CONNECTION_STRING).
 * When that env var is absent — e.g. in the sandbox — uploads fall back to the
 * local `./storage` directory so the feature is fully functional without any
 * cloud credentials. Both backends expose the same put/get/delete interface.
 */
export interface StoredBlob {
  key: string;
  url: string; // app URL used by <img>; resolves through /api/media/[...key]
}

interface StorageBackend {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ data: Buffer; contentType: string } | null>;
  delete(key: string): Promise<void>;
}

class LocalStorage implements StorageBackend {
  private root = join(process.cwd(), 'storage');

  private path(key: string) {
    return join(this.root, key);
  }

  async put(key: string, data: Buffer, contentType: string) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
    await writeFile(`${p}.meta`, contentType);
  }

  async get(key: string) {
    try {
      const p = this.path(key);
      const data = await readFile(p);
      const contentType = await readFile(`${p}.meta`, 'utf8').catch(() => 'application/octet-stream');
      return { data, contentType };
    } catch {
      return null;
    }
  }

  async delete(key: string) {
    const p = this.path(key);
    await unlink(p).catch(() => {});
    await unlink(`${p}.meta`).catch(() => {});
  }
}

class AzureStorage implements StorageBackend {
  private containerName = process.env.AZURE_STORAGE_CONTAINER || 'cms-media';
  private connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING!;
  private container: import('@azure/storage-blob').ContainerClient | null = null;

  private async client() {
    if (this.container) return this.container;
    const { BlobServiceClient } = await import('@azure/storage-blob');
    const svc = BlobServiceClient.fromConnectionString(this.connectionString);
    const container = svc.getContainerClient(this.containerName);
    await container.createIfNotExists();
    this.container = container;
    return container;
  }

  async put(key: string, data: Buffer, contentType: string) {
    const c = await this.client();
    await c.getBlockBlobClient(key).uploadData(data, { blobHTTPHeaders: { blobContentType: contentType } });
  }

  async get(key: string) {
    const c = await this.client();
    const blob = c.getBlockBlobClient(key);
    if (!(await blob.exists())) return null;
    const dl = await blob.download();
    const chunks: Buffer[] = [];
    for await (const chunk of dl.readableStreamBody as NodeJS.ReadableStream) {
      chunks.push(Buffer.from(chunk));
    }
    return { data: Buffer.concat(chunks), contentType: dl.contentType || 'application/octet-stream' };
  }

  async delete(key: string) {
    const c = await this.client();
    await c.getBlockBlobClient(key).deleteIfExists();
  }
}

const backend: StorageBackend = process.env.AZURE_STORAGE_CONNECTION_STRING
  ? new AzureStorage()
  : new LocalStorage();

export const storageBackend = process.env.AZURE_STORAGE_CONNECTION_STRING ? 'azure' : 'local';

export async function putBlob(siteId: string, filename: string, data: Buffer, contentType: string): Promise<StoredBlob> {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `${siteId}/${randomUUID()}-${safe}`;
  await backend.put(key, data, contentType);
  return { key, url: `/api/media/${key}` };
}

export async function getBlob(key: string) {
  return backend.get(key);
}

export async function deleteBlob(key: string) {
  return backend.delete(key);
}
