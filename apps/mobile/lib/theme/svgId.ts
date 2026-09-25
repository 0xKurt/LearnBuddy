// A unique id for SVG gradients in one component instance. Fixed ids collide
// when the same component is on screen twice (e.g. the home under the
// conversation screen): the browser then paints nothing. React's useId has
// colons, which break url(#…) references, so only letters and digits are kept.
import { useId } from 'react';

export function useSvgId(prefix: string): string {
  return `${prefix}${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
}
