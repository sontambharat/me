'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { PageView } from '@/components/render/PageView';
import { Icon } from '@/components/ui/Icon';

export default function PreviewPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [annotate, setAnnotate] = useState(false);
  const [pin, setPin] = useState<{ x: number; y: number } | null>(null);
  const [name, setName] = useState('');
  const [bodyText, setBodyText] = useState('');
  const canvasRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const session = sessionStorage.getItem('pv_session') ?? '';
      const res = await fetch(`/api/preview/${token}${session ? `?session=${session}` : ''}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Preview unavailable');
      setData(body);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    load();
  }, [token]);

  async function submitForm(instanceId: string, formTitle: string, values: Record<string, any>) {
    await fetch(`/api/preview/${token}/forms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ instanceId, formTitle, data: values }),
    });
  }

  async function postComment() {
    if (!name.trim() || !bodyText.trim()) return;
    await fetch(`/api/preview/${token}/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, body: bodyText, pin, pageId: data.page.id }),
    });
    setBodyText('');
    setPin(null);
    setAnnotate(false);
    load();
  }

  if (error)
    return (
      <div className="grid min-h-screen place-items-center bg-slate-100">
        <div className="card max-w-sm p-8 text-center">
          <h1 className="text-lg font-semibold">Preview unavailable</h1>
          <p className="mt-2 text-sm text-muted">{error}</p>
        </div>
      </div>
    );
  if (!data) return <div className="grid min-h-screen place-items-center text-muted">Loading preview…</div>;

  const width = device === 'desktop' ? 'max-w-5xl' : device === 'tablet' ? 'max-w-2xl' : 'max-w-sm';
  const pinnedComments = data.comments.filter((c: any) => c.pin);

  return (
    <div className="flex h-screen">
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-12 items-center gap-3 border-b border-line bg-white px-4">
          <span className="font-semibold">{data.page.title}</span>
          <span className={`chip border-transparent state-${data.page.state}`}>{data.page.state.replace('_', ' ')}</span>
          <span className="ml-auto" />
          {(['desktop', 'tablet', 'mobile'] as const).map((d) => (
            <button key={d} className={`btn btn-sm ${device === d ? 'btn-primary' : ''}`} onClick={() => setDevice(d)}>
              {d}
            </button>
          ))}
          <button className={`btn btn-sm ${annotate ? 'btn-primary' : ''}`} onClick={() => setAnnotate((a) => !a)}>
            <Icon name="edit" size={14} /> {annotate ? 'Click the page…' : 'Annotate'}
          </button>
        </header>

        <div className="flex-1 overflow-auto bg-slate-100 p-6">
          <div className={`mx-auto overflow-hidden rounded-xl bg-white shadow-card ring-1 ring-slate-200 ${width}`}>
            <div
              ref={canvasRef}
              className={`relative ${annotate ? 'cursor-crosshair' : ''}`}
              onClick={(e) => {
                if (!annotate) return;
                const r = canvasRef.current!.getBoundingClientRect();
                setPin({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
              }}
            >
              <PageView content={data.content} ctx={data.ctx} onSubmitForm={submitForm} />
              {pinnedComments.map((c: any, i: number) => (
                <div key={c.id} className="absolute -ml-3 -mt-3 grid h-6 w-6 place-items-center rounded-full border-2 border-white bg-amber-400 text-xs font-bold text-slate-900 shadow" style={{ left: `${c.pin.x * 100}%`, top: `${c.pin.y * 100}%` }}>
                  {i + 1}
                </div>
              ))}
              {pin && (
                <div className="absolute -ml-3 -mt-3 grid h-6 w-6 place-items-center rounded-full border-2 border-white bg-brand text-xs text-white shadow" style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%`, background: 'rgb(var(--brand))' }}>
                  ★
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <aside className="flex w-80 flex-col border-l border-line bg-white">
        <div className="border-b border-line px-4 py-3 font-semibold">Feedback</div>
        <div className="border-b border-line p-4">
          {pin && <div className="mb-2 chip border-transparent state-in_review">📍 Pin placed</div>}
          <input className="input mb-2" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
          <textarea className="input mb-2" rows={3} placeholder="Leave a comment…" value={bodyText} onChange={(e) => setBodyText(e.target.value)} />
          <button className="btn btn-primary w-full" onClick={postComment}>
            Send feedback
          </button>
          <p className="mt-2 text-xs text-muted">Tip: click “Annotate”, then click the page to pin your comment to a spot.</p>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {data.comments.length === 0 && <p className="text-sm text-muted">No feedback yet.</p>}
          {data.comments.map((c: any, i: number) => (
            <div key={c.id} className="card p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {c.pin ? `${pinnedComments.indexOf(c) + 1}. ` : ''}
                  {c.authorName}
                </span>
                <span className={`chip border-transparent state-${c.state === 'resolved' ? 'published' : 'in_review'}`}>{c.state}</span>
              </div>
              <p className="mt-1 text-sm text-slate-600">{c.body}</p>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
