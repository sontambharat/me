'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/apiClient';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { StateBadge } from '@/components/ui/StateBadge';
import { useToast } from '@/components/ui/Toast';

export default function PagesPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const router = useRouter();
  const toast = useToast();
  const [pages, setPages] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    const [{ pages }, { templates }] = await Promise.all([
      api(`/sites/${siteId}/pages`),
      api(`/sites/${siteId}/templates`),
    ]);
    setPages(pages);
    setTemplates(templates);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, [siteId]);

  return (
    <div className="mx-auto max-w-5xl p-8">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pages</h1>
          <p className="mt-1 text-sm text-muted">Build and manage every page on this site.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Icon name="plus" size={16} /> New page
        </button>
      </header>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-16 animate-pulse" />
          ))}
        </div>
      ) : pages.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-subtle text-muted">
            <Icon name="pages" size={22} />
          </div>
          <p className="font-medium">No pages yet</p>
          <p className="mt-1 text-sm text-muted">Create your first page to start building.</p>
          <button className="btn btn-primary mt-4" onClick={() => setCreating(true)}>
            <Icon name="plus" size={16} /> New page
          </button>
        </div>
      ) : (
        <div className="card divide-y divide-line overflow-hidden">
          {pages.map((p) => (
            <div key={p.id} className="flex items-center gap-4 px-5 py-4 transition hover:bg-subtle/50">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link href={`/editor/${siteId}/${p.id}`} className="font-semibold hover:underline">
                    {p.title}
                  </Link>
                  <StateBadge state={p.state} />
                </div>
                <div className="mt-0.5 text-sm text-muted">
                  /{p.slug} · v{p.currentVersion?.version ?? '?'} · updated {new Date(p.updatedAt).toLocaleDateString()}
                </div>
              </div>
              <Link href={`/editor/${siteId}/${p.id}`} className="btn btn-sm">
                <Icon name="edit" size={15} /> Open builder
              </Link>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <NewPageModal
          templates={templates}
          onClose={() => setCreating(false)}
          onCreate={async (title, templateId) => {
            try {
              const { page } = await api(`/sites/${siteId}/pages`, { method: 'POST', body: { title, templateId } });
              toast('Page created', 'success');
              router.push(`/editor/${siteId}/${page.id}`);
            } catch (e) {
              toast((e as Error).message, 'error');
            }
          }}
        />
      )}
    </div>
  );
}

function NewPageModal({
  templates,
  onClose,
  onCreate,
}: {
  templates: any[];
  onClose: () => void;
  onCreate: (title: string, templateId: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  return (
    <Modal title="Create a new page" onClose={onClose}>
      {templates.length === 0 ? (
        <p className="text-sm text-muted">This site has no templates yet. Create one under Templates & Theme first.</p>
      ) : (
        <>
          <label className="label">Page title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Spring Campaign" autoFocus />
          <label className="label mt-4">Template</label>
          <div className="grid grid-cols-2 gap-2">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => setTemplateId(t.id)}
                className={`rounded-lg border p-3 text-left text-sm transition ${templateId === t.id ? 'border-brand ring-2 ring-brand/30' : 'hover:bg-subtle'}`}
              >
                <div className="flex items-center gap-2 font-medium">
                  <Icon name="template" size={16} /> {t.name}
                </div>
                <div className="mt-1 text-xs text-muted">{t.slots.join(' · ')}</div>
              </button>
            ))}
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={!title || !templateId} onClick={() => onCreate(title, templateId)}>
              Create & open builder
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
