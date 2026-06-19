'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/apiClient';
import { Icon } from '@/components/ui/Icon';

export default function FormsPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const [subs, setSubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api(`/sites/${siteId}/submissions`).then(({ submissions }) => {
      setSubs(submissions);
      setLoading(false);
    });
  }, [siteId]);

  return (
    <div className="mx-auto max-w-4xl p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Form Submissions</h1>
        <p className="mt-1 text-sm text-muted">Entries captured by Form widgets across this site.</p>
      </header>

      {loading ? (
        <div className="card h-32 animate-pulse" />
      ) : subs.length === 0 ? (
        <div className="card flex flex-col items-center py-16 text-center text-muted">
          <Icon name="forms" size={26} />
          <p className="mt-2 text-sm">No submissions yet. Submit a form from a live preview to see it here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {subs.map((s) => (
            <div key={s.id} className="card p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium">{s.formTitle || 'Form'}</span>
                <span className="text-xs text-muted">{new Date(s.createdAt).toLocaleString()}</span>
              </div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                {Object.entries(s.data).map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <dt className="text-muted">{k}:</dt>
                    <dd className="font-medium">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
