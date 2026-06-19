'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/apiClient';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

export function VersionsPanel({
  pageId,
  currentVersionId,
  onClose,
  onRestored,
}: {
  pageId: string;
  currentVersionId: string;
  onClose: () => void;
  onRestored: () => void;
}) {
  const toast = useToast();
  const [versions, setVersions] = useState<any[]>([]);

  useEffect(() => {
    api(`/pages/${pageId}/versions`).then(({ versions }) => setVersions(versions));
  }, [pageId]);

  return (
    <Modal title="Revision history" onClose={onClose}>
      <div className="space-y-2">
        {versions.map((v) => {
          const current = v.id === currentVersionId;
          return (
            <div key={v.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  v{v.version}
                  {current && <span className="chip border-transparent state-published">current</span>}
                  <span className="font-normal text-muted">{v.note}</span>
                </div>
                <div className="text-xs text-muted">{new Date(v.createdAt).toLocaleString()}</div>
              </div>
              {!current && (
                <button
                  className="btn btn-sm"
                  onClick={async () => {
                    await api(`/pages/${pageId}/versions/${v.id}/restore`, { method: 'POST' });
                    toast(`Restored v${v.version}`, 'success');
                    onRestored();
                  }}
                >
                  Restore
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
