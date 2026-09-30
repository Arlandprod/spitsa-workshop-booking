import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircledIcon, GearIcon, CalendarIcon } from '@radix-ui/react-icons';
import { readState, subscribeChanges } from './db';
import { clockTime, dateKey, formatDay, getService, type Booking, type WorkshopState } from './domain';
import BookingForm from './components/BookingForm';
import BookingList from './components/BookingList';
import OwnerPanel from './components/OwnerPanel';
import { ErrorMessage } from './components/Shared';
import { registerTools } from './webmcp';

type View = 'book' | 'mine' | 'owner';
export default function App() {
  const [state, setState] = useState<WorkshopState>();
  const [failure, setFailure] = useState('');
  const [view, setView] = useState<View>('book');
  const [ownerEntered, setOwnerEntered] = useState(false);
  const [ownerDate, setOwnerDate] = useState(() => dateKey(Date.now()));
  const [now, setNow] = useState(Date.now());
  const [success, setSuccess] = useState<Booking>();
  const [rescheduling, setRescheduling] = useState<Booking>();
  const [returnView, setReturnView] = useState<View>('mine');
  const requestNumber = useRef(0);
  const successRef = useRef<HTMLDivElement>(null);
  const refresh = useCallback(async () => {
    const request = ++requestNumber.current;
    try { const latest = await readState(); if (request === requestNumber.current) { setState(latest); setFailure(''); } }
    catch (error) { if (request === requestNumber.current) setFailure(error instanceof Error ? error.message : 'Не удалось загрузить записи.'); }
  }, []);
  useEffect(() => { void refresh(); const unsubscribe = subscribeChanges(() => void refresh()); const timer = window.setInterval(() => { setNow(Date.now()); void refresh(); }, 30_000); return () => { unsubscribe(); window.clearInterval(timer); }; }, [refresh]);
  useEffect(() => { if (success) successRef.current?.focus(); }, [success]);
  useEffect(() => registerTools({ refresh, onBook: booking => { setSuccess(booking); setRescheduling(undefined); setView('mine'); } }), [refresh]);

  function navigate(next: View) { setView(next); setRescheduling(undefined); setSuccess(undefined); }
  function beginReschedule(booking: Booking) { setReturnView(view); setRescheduling(booking); setSuccess(undefined); setView('book'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function booked(booking: Booking) { setSuccess(booking); setView(rescheduling ? returnView : 'mine'); if (rescheduling && returnView === 'owner') setOwnerDate(dateKey(booking.start)); setRescheduling(undefined); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  const mine = state?.bookings.filter(booking => state.mineIds.includes(booking.id)) ?? [];
  const title = view === 'owner' ? 'Расписание мастерской' : view === 'mine' ? 'Ваши записи' : rescheduling ? 'Выберите новое время' : 'Вернём велосипед в строй.';

  return <div className="min-h-dvh"><a className="skip-link" href="#main">Перейти к содержимому</a><header className="site-header"><div className="page-container header-content"><a href="#" className="brand" onClick={event => { event.preventDefault(); navigate('book'); }} aria-label="Спица — записаться"><GearIcon className="size-8" aria-hidden="true" /><span>спица<span className="brand-sub">веломастерская</span></span></a><nav className="main-nav" aria-label="Главная навигация"><button aria-current={view === 'book' ? 'page' : undefined} onClick={() => navigate('book')}>Записаться</button><button aria-current={view === 'mine' ? 'page' : undefined} onClick={() => navigate('mine')}>Мои записи{mine.filter(booking => booking.status === 'confirmed' && booking.end > now).length > 0 && <span className="nav-count">{mine.filter(booking => booking.status === 'confirmed' && booking.end > now).length}</span>}</button><button aria-current={view === 'owner' ? 'page' : undefined} onClick={() => navigate('owner')}>Владельцу <span className="nav-demo">демо</span></button></nav></div></header>
    <main id="main" className="page-container pb-14"><div className="demo-banner mt-6"><span className="demo-tag">Учебное демо</span><p>Мастерская вымышленная. Записи локальные, без настоящих уведомлений и оплаты.</p></div><div className="page-intro"><div><p className="eyebrow">{view === 'owner' ? 'Кабинет владельца' : view === 'mine' ? 'Сохранено в этом браузере' : 'Запись на обслуживание'}</p><h1>{title}</h1>{view === 'book' && !rescheduling && <p className="text-muted max-w-lg leading-relaxed mt-4">Выберите работу и удобный интервал. Перенести или отменить визит можно здесь же.</p>}</div><div className="intro-note"><CalendarIcon className="size-5 text-accent" aria-hidden="true" /><span>Один мастер · без очереди<br /><strong>Все часы — московские</strong></span></div></div>
      {failure ? <div className="panel max-w-2xl"><ErrorMessage>{failure}</ErrorMessage><button className="button secondary mt-5" onClick={() => void refresh()}>Повторить загрузку</button></div> : !state ? <div className="skeleton-layout" role="status" aria-label="Загрузка локальных записей"><div className="skeleton h-64" /><div className="skeleton h-80" /></div> : <>
        {success && <div className="success-confirmation mb-8" role="status" tabIndex={-1} ref={successRef}><CheckCircledIcon className="size-7 shrink-0" aria-hidden="true" /><div><h2 className="font-bold text-xl">Запись подтверждена</h2><p className="mt-2">{getService(success.serviceId).name} · {formatDay(dateKey(success.start))} · {clockTime(success.start)}–{clockTime(success.end)} МСК</p><p className="helper mt-2">Код {success.id.slice(0, 8)}. Подтверждение сохранено в браузере; уведомления не отправлялись.</p></div></div>}
        {view === 'book' && <BookingForm key={rescheduling?.id ?? 'new'} state={state} now={now} refresh={refresh} onBooked={booked} rescheduling={rescheduling} onDismiss={() => { setView(returnView); setRescheduling(undefined); }} />}
        {view === 'mine' && <section className="max-w-3xl"><BookingList bookings={mine} now={now} refresh={refresh} onReschedule={beginReschedule} />{!mine.length && <button className="button primary mt-6" onClick={() => navigate('book')}>Выбрать услугу и время</button>}</section>}
        {view === 'owner' && <OwnerPanel state={state} now={now} date={ownerDate} onDateChange={setOwnerDate} entered={ownerEntered} onEnter={() => setOwnerEntered(true)} onExit={() => { setOwnerEntered(false); navigate('book'); }} refresh={refresh} onReschedule={beginReschedule} />}
      </>}
    </main><footer className="page-container footer"><span className="font-semibold">Спица · портфолио MVP</span><span>Пн — выходной · Вт–Сб 10:00–19:00 · Вс 11:00–16:00</span><span>Изменения часов — в демо-кабинете</span></footer>
  </div>;
}
