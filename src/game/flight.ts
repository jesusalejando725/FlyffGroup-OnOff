export type FlightMode = 'auto' | 'flight' | 'landing' | 'ground';
export function flightAltitude(mode: FlightMode, height: number, pitch: number, throttle: number, dt: number) {
  if (mode === 'landing') return Math.max(0, height - 32 * dt);
  if (mode !== 'flight') return 0;
  const lift = height < 4 ? 10 : 0;
  return Math.max(Math.min(4, height + lift*dt), Math.min(500, height + (lift - Math.cos(pitch)*48*throttle)*dt));
}
