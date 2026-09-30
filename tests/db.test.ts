import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { cancelBooking, createBooking, readState, resetDemo, rescheduleBooking, restoreSchedule, saveSchedule } from '../src/db';
import { atTime, availableSlots, dateKey, defaultSchedule } from '../src/domain';

const NOW = atTime('2030-10-02', '09:00');
const INPUT = { serviceId: 'brakes', start: atTime('2030-10-02', '10:00'), name: 'Гость демо', note: 'Учебный велосипед' };
beforeEach(async () => { await resetDemo(NOW); });
describe('atomic IndexedDB operations', () => {
  it('confirms and persists a booking with its visitor ownership marker', async () => {
    const booking = await createBooking(INPUT, NOW);
    const state = await readState(NOW);
    expect(state.bookings.find(b => b.id === booking.id)).toEqual(booking);
    expect(state.mineIds).toContain(booking.id);
    expect(booking.end - booking.start).toBe(60 * 60_000);
  });
  it('allows exactly one winner when requests race for the same interval', async () => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => createBooking(INPUT, NOW)));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(7);
    expect((await readState(NOW)).mineIds).toHaveLength(1);
  });
  it('also blocks overlapping starts with a different service duration', async () => {
    await createBooking(INPUT, NOW);
    await expect(createBooking({ ...INPUT, serviceId: 'maintenance', start: atTime('2030-10-02', '10:30') }, NOW)).rejects.toMatchObject({ code: 'CONFLICT' });
    const state = await readState(NOW);
    expect(state.mineIds).toHaveLength(1);
    expect(availableSlots(state, 'diagnostics', '2030-10-02', NOW)).toContain(atTime('2030-10-02', '11:00'));
  });
  it('moves atomically, retains the ID and releases the old interval', async () => {
    const booking = await createBooking(INPUT, NOW);
    const moved = await rescheduleBooking(booking.id, booking.version, atTime('2030-10-02', '12:00'), NOW);
    expect(moved.id).toBe(booking.id);
    expect(moved.version).toBe(2);
    expect(availableSlots(await readState(NOW), 'brakes', '2030-10-02', NOW)).toContain(INPUT.start);
  });
  it('rolls back a failed move and rejects edits after cancellation', async () => {
    const booking = await createBooking(INPUT, NOW);
    const other = await createBooking({ ...INPUT, start: atTime('2030-10-02', '12:00') }, NOW);
    await expect(rescheduleBooking(booking.id, 1, other.start, NOW)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await readState(NOW)).bookings.find(b => b.id === booking.id)?.start).toBe(INPUT.start);
    await cancelBooking(booking.id, 1, NOW);
    await expect(rescheduleBooking(booking.id, 1, other.start, NOW)).rejects.toMatchObject({ code: 'STALE' });
    const cancelled = (await readState(NOW)).bookings.find(b => b.id === booking.id)!;
    await expect(cancelBooking(cancelled.id, cancelled.version, NOW)).rejects.toMatchObject({ code: 'STATUS' });
    expect(availableSlots(await readState(NOW), 'brakes', '2030-10-02', NOW)).toContain(INPUT.start);
  });
  it('protects both saving and restoring hours from hiding confirmed records', async () => {
    await saveSchedule('2030-10-02', { ...defaultSchedule('2030-10-02'), open: '09:00' }, atTime('2030-10-02', '08:00'));
    await createBooking({ ...INPUT, start: atTime('2030-10-02', '09:00') }, atTime('2030-10-02', '08:00'));
    await expect(restoreSchedule('2030-10-02', atTime('2030-10-02', '08:00'))).rejects.toMatchObject({ code: 'BOOKINGS_EXIST' });
    await expect(saveSchedule('2030-10-02', { ...defaultSchedule('2030-10-02'), closed: true }, atTime('2030-10-02', '08:00'))).rejects.toMatchObject({ code: 'BOOKINGS_EXIST' });
    expect((await readState(NOW)).overrides['2030-10-02'].open).toBe('09:00');
  });
  it('serializes a schedule closure racing with a new booking', async () => {
    const results = await Promise.allSettled([saveSchedule('2030-10-02', { ...defaultSchedule('2030-10-02'), closed: true }, NOW), createBooking(INPUT, NOW)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const state = await readState(NOW);
    expect(state.overrides['2030-10-02'].closed).toBe(true);
    expect(state.mineIds).toEqual([]);
  });
  it('rejects stale owner actions, past edits and invalid requests without a partial write', async () => {
    const booking = await createBooking(INPUT, NOW);
    await rescheduleBooking(booking.id, 1, atTime('2030-10-02', '12:00'), NOW);
    await expect(cancelBooking(booking.id, 1, NOW)).rejects.toMatchObject({ code: 'STALE' });
    await expect(cancelBooking(booking.id, 2, atTime('2030-10-02', '12:01'))).rejects.toMatchObject({ code: 'STATUS' });
    const before = await readState(NOW);
    await expect(createBooking({ ...INPUT, name: '' }, NOW)).rejects.toMatchObject({ code: 'NAME' });
    expect(await readState(NOW)).toEqual(before);
  });
  it('resets only this dedicated demo database and re-creates relative seed data', async () => {
    await createBooking(INPUT, NOW);
    await saveSchedule('2030-10-02', { ...defaultSchedule('2030-10-02'), close: '18:00' }, NOW);
    await resetDemo(NOW);
    const state = await readState(NOW);
    expect(state.mineIds).toEqual([]);
    expect(state.overrides).toEqual({});
    expect(state.bookings).toHaveLength(3);
    expect(state.bookings.every(b => dateKey(b.start) > dateKey(NOW))).toBe(true);
  });
});
