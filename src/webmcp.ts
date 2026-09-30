import { readState, createBooking } from './db';
import { availableSlots, type Booking, type BookingInput } from './domain';

type Tool = { name: string; title: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }; execute: (input: unknown) => Promise<unknown> };
type ModelContext = { registerTool: (tool: Tool, options: { signal: AbortSignal }) => void | Promise<void> };

export function registerTools({ refresh, onBook }: { refresh: () => Promise<void>; onBook: (booking: Booking) => void }) {
  const context = (document as Document & { modelContext?: ModelContext }).modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  const tools: Tool[] = [{
    name: 'spitsa_available_slots', title: 'Свободные интервалы Спицы', description: 'Читает доступные интервалы локального учебного демо. start — Unix milliseconds, все часы мастерской Europe/Moscow.',
    inputSchema: { type: 'object', properties: { serviceId: { type: 'string', enum: ['diagnostics', 'brakes', 'transmission', 'maintenance'] }, date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } }, required: ['serviceId', 'date'], additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    async execute(input) { const value = object(input); if (typeof value.serviceId !== 'string' || typeof value.date !== 'string') throw new Error('serviceId и date обязательны.'); const state = await readState(); return { starts: availableSlots(state, value.serviceId, value.date), timeZone: 'Europe/Moscow' }; },
  }, {
    name: 'spitsa_create_demo_booking', title: 'Создать учебную запись', description: 'Подтверждает запись в локальной демо-базе и показывает подтверждение. Требует вымышленное имя и acknowledgedDemo=true. Не отправляет уведомлений, не создаёт реальную запись в мастерскую.',
    inputSchema: { type: 'object', properties: { serviceId: { type: 'string', enum: ['diagnostics', 'brakes', 'transmission', 'maintenance'] }, start: { type: 'number' }, name: { type: 'string', minLength: 2, maxLength: 40 }, note: { type: 'string', maxLength: 240 }, acknowledgedDemo: { const: true } }, required: ['serviceId', 'start', 'name', 'acknowledgedDemo'], additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    async execute(input) { const value = object(input); if (value.acknowledgedDemo !== true || typeof value.serviceId !== 'string' || typeof value.start !== 'number' || typeof value.name !== 'string' || (value.note !== undefined && typeof value.note !== 'string')) throw new Error('Укажите услугу, время, вымышленное имя и acknowledgedDemo=true.'); const booking = await createBooking({ ...value, note: value.note ?? '' } as BookingInput); await refresh(); onBook(booking); return { id: booking.id, status: booking.status, start: booking.start, end: booking.end }; },
  }];
  for (const tool of tools) {
    try { void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => { /* Optional browser API; UI remains available. */ }); }
    catch { /* Unsupported proposal implementations must not block the demo. */ }
  }
  return () => lifecycle.abort();
}
function object(input: unknown): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new Error('Ожидается объект параметров.');
  return input as Record<string, unknown>;
}
