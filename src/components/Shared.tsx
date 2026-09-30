import { useEffect, useRef, type ReactNode } from 'react';
import { ExclamationTriangleIcon, Cross2Icon } from '@radix-ui/react-icons';

export function ErrorMessage({ children }: { children: ReactNode }) {
  return <div className="error-box" role="alert"><ExclamationTriangleIcon aria-hidden="true" /><span>{children}</span></div>;
}
export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return <div className="empty-state"><h3>{title}</h3><p>{children}</p></div>;
}
export function ConfirmDialog({ title, children, confirmText, busy, onConfirm, onClose }: {
  title: string; children: ReactNode; confirmText: string; busy: boolean; onConfirm: () => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="confirm-dialog" aria-labelledby="confirm-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <button className="icon-button absolute right-4 top-4" aria-label="Закрыть подтверждение" disabled={busy} onClick={onClose}><Cross2Icon /></button>
    <p className="eyebrow">Подтверждение действия</p>
    <h2 id="confirm-title">{title}</h2>
    <div className="text-muted my-5">{children}</div>
    <div className="flex flex-wrap justify-end gap-3"><button className="button secondary" disabled={busy} onClick={onClose}>Вернуться</button><button className="button danger" disabled={busy} onClick={onConfirm}>{busy ? 'Сохраняем…' : confirmText}</button></div>
  </dialog>;
}
