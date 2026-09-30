import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CalendarIcon, ClockIcon, CheckCircledIcon } from '@radix-ui/react-icons';
import { addDays, availableSlots, clockTime, dateKey, formatDay, formatMoney, getService, HORIZON_DAYS, scheduleFor, SERVICES, type Booking, type ServiceId, type WorkshopState } from '../domain';
import { createBooking, rescheduleBooking } from '../db';
import { EmptyState, ErrorMessage } from './Shared';

function firstAvailable(state: WorkshopState, serviceId: ServiceId, now: number, excludeId?: string) {
  const today = dateKey(now);
  for (let offset = 0; offset <= HORIZON_DAYS; offset++) { const date = addDays(today, offset); if (availableSlots(state, serviceId, date, now, excludeId).length) return date; }
  return today;
}

export default function BookingForm({ state, now, refresh, onBooked, rescheduling, onDismiss }: {
  state: WorkshopState; now: number; refresh: () => Promise<void>; onBooked: (booking: Booking) => void; rescheduling?: Booking; onDismiss?: () => void;
}) {
  const [serviceId, setServiceId] = useState<ServiceId>(rescheduling?.serviceId ?? 'diagnostics');
  const [date, setDate] = useState(() => rescheduling ? dateKey(rescheduling.start) : firstAvailable(state, serviceId, now));
  const [start, setStart] = useState<number | undefined>();
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const service = getService(serviceId);
  const today = dateKey(now);
  const days = Array.from({ length: 7 }, (_, index) => addDays(today, index));
  const slots = useMemo(() => availableSlots(state, serviceId, date, now, rescheduling?.id), [state, serviceId, date, now, rescheduling?.id]);
  const schedule = scheduleFor(state, date);
  useEffect(() => {
    if (start !== undefined && !slots.includes(start)) { setStart(undefined); setError('Выбранное время стало недоступно. Выберите новый интервал.'); }
  }, [slots, start]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (start === undefined) { setError('Выберите доступное время.'); return; }
    if (!rescheduling && !consent) { setError('Подтвердите использование вымышленных данных.'); return; }
    setBusy(true);
    try {
      const booking = rescheduling
        ? await rescheduleBooking(rescheduling.id, rescheduling.version, start)
        : await createBooking({ serviceId, start, name, note });
      await refresh(); onBooked(booking);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Запись не сохранена. Повторите попытку.'); await refresh(); }
    finally { setBusy(false); }
  }
  function changeDate(value: string) { if (!value) return; setDate(value); setStart(undefined); setError(''); }

  return <form onSubmit={submit} className="booking-layout">
    <div className="space-y-9 min-w-0">
      {rescheduling ? <section className="panel border-accent/30 bg-accent-soft"><p className="eyebrow">Перенос записи</p><h2 className="mt-2">{service.name}</h2><p className="text-muted mt-3">Сейчас: {formatDay(dateKey(rescheduling.start))}, {clockTime(rescheduling.start)}–{clockTime(rescheduling.end)}. Исходный интервал сохранится, пока вы не подтвердите новый.</p><button type="button" className="text-button mt-4" onClick={onDismiss}>Отменить перенос</button></section>
        : <fieldset><legend className="section-heading"><span className="step-number">01</span> Что нужно сделать</legend><div className="service-list">{SERVICES.map(item => <label key={item.id} className={`service-option ${serviceId === item.id ? 'selected' : ''}`}>
          <input className="choice-input" type="radio" name="service" value={item.id} checked={serviceId === item.id} onChange={() => { setServiceId(item.id); setStart(undefined); setError(''); }} />
          <span className="radio-dot" aria-hidden="true" /><span className="min-w-0 flex-1"><span className="block font-bold">{item.name}</span><span className="block text-sm text-muted mt-1 leading-relaxed">{item.description}</span></span><span className="service-price"><strong>{formatMoney(item.price)}</strong><span>{item.duration} мин</span></span>
        </label>)}</div><p className="helper mt-3">Демонстрационные цены за работу. Запчасти не включены.</p></fieldset>}

      <section aria-labelledby="time-heading"><h2 id="time-heading" className="section-heading"><span className="step-number">{rescheduling ? '01' : '02'}</span> Когда привезёте велосипед</h2>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4"><span className="text-sm text-muted flex items-center gap-2"><CalendarIcon aria-hidden="true" /> Ближайшие 21 день</span><label className="flex items-center gap-2 text-sm">Другая дата<input type="date" className="input w-auto" aria-label="Выберите дату" min={today} max={addDays(today, HORIZON_DAYS)} value={date} required onChange={event => changeDate(event.target.value)} /></label></div>
        <div className="date-strip" aria-label="Ближайшие даты">{days.map(day => <button type="button" key={day} aria-pressed={date === day} aria-label={formatDay(day)} className={`date-button ${date === day ? 'selected' : ''}`} onClick={() => changeDate(day)}><span>{formatDay(day, true).split(',')[0]}</span><strong>{Number(day.slice(-2))}</strong><span>{day === today ? 'сегодня' : scheduleFor(state, day).closed ? 'выходной' : 'открыто'}</span></button>)}</div>
        <fieldset className="mt-6"><legend className="text-sm font-semibold mb-3 flex items-center gap-2"><ClockIcon aria-hidden="true" /> Время начала · Москва, UTC+3</legend>
          {slots.length ? <div className="slot-grid">{slots.map(slot => <label key={slot} className={`slot ${start === slot ? 'selected' : ''}`}><input className="choice-input" type="radio" name="slot" aria-label={clockTime(slot)} checked={start === slot} onChange={() => { setStart(slot); setError(''); }} /><span>{clockTime(slot)}</span></label>)}</div>
            : <EmptyState title={schedule.closed ? 'В этот день мастерская закрыта' : 'Свободных интервалов нет'}>Выберите другую дату или услугу короче по времени. Запись открывается минимум за час до начала.</EmptyState>}
        </fieldset>
        <p className="helper mt-4">{schedule.closed ? 'Выходной' : `Работаем ${schedule.open}–${schedule.close}${schedule.breakStart ? `, перерыв ${schedule.breakStart}–${schedule.breakEnd}` : ''}`}. Один мастер, один велосипед за раз.</p>
      </section>

      {!rescheduling && <section><h2 className="section-heading"><span className="step-number">03</span> Детали записи</h2><div className="space-y-5"><label className="field"><span>Демо-имя <span className="text-muted">*</span></span><input className="input" name="name" autoComplete="off" minLength={2} maxLength={40} required placeholder="Например, Гость демо" value={name} onChange={event => setName(event.target.value)} /><span className="helper">Только вымышленное имя. Телефон и почта не нужны.</span></label><label className="field"><span>Что происходит с велосипедом <span className="font-normal text-muted">· необязательно</span></span><textarea className="input resize-y min-h-24" name="note" maxLength={240} placeholder="Например, задний тормоз скрипит" value={note} onChange={event => setNote(event.target.value)} /><span className="helper">{note.length}/240 · Без личных данных.</span></label><label className="flex items-start gap-3 text-sm leading-relaxed"><input className="mt-1 accent-accent" type="checkbox" checked={consent} required onChange={event => setConsent(event.target.checked)} /><span>Использую вымышленные данные и понимаю, что это учебная запись.</span></label></div></section>}
    </div>

    <aside className="booking-aside"><div className="summary-panel"><p className="eyebrow">{rescheduling ? 'Новый интервал' : 'Ваша запись'}</p><h2 className="mt-4 text-xl leading-snug">{service.name}</h2><dl className="summary-list"><div><dt>Длительность</dt><dd>{service.duration} минут</dd></div><div><dt>Стоимость работы</dt><dd>{formatMoney(service.price)}</dd></div><div><dt>Дата</dt><dd>{formatDay(date, true)}</dd></div><div><dt>Время</dt><dd>{start === undefined ? 'Выберите интервал' : `${clockTime(start)}–${clockTime(start + service.duration * 60_000)}`}</dd></div></dl>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      <button className="button primary w-full mt-6" type="submit" disabled={busy || start === undefined}>{busy ? 'Сохраняем…' : rescheduling ? 'Подтвердить перенос' : 'Подтвердить запись'}</button>
      <p className="helper mt-4 flex gap-2"><CheckCircledIcon className="shrink-0 mt-0.5" aria-hidden="true" /> Подтверждение появится сразу. SMS, писем и платежей здесь нет.</p>
      <div className="border-t border-line mt-6 pt-5"><p className="font-semibold text-sm">Запись остаётся в этом браузере</p><p className="helper mt-2">После подтверждения её можно перенести или отменить в разделе «Мои записи».</p></div>
    </div></aside>
  </form>;
}
