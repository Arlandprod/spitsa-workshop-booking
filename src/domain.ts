export const TIME_ZONE = 'Europe/Moscow';
export const HORIZON_DAYS = 21;
export const LEAD_MINUTES = 60;
export const SLOT_STEP = 30;
const MINUTE = 60_000;

export const SERVICES = [
  { id: 'diagnostics', name: 'Диагностика велосипеда', duration: 30, price: 600, description: 'Проверим тормоза, трансмиссию и колёса. Обсудим, что требует ремонта.' },
  { id: 'brakes', name: 'Настройка тормозов', duration: 60, price: 1400, description: 'Настроим ход ручек и положение колодок, проверим торможение.' },
  { id: 'transmission', name: 'Настройка переключения', duration: 60, price: 1600, description: 'Уберём неточное переключение, проверим тросы, цепь и переключатели.' },
  { id: 'maintenance', name: 'Базовое обслуживание', duration: 90, price: 2900, description: 'Настройка тормозов и переключения, протяжка узлов и смазка цепи.' },
] as const;
export type ServiceId = typeof SERVICES[number]['id'];
export type DaySchedule = { closed: boolean; open: string; close: string; breakStart: string; breakEnd: string };
export type Booking = {
  id: string; serviceId: ServiceId; start: number; end: number; name: string; note: string;
  status: 'confirmed' | 'cancelled'; source: 'seed' | 'visitor'; version: number; createdAt: number; updatedAt: number;
};
export type WorkshopState = { key: 'workshop'; seedVersion: 1; bookings: Booking[]; overrides: Record<string, DaySchedule>; mineIds: string[]; revision: number };
export type BookingInput = { serviceId: string; start: number; name: string; note: string };

