import { useState } from 'react';
import { CalendarIcon, ClockIcon, CheckCircledIcon } from '@radix-ui/react-icons';
import { clockTime, dateKey, formatDay, formatMoney, getService, type Booking } from '../domain';
import { cancelBooking } from '../db';
import { ConfirmDialog, EmptyState, ErrorMessage } from './Shared';

export default function BookingList({ bookings, now, owner = false, refresh, onReschedule }: {
  bookings: Booking[]; now: number; owner?: boolean; refresh: () => Promise<void>; onReschedule: (booking: Booking) => void;
}) {
  const [cancelling, setCancelling] = useState<Booking>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function confirmCancel() {
    if (!cancelling) return;
    setBusy(true); setError('');
    try { await cancelBooking(cancelling.id, cancelling.version); setCancelling(undefined); await refresh(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Не удалось отменить запись.'); setCancelling(undefined); await refresh(); }
    finally { setBusy(false); }
  }
  return <div>{error && <div className="mb-5"><ErrorMessage>{error}</ErrorMessage></div>}
    {!bookings.length ? <EmptyState title={owner ? 'На этот день записей нет' : 'Вы ещё не записались'}>{owner ? 'Новые записи появятся здесь после подтверждения. Можно изменить часы работы этого дня.' : 'Выберите услугу и свободный интервал в разделе «Записаться».'}</EmptyState>
      : <div className="booking-list">{[...bookings].sort((a, b) => a.start - b.start).map(booking => {
        const service = getService(booking.serviceId);
        const ended = booking.end <= now;
        const active = booking.status === 'confirmed' && booking.start > now;
        const status = booking.status === 'cancelled' ? 'Отменена' : ended ? 'Прошедшая' : booking.start <= now ? 'Сейчас в расписании' : 'Подтверждена';
        return <article key={booking.id} className="booking-item" data-testid={`booking-${booking.id}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><span className={`status ${booking.status === 'cancelled' || ended ? 'neutral' : ''}`}><CheckCircledIcon aria-hidden="true" />{status}</span><h3 className="font-bold text-lg mt-3">{service.name}</h3><p className="text-sm text-muted mt-1">{owner ? booking.name : 'Запись из этого браузера'} · {booking.source === 'seed' ? 'Демо-данные' : `Код ${booking.id.slice(0, 8)}`}</p></div><span className="font-semibold tabular-nums">{formatMoney(service.price)}</span></div><div className="flex flex-wrap gap-x-6 gap-y-2 mt-5 text-sm font-semibold"><span className="flex items-center gap-2"><CalendarIcon aria-hidden="true" />{formatDay(dateKey(booking.start))}</span><span className="flex items-center gap-2"><ClockIcon aria-hidden="true" />{clockTime(booking.start)}–{clockTime(booking.end)} · МСК</span></div>
        {booking.note && <p className="text-sm text-muted mt-3 whitespace-pre-wrap break-words">{booking.note}</p>}
        {active && <div className="flex gap-3 mt-5"><button className="button secondary small" onClick={() => onReschedule(booking)}>Перенести</button><button className="text-button danger-text" onClick={() => { setError(''); setCancelling(booking); }}>Отменить запись</button></div>}
      </article>; })}</div>}
    {cancelling && <ConfirmDialog title="Отменить эту запись?" confirmText="Да, отменить запись" busy={busy} onConfirm={() => void confirmCancel()} onClose={() => setCancelling(undefined)}><p>{getService(cancelling.serviceId).name}, {formatDay(dateKey(cancelling.start))}, {clockTime(cancelling.start)}. Интервал сразу станет доступен для новой записи.</p></ConfirmDialog>}
  </div>;
}
