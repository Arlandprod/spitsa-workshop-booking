import { describe, expect, it } from 'vitest';
import { addDays, atTime, availableSlots, clockTime, createSeed, dateKey, defaultSchedule, getService, setDaySchedule, validDate, validateBooking, validateSchedule, type WorkshopState } from '../src/domain';

const NOW = atTime('2030-10-02', '09:00');
const fresh = (): WorkshopState => ({ ...createSeed(NOW), bookings: [] });
describe('workshop booking rules', () => {
  it('uses Moscow dates regardless of host timezone, including midnight and leap dates', () => {
    expect(dateKey(Date.parse('2030-10-01T21:30:00Z'))).toBe('2030-10-02');
    expect(clockTime(Date.parse('2030-10-02T07:00:00Z'))).toBe('10:00');
    expect(validDate('2030-02-30')).toBe(false);
    expect(validDate('2032-02-29')).toBe(true);
    expect(addDays('2030-12-31', 1)).toBe('2031-01-01');
  });
  it('excludes past slots, enforces one-hour lead and horizon', () => {
    expect(availableSlots(fresh(), 'diagnostics', '2030-10-02', atTime('2030-10-02', '10:01'))[0]).toBe(atTime('2030-10-02', '11:30'));
    expect(availableSlots(fresh(), 'diagnostics', '2030-10-01', NOW)).toEqual([]);
    expect(availableSlots(fresh(), 'diagnostics', '2030-10-24', NOW)).toEqual([]);
    expect(availableSlots(fresh(), 'diagnostics', '2030-02-30', NOW)).toEqual([]);
  });
  it('respects Monday closure, Sunday hours, breaks and full service duration', () => {
    expect(defaultSchedule('2030-10-07').closed).toBe(true);
    expect(availableSlots(fresh(), 'brakes', '2030-10-07', NOW)).toEqual([]);
    const slots = availableSlots(fresh(), 'maintenance', '2030-10-02', NOW);
    expect(slots).toContain(atTime('2030-10-02', '12:30'));
    expect(slots).not.toContain(atTime('2030-10-02', '13:00'));
    expect(slots).not.toContain(atTime('2030-10-02', '18:00'));
    const sunday = availableSlots(fresh(), 'maintenance', '2030-10-06', NOW);
    expect(clockTime(sunday[0])).toBe('11:00');
    expect(clockTime(sunday.at(-1)!)).toBe('14:30');
  });
  it('uses half-open intervals: neighbours allowed, all partial overlaps denied', () => {
    const state = fresh();
    state.bookings.push({ ...createSeed(NOW).bookings[0], id: 'test', serviceId: 'brakes', start: atTime('2030-10-02', '11:00'), end: atTime('2030-10-02', '12:00') });
    const slots = availableSlots(state, 'brakes', '2030-10-02', NOW);
    expect(slots).toContain(atTime('2030-10-02', '10:00'));
    expect(slots).not.toContain(atTime('2030-10-02', '10:30'));
    expect(slots).not.toContain(atTime('2030-10-02', '11:30'));
    expect(slots).toContain(atTime('2030-10-02', '12:00'));
    expect(availableSlots(state, 'brakes', '2030-10-02', NOW, 'test')).toContain(atTime('2030-10-02', '11:00'));
  });
  it('rejects unknown services, invalid names, long notes, forged minute alignment and NaN', () => {
    const input = { serviceId: 'diagnostics', start: atTime('2030-10-02', '10:00'), name: 'Гость демо', note: '' };
    expect(() => getService('forged')).toThrow();
    expect(() => validateBooking(fresh(), { ...input, name: ' ' }, NOW)).toThrow();
    expect(() => validateBooking(fresh(), { ...input, name: 'Демо\u0000' }, NOW)).toThrow();
    expect(() => validateBooking(fresh(), { ...input, note: 'а'.repeat(241) }, NOW)).toThrow();
    expect(() => validateBooking(fresh(), { ...input, start: input.start + 60_000 }, NOW)).toThrow();
    expect(() => validateBooking(fresh(), { ...input, start: NaN }, NOW)).toThrow();
  });
  it('validates schedule shape and refuses to hide an existing booking', () => {
    const day = defaultSchedule('2030-10-03');
    expect(() => validateSchedule({ ...day, open: '10:15' })).toThrow();
    expect(() => validateSchedule({ ...day, close: '09:00' })).toThrow();
    expect(() => validateSchedule({ ...day, breakEnd: '' })).toThrow();
    const state = createSeed(NOW);
    expect(() => setDaySchedule(state, '2030-10-03', { ...day, closed: true }, NOW)).toThrow(/подтверждённую/);
    expect(state.overrides).toEqual({});
  });
  it('seeds only synthetic, non-overlapping future records reproducibly', () => {
    const state = createSeed(NOW);
    expect(state).toEqual(createSeed(NOW));
    expect(state.bookings).toHaveLength(3);
    for (const booking of state.bookings) {
      expect(booking.name.startsWith('Демо:')).toBe(true);
      expect(availableSlots(state, booking.serviceId, dateKey(booking.start), NOW, booking.id)).toContain(booking.start);
    }
  });
});