export class DomainError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'DomainError'; }
}
export function getService(id: string) {
  const service = SERVICES.find(s => s.id === id);
  if (!service) throw new DomainError('SERVICE', 'Выберите услугу из списка.');
  return service;
}
export function dateKey(timestamp: number) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(timestamp);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function validDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = Date.parse(`${date}T12:00:00+03:00`);
  return Number.isFinite(parsed) && dateKey(parsed) === date;
}
export function addDays(date: string, count: number) {
  if (!validDate(date)) throw new DomainError('DATE', 'Укажите существующую дату.');
  return dateKey(Date.parse(`${date}T12:00:00+03:00`) + count * 86_400_000);
}
export function atTime(date: string, time: string) {
  // Moscow has fixed UTC+03:00 for the contemporary booking horizon; no browser-local parsing.
  return Date.parse(`${date}T${time}:00+03:00`);
}
export function clockTime(timestamp: number) {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' }).format(timestamp);
}
export function formatDay(date: string, short = false) {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: TIME_ZONE, weekday: short ? 'short' : 'long', day: 'numeric', month: short ? 'short' : 'long' }).format(atTime(date, '12:00'));
}
export function formatMoney(price: number) { return new Intl.NumberFormat('ru-RU').format(price) + ' ₽'; }
export function defaultSchedule(date: string): DaySchedule {
  const weekday = new Date(atTime(date, '12:00')).getUTCDay();
  return weekday === 0
    ? { closed: false, open: '11:00', close: '16:00', breakStart: '', breakEnd: '' }
    : { closed: weekday === 1, open: '10:00', close: '19:00', breakStart: '14:00', breakEnd: '15:00' };
}
export function scheduleFor(state: WorkshopState, date: string) { return state.overrides[date] ?? defaultSchedule(date); }
function validTime(value: string) { return /^([01]\d|2[0-3]):(00|30)$/.test(value); }
export function validateSchedule(schedule: DaySchedule) {
  if (typeof schedule.closed !== 'boolean' || !validTime(schedule.open) || !validTime(schedule.close) || schedule.open >= schedule.close) {
    throw new DomainError('SCHEDULE', 'Начало и конец рабочего дня: шаг 30 минут, начало раньше конца.');
  }
  const hasBreak = Boolean(schedule.breakStart || schedule.breakEnd);
  if (hasBreak && (!validTime(schedule.breakStart) || !validTime(schedule.breakEnd) || schedule.breakStart >= schedule.breakEnd || schedule.breakStart <= schedule.open || schedule.breakEnd >= schedule.close)) {
    throw new DomainError('SCHEDULE', 'Перерыв целиком внутри рабочего дня. Укажите оба времени или оставьте оба поля пустыми.');
  }
}
export function overlaps(start: number, end: number, otherStart: number, otherEnd: number) { return start < otherEnd && end > otherStart; }
function withinSchedule(date: string, start: number, end: number, schedule: DaySchedule) {
  return !schedule.closed && start >= atTime(date, schedule.open) && end <= atTime(date, schedule.close)
    && (!schedule.breakStart || !overlaps(start, end, atTime(date, schedule.breakStart), atTime(date, schedule.breakEnd)));
}
export function availableSlots(state: WorkshopState, serviceId: string, date: string, now = Date.now(), excludeId?: string) {
  const service = getService(serviceId);
  const today = dateKey(now);
  if (!validDate(date) || date < today || date > addDays(today, HORIZON_DAYS)) return [];
  const schedule = scheduleFor(state, date);
  if (schedule.closed) return [];
  const slots: number[] = [];
  for (let start = atTime(date, schedule.open); start + service.duration * MINUTE <= atTime(date, schedule.close); start += SLOT_STEP * MINUTE) {
    const end = start + service.duration * MINUTE;
    if (start >= now + LEAD_MINUTES * MINUTE && withinSchedule(date, start, end, schedule)
      && !state.bookings.some(b => b.id !== excludeId && b.status === 'confirmed' && overlaps(start, end, b.start, b.end))) slots.push(start);
  }
  return slots;
}
export function validateBooking(state: WorkshopState, input: BookingInput, now: number, excludeId?: string) {
  const service = getService(input.serviceId);
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (name.length < 2 || name.length > 40 || /[\u0000-\u001f\u007f]/.test(name)) throw new DomainError('NAME', 'Демо-имя: от 2 до 40 символов, без управляющих символов.');
  if (note.length > 240 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(note)) throw new DomainError('NOTE', 'Комментарий: до 240 символов, без управляющих символов.');
  if (!Number.isFinite(input.start)) throw new DomainError('TIME', 'Выберите доступное время.');
  const date = dateKey(input.start);
  if (date < dateKey(now) || date > addDays(dateKey(now), HORIZON_DAYS) || input.start < now + LEAD_MINUTES * MINUTE) {
    throw new DomainError('TIME', 'Запись доступна минимум за час и на 21 день вперёд. Выберите другое время.');
  }
  if (!availableSlots(state, service.id, date, now, excludeId).includes(input.start)) {
    throw new DomainError('CONFLICT', 'Интервал уже занят или расписание изменилось. Выберите другое время.');
  }
  return { service, name, note };
}
export function editableBooking(state: WorkshopState, id: string, version: number, now: number) {
  const booking = state.bookings.find(b => b.id === id);
  if (!booking || booking.version !== version) throw new DomainError('STALE', 'Запись изменилась в другой вкладке. Данные обновлены, повторите действие.');
  if (booking.status !== 'confirmed' || booking.start <= now) throw new DomainError('STATUS', 'Эту запись уже нельзя изменить.');
  return booking;
}
export function setDaySchedule(state: WorkshopState, date: string, schedule: DaySchedule, now: number) {
  if (!validDate(date) || date < dateKey(now) || date > addDays(dateKey(now), HORIZON_DAYS)) throw new DomainError('DATE', 'Выберите дату в ближайшие 21 день.');
  validateSchedule(schedule);
  const blocked = state.bookings.find(b => b.status === 'confirmed' && b.end > now && dateKey(b.start) === date && !withinSchedule(date, b.start, b.end, schedule));
  if (blocked) throw new DomainError('BOOKINGS_EXIST', 'Новое расписание пересекает подтверждённую запись. Сначала перенесите или отмените её.');
  state.overrides[date] = { ...schedule };
}
export function createSeed(now = Date.now()): WorkshopState {
  const state: WorkshopState = { key: 'workshop', seedVersion: 1, bookings: [], overrides: {}, mineIds: [], revision: 0 };
  const demo = [
    { serviceId: 'brakes' as const, name: 'Демо: городской велосипед', note: 'Проверить задний тормоз.' },
    { serviceId: 'maintenance' as const, name: 'Демо: складной велосипед', note: 'Сезонное обслуживание.' },
    { serviceId: 'diagnostics' as const, name: 'Демо: туристический велосипед', note: 'Шум при переключении.' },
  ];
  for (let index = 0; index < demo.length; index++) {
    const item = demo[index];
    let start: number | undefined;
    for (let offset = index + 1; offset < 10 && start === undefined; offset++) start = availableSlots(state, item.serviceId, addDays(dateKey(now), offset), now)[index];
    if (start === undefined) continue;
    state.bookings.push({ id: `demo-${index + 1}`, ...item, start, end: start + getService(item.serviceId).duration * MINUTE, status: 'confirmed', source: 'seed', version: 1, createdAt: now, updatedAt: now });
  }
  return state;
}
