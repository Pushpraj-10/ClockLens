/** CSS color for the process at lane index i (defined in globals.css as --p0..--p5). */
export function laneColor(i: number): string {
  return `var(--p${((i % 6) + 6) % 6})`;
}
