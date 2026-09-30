import { useEffect, useState, type FormEvent } from 'react';
import { LockOpen1Icon, ReloadIcon } from '@radix-ui/react-icons';
import { addDays, dateKey, formatDay, HORIZON_DAYS, scheduleFor, type Booking, type DaySchedule, type WorkshopState } from '../domain';
import { resetDemo, restoreSchedule, saveSchedule } from '../db';
import BookingList from './BookingList';
import { ConfirmDialog, ErrorMessage } from './Shared';

export default function OwnerPanel({ state, now, date, onDateChange, entered, onEnter, onExit, refresh, onReschedule }: {
  state: WorkshopState; now: number; date: string; onDateChange: (date: string) => void; entered: boolean; onEnter: () => void; onExit: () => void; refresh: () => Promise<void>; onReschedule: (booking: Booking) => void;
}) {
  const [schedule, setSchedule] = useState<DaySchedule>(() => scheduleFor(state, date));
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  useEffect(() => { setSchedule({ ...scheduleFor(state, date) }); }, [state.revision, date]);
  const bookings = state.bookings.filter(booking => dateKey(booking.start) === date);
  const confirmed = bookings.filter(booking => booking.status === 'confirmed');
  const occupiedMinutes = confirmed.reduce((sum, booking) => sum + (booking.end - booking.start) / 60_000, 0);
  async function act(action: () => Promise<unknown>, success: string) {
    setBusy(true); setError(''); setMessage('');
    try { await action(); await refresh(); setMessage(success); setResetting(false); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Изменение не сохранено.'); await refresh(); setResetting(false); }
    finally { setBusy(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void act(() => saveSchedule(date, schedule), 'Расписание сохранено. Свободные интервалы обновлены.'); }
  function update(key: keyof DaySchedule, value: string | boolean) { setSchedule(current => ({ ...current, [key]: value })); setMessage(''); setError(''); }

  if (!entered) return <section className="demo-entry"><LockOpen1Icon className="size-8 text-accent" aria-hidden="true" /><p className="eyebrow mt-7">Режим владельца</p><h2 className="text-3xl mt-3">Посмотрите на день<br />изнутри мастерской.</h2><p className="text-muted leading-relaxed mt-5 max-w-lg">Здесь можно увидеть записи, изменить часы работы и перенести визит. Демо-вход доступен каждому, без пароля и проверки личности. Это не настоящая авторизация.</p><button className="button primary mt-7" onClick={onEnter}>Войти в демо-кабинет</button><p className="helper mt-4">Данные принадлежат только этому браузеру. Реальные данные клиентов не вводите.</p></section>;
  return <div><div className="demo-banner mb-7 flex-wrap"><span><strong>Демо-доступ открыт.</strong> Каждый посетитель может войти. Изменения сохраняются только в этом браузере.</span><button className="text-button shrink-0" onClick={onExit}>Выйти из демо</button></div>
    <div className="flex flex-wrap justify-between items-end gap-4 mb-7"><div><p className="eyebrow">День мастерской</p><h2 className="text-2xl mt-2 capitalize">{formatDay(date)}</h2></div><label className="field"><span>Дата расписания</span><input type="date" className="input" required aria-label="Дата расписания" min={dateKey(now)} max={addDays(dateKey(now), HORIZON_DAYS)} value={date} onChange={event => { if (event.target.value) { onDateChange(event.target.value); setError(''); setMessage(''); } }} /></label></div>
    <div className="grid grid-cols-2 gap-4 mb-8 max-w-xl"><div className="metric"><span className="text-muted text-sm">Подтверждённых записей</span><strong>{confirmed.length}</strong></div><div className="metric"><span className="text-muted text-sm">Занято работой</span><strong>{occupiedMinutes}<span className="text-base ml-2">мин</span></strong></div></div>
    <div className="owner-layout"><section><h3 className="section-heading">Записи на этот день</h3><BookingList bookings={bookings} now={now} owner refresh={refresh} onReschedule={onReschedule} /></section>
      <aside><form onSubmit={submit} className="panel"><div className="flex justify-between items-center gap-3"><h3 className="font-bold text-lg">Часы работы</h3><span className="text-xs text-muted">{state.overrides[date] ? 'Особый день' : 'По умолчанию'}</span></div><p className="helper mt-2 mb-5">Изменяется только {formatDay(date, true)}. Время московское, шаг 30 минут.</p><label className="flex gap-3 items-center text-sm font-semibold mb-5"><input type="checkbox" checked={schedule.closed} onChange={event => update('closed', event.target.checked)} className="accent-accent" />Выходной день</label>
        <fieldset disabled={schedule.closed || busy} className="grid grid-cols-2 gap-4"><label className="field"><span>Открытие</span><input className="input" type="time" step="1800" required value={schedule.open} onChange={event => update('open', event.target.value)} /></label><label className="field"><span>Закрытие</span><input className="input" type="time" step="1800" required value={schedule.close} onChange={event => update('close', event.target.value)} /></label><label className="field"><span>Перерыв с</span><input className="input" type="time" step="1800" value={schedule.breakStart} onChange={event => update('breakStart', event.target.value)} /></label><label className="field"><span>Перерыв до</span><input className="input" type="time" step="1800" value={schedule.breakEnd} onChange={event => update('breakEnd', event.target.value)} /></label></fieldset>
        <p className="helper mt-3">Без перерыва: очистите оба поля. Записи нельзя перекрыть изменением расписания.</p>{error && <div className="mt-4"><ErrorMessage>{error}</ErrorMessage></div>}{message && <p className="success-box mt-4" role="status">{message}</p>}<button className="button primary w-full mt-5" disabled={busy} type="submit">{busy ? 'Сохраняем…' : 'Сохранить расписание'}</button><button className="text-button w-full mt-4" type="button" disabled={busy || !state.overrides[date]} onClick={() => void act(() => restoreSchedule(date), 'Восстановлено стандартное расписание.')}>Вернуть стандартные часы</button>
      </form><div className="border-t border-line mt-6 pt-6"><h3 className="font-semibold text-sm">Начать демо заново</h3><p className="helper mt-2">Удалит записи и особые часы только этого демо. Создаст три вымышленные записи на ближайшие рабочие дни.</p><button className="button secondary small mt-4" onClick={() => setResetting(true)} disabled={busy}><ReloadIcon aria-hidden="true" />Сбросить демо-данные</button></div></aside>
    </div>{resetting && <ConfirmDialog title="Начать демо заново?" confirmText="Сбросить данные" busy={busy} onConfirm={() => void act(() => resetDemo(), 'Демо сброшено. Созданы три вымышленные записи.')} onClose={() => setResetting(false)}>Все записи и изменения расписания этой веломастерской в данном браузере будут заменены начальными примерами.</ConfirmDialog>}
  </div>;
}
