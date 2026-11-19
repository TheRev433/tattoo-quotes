/** Source of "now". Injected so tests and the seed can control timestamps. */
export type Clock = () => Date;

export const systemClock: Clock = () => new Date();

export function isoNow(clock: Clock): string {
  return clock().toISOString();
}
