import { createSeed, defaultSchedule, DomainError, editableBooking, setDaySchedule, validateBooking, type Booking, type BookingInput, type DaySchedule, type WorkshopState } from './domain';

const DATABASE = 'spitsa-workshop-demo-v1';
const STORE = 'state';
let opening: Promise<IDBDatabase> | undefined;
let channel: BroadcastChannel | undefined;

function notify() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('spitsa:changed'));
    if (typeof BroadcastChannel !== 'undefined') { channel ??= new BroadcastChannel(DATABASE); channel.postMessage('changed'); }
  }
}
function openDatabase() {
  if (opening) return opening;
  opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new DomainError('STORAGE', 'Браузер не поддерживает локальное хранилище. Откройте демо в современном браузере.')); return; }
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'key' });
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); opening = undefined; }; resolve(db); };
    request.onerror = () => reject(new DomainError('STORAGE', 'Не удалось открыть локальную базу. Разрешите хранение данных сайта и повторите.'));
    request.onblocked = () => reject(new DomainError('STORAGE', 'Закройте старые вкладки демо и повторите.'));
  }).catch(error => { opening = undefined; throw error; });
  return opening;
}

// Every read-modify-write happens inside ONE readwrite transaction, without await in request callbacks.
// IndexedDB serializes transactions with this overlapping store scope, including across tabs.
async function mutate<T>(operation: (state: WorkshopState) => T, now: number): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    let result: T;
    let failure: unknown;
    const request = store.get('workshop');
    request.onsuccess = () => {
      try {
        const state: WorkshopState = request.result ?? createSeed(now);
        result = operation(state);
        state.revision++;
        store.put(state);
      } catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => { notify(); resolve(result); };
    tx.onabort = () => reject(failure ?? new DomainError('STORAGE', 'Изменение не сохранено. Проверьте свободное место и повторите.'));
    tx.onerror = () => { failure ??= new DomainError('STORAGE', 'Изменение не сохранено в локальной базе.'); };
  });
}
export async function readState(now = Date.now()): Promise<WorkshopState> {
  const db = await openDatabase();
  const state = await new Promise<WorkshopState | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get('workshop');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new DomainError('STORAGE', 'Не удалось прочитать локальную базу. Повторите загрузку.'));
  });
  if (state) return state;
  return mutate(value => structuredClone(value), now);
}
export function createBooking(input: BookingInput, now = Date.now()) {
  return mutate(state => {
    const validated = validateBooking(state, input, now);
    const booking: Booking = { id: crypto.randomUUID(), serviceId: validated.service.id, start: input.start, end: input.start + validated.service.duration * 60_000, name: validated.name, note: validated.note, status: 'confirmed', source: 'visitor', version: 1, createdAt: now, updatedAt: now };
    state.bookings.push(booking); state.mineIds.push(booking.id);
    return booking;
  }, now);
}
export function rescheduleBooking(id: string, version: number, start: number, now = Date.now()) {
  return mutate(state => {
    const booking = editableBooking(state, id, version, now);
    const { service } = validateBooking(state, { ...booking, start }, now, id);
    booking.start = start; booking.end = start + service.duration * 60_000; booking.version++; booking.updatedAt = now;
    return booking;
  }, now);
}
export function cancelBooking(id: string, version: number, now = Date.now()) {
  return mutate(state => { const booking = editableBooking(state, id, version, now); booking.status = 'cancelled'; booking.version++; booking.updatedAt = now; return booking; }, now);
}
export function saveSchedule(date: string, schedule: DaySchedule, now = Date.now()) {
  return mutate(state => setDaySchedule(state, date, schedule, now), now);
}
export function restoreSchedule(date: string, now = Date.now()) {
  return mutate(state => { setDaySchedule(state, date, defaultSchedule(date), now); delete state.overrides[date]; }, now);
}
export function resetDemo(now = Date.now()) {
  return mutate(state => { const seed = createSeed(now); Object.assign(state, seed); }, now);
}
export function subscribeChanges(callback: () => void) {
  const remote = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(DATABASE) : undefined;
  remote?.addEventListener('message', callback);
  window.addEventListener('spitsa:changed', callback);
  window.addEventListener('focus', callback);
  return () => { remote?.close(); window.removeEventListener('spitsa:changed', callback); window.removeEventListener('focus', callback); };
}
