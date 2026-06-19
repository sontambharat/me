'use client';
import { Icon } from './Icon';

export function Modal({
  title,
  onClose,
  children,
  width = 'max-w-lg',
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className={`card w-full ${width} shadow-pop`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="btn btn-ghost btn-sm">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
