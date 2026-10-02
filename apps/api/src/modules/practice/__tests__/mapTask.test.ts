// Karten (issue #251): what the model writes is resolved against the data or dropped; what she
// taps, types or reads is judged by code. docs/architecture.md §Practice ("Maps").

import { MAP_AREAS, MAP_LAYERS, mapFeature } from '@learnbuddy/shared-maps';
import {
  MAP_AREA_IDS,
  MapLayer,
  StructuredTask,
  type FigureTapTask,
  type StructuredAnswer,
} from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { figureTapTaskFrom, type FigureTapDraft } from '../figureTap.js';
import { mapTaskFrom } from '../mapTask.js';
import {
  checkStructured,
  structuredItem,
  structuredNamesPart,
  structuredReply,
  structuredRightReply,
  structuredTaskOf,
  typedParts,
  viewOf,
} from '../structured.js';

const META = { topic: 'Topographie', difficulty: 2, prompt_lang: 'de' } as const;
const NONE = { plane: null, number_line: null, bars: null, clock: null };

type MapFields = NonNullable<FigureTapDraft['map']>;

function draft(prompt: string, map: Partial<MapFields>): FigureTapDraft & typeof META {
  return {
    type: 'figure_tap',
    prompt,
    ...NONE,
    map: {
      area: 'germany',
      layer: 'areas',
      ask: 'tap',
      feature: 'Bayern',
      graticule: false,
      ...map,
    },
    ...META,
  };
}

function task(prompt: string, map: Partial<MapFields>, locale = 'de'): FigureTapTask {
  const t = figureTapTaskFrom(draft(prompt, map), locale);
  if (typeof t === 'string') throw new Error(`rejected: ${t}`);
  return t;
}

/** Her answer as the app sends it. */
const answer = (value: StructuredAnswer): StructuredAnswer => value;

describe('the contract and the data agree', () => {
  it('names the same areas and layers', () => {
    expect([...MAP_AREA_IDS]).toEqual([...MAP_AREAS]);
    expect([...MapLayer.options]).toEqual([...MAP_LAYERS]);
  });
});

describe('Regel 0, what the model wrote', () => {
  it('"Tippe auf Bayern": the name becomes the data\'s id, nothing is drawn marked', () => {
    const t = task('Tippe auf Bayern.', {});
    expect(t.key).toEqual({ kind: 'map', id: 'DE-BY' });
    expect(t.figure).toEqual({
      kind: 'map',
      area: 'germany',
      layer: 'areas',
      ask: 'tap',
      mark: null,
      graticule: false,
    });
    expect(StructuredTask.safeParse(t).success).toBe(true);
  });

  it('accepts the English name the same way', () => {
    expect(task('Tap Bavaria.', { feature: 'Bavaria' }).key).toEqual({ kind: 'map', id: 'DE-BY' });
  });

  it('"Wie heißt das markierte Land?": the view carries the outline, never the id', () => {
    const t = task('Wie heißt das markierte Land?', {
      area: 'europe',
      ask: 'name',
      feature: 'Italien',
    });
    expect(t.key).toEqual({ kind: 'map', id: 'ITA' });
    const v = viewOf(t);
    expect(JSON.stringify(v)).not.toContain('ITA');
    expect(v).toMatchObject({ figure: { kind: 'map', mark: { form: 'path' } } });
  });

  it('takes a capital from the data, not from the model ("die Hauptstadt von Bayern")', () => {
    const t = task('Tippe auf die Hauptstadt von Bayern.', { layer: 'cities', feature: 'Bayern' });
    expect(t.key).toEqual({ kind: 'map', id: 'c-munich' });
  });

  it('reads a position from the data and always draws the graticule', () => {
    const t = task('Welche Koordinaten hat die markierte Hauptstadt?', {
      layer: 'cities',
      ask: 'coords',
      feature: 'Berlin',
      graticule: false,
    });
    expect(t.key).toEqual({ kind: 'map_coords', lat: 52.52, lon: 13.4 });
    expect(t.figure).toMatchObject({ graticule: true, mark: { form: 'point' } });
  });

  it.each([
    ['a name that is not on the map', { feature: 'Atlantis' }, 'map_feature'],
    ['a country on the map of the Länder', { feature: 'Italien' }, 'map_feature'],
    ['zones off the world map', { area: 'europe', layer: 'zones', feature: 'Tropen' }, 'map_form'],
    ['a position of a country', { ask: 'coords', feature: 'Bayern' }, 'map_form'],
    [
      'a capital a finger cannot tell from its neighbour',
      { layer: 'cities', feature: 'Mainz' },
      'too_small',
    ],
  ] as const)('drops %s', (_why, map, problem) => {
    expect(figureTapTaskFrom(draft('Tippe.', map), 'de')).toBe(problem);
  });

  it('drops a name question whose prompt names the answer', () => {
    expect(figureTapTaskFrom(draft('Ist das markierte Land Bayern?', { ask: 'name' }), 'de')).toBe(
      'map_given_away',
    );
  });

  it('drops a reading whose prompt prints the position', () => {
    expect(
      figureTapTaskFrom(
        draft('Berlin liegt bei 53° N und 13° O. Lies ab.', {
          layer: 'cities',
          ask: 'coords',
          feature: 'Berlin',
        }),
        'de',
      ),
    ).toBe('map_given_away');
  });

  it('drops a name question in a language the data has no name of the feature in', () => {
    // Natural Earth names the Rhine only in German and English.
    expect(
      mapTaskFrom(
        { area: 'germany', layer: 'rivers', ask: 'name', feature: 'Rhein', graticule: false },
        'Comment s’appelle le fleuve marqué ?',
        'fr',
      ),
    ).toBe('no_name');
    expect(
      mapTaskFrom(
        { area: 'germany', layer: 'rivers', ask: 'name', feature: 'Rhein', graticule: false },
        'Wie heißt der markierte Fluss?',
        'de',
      ),
    ).toMatchObject({ key: { kind: 'map', id: 'r-rhein' } });
  });

  it('drops a draft with a map and another figure', () => {
    const both = { ...draft('Tippe.', {}), clock: { snap: 15, key: { h: 3, m: 0 } } };
    expect(figureTapTaskFrom(both, 'de')).toBe('figure_form');
  });

  it('reads a stored task back and refuses one that was tampered with', () => {
    const t = task('Tippe auf Bayern.', {});
    expect(structuredTaskOf(t, 'figure_tap')).toEqual(t);
    const broken = { ...t, key: { kind: 'map', id: 'DE-XX' } };
    expect(structuredTaskOf(broken, 'figure_tap')).toBeNull();
    const mainz = {
      ...t,
      figure: { ...t.figure, layer: 'cities' },
      key: { kind: 'map', id: 'c-mainz' },
    };
    expect(structuredTaskOf(mainz, 'figure_tap')).toBeNull();
  });

  it('becomes an item whose solution is the name in her language', () => {
    const item = structuredItem(draft('Tippe auf Bayern.', {}), 'en');
    expect(item?.answer).toBe('Bavaria');
    const coords = structuredItem(
      draft('Welche Koordinaten hat die markierte Hauptstadt?', {
        layer: 'cities',
        ask: 'coords',
        feature: 'Berlin',
      }),
      'de',
    );
    expect(coords?.answer).toBe('52,5° N, 13,4° O');
  });
});

describe('Regel 0, her answer', () => {
  const tap = task('Tippe auf Bayern.', {});

  it('a tap on the key is right; on a neighbour or elsewhere it says what she tapped', () => {
    const right = checkStructured(
      tap,
      answer({ type: 'figure_tap', value: { kind: 'map', id: 'DE-BY' } }),
    );
    expect(right?.correct).toBe(true);
    const he = checkStructured(
      tap,
      answer({ type: 'figure_tap', value: { kind: 'map', id: 'DE-HE' } }),
    )!;
    expect(he.correct).toBe(false);
    expect(structuredReply('de', he, 0)).toBe('Knapp daneben – das ist Hessen, ein Nachbar.');
    const ni = checkStructured(
      tap,
      answer({ type: 'figure_tap', value: { kind: 'map', id: 'DE-NI' } }),
    )!;
    expect(structuredReply('de', ni, 0)).toBe(
      'Das ist Niedersachsen – schau nochmal auf die Karte.',
    );
    expect(structuredNamesPart(ni, 0)).toBe(false);
  });

  it('says which way from the second miss on, and counts that as help', () => {
    const ni = checkStructured(
      tap,
      answer({ type: 'figure_tap', value: { kind: 'map', id: 'DE-NI' } }),
    )!;
    expect(structuredReply('de', ni, 1)).toBe(
      'Das ist Niedersachsen – schau nochmal auf die Karte. Das Gesuchte liegt weiter südlich.',
    );
    expect(structuredNamesPart(ni, 1)).toBe(true);
  });

  it('refuses what is no answer to this map (another id, a name on a tap question)', () => {
    expect(
      checkStructured(tap, answer({ type: 'figure_tap', value: { kind: 'map', id: 'ITA' } })),
    ).toBeNull();
    expect(
      checkStructured(
        tap,
        answer({ type: 'figure_tap', value: { kind: 'map_name', text: 'Bayern' } }),
      ),
    ).toBeNull();
    expect(
      checkStructured(tap, answer({ type: 'figure_tap', value: { kind: 'clock', h: 3, m: 0 } })),
    ).toBeNull();
  });

  const named = task('Wie heißt das markierte Bundesland?', { ask: 'name' });

  it('a typed name: any name of the data, a slip shows the spelling, another Land is named', () => {
    for (const text of ['Bayern', 'bavaria', 'Bavière']) {
      const c = checkStructured(
        named,
        answer({ type: 'figure_tap', value: { kind: 'map_name', text } }),
      );
      expect(c?.correct, text).toBe(true);
    }
    const slip = checkStructured(
      named,
      answer({ type: 'figure_tap', value: { kind: 'map_name', text: 'Baiern' } }),
    )!;
    expect(slip.correct).toBe(true);
    expect(structuredRightReply('de', named, slip)).toBe('Richtig! Geschrieben wird es: Bayern.');
    const he = checkStructured(
      named,
      answer({ type: 'figure_tap', value: { kind: 'map_name', text: 'Hessen' } }),
    )!;
    expect(he.correct).toBe(false);
    expect(structuredReply('de', he, 0)).toBe('Knapp daneben – Hessen liegt direkt daneben.');
    const nds = checkStructured(
      named,
      answer({ type: 'figure_tap', value: { kind: 'map_name', text: 'Bremen' } }),
    )!;
    expect(structuredReply('de', nds, 0)).toBe(
      'Das liegt woanders auf der Karte – schau nochmal genau hin.',
    );
    const no = checkStructured(
      named,
      answer({ type: 'figure_tap', value: { kind: 'map_name', text: 'Alpenland' } }),
    )!;
    expect(structuredReply('de', no, 0)).toBe('Noch nicht – das Markierte heißt anders.');
    expect(
      structuredRightReply(
        'de',
        named,
        checkStructured(
          named,
          answer({ type: 'figure_tap', value: { kind: 'map_name', text: 'Bayern' } }),
        )!,
      ),
    ).toBeNull();
  });

  const coords = task('Welche Koordinaten hat die markierte Hauptstadt?', {
    layer: 'cities',
    ask: 'coords',
    feature: 'Berlin',
  });
  const read = (lat: number, lon: number) =>
    checkStructured(
      coords,
      answer({ type: 'figure_tap', value: { kind: 'map_coords', lat, lon } }),
    );

  it('a reading within one degree on Germany is right (52.52° N, 13.40° E)', () => {
    expect(read(52, 13)?.correct).toBe(true);
    expect(read(53, 14)?.correct).toBe(true);
    expect(read(51, 13)?.correct).toBe(false);
  });

  it('names what is right already, a swap and a wrong hemisphere', () => {
    expect(structuredReply('de', read(52, 10)!, 0)).toMatch(/^Die Breite stimmt schon/);
    expect(structuredReply('de', read(48, 13)!, 0)).toMatch(/^Die Länge stimmt schon/);
    expect(structuredReply('de', read(13, 52)!, 0)).toMatch(/vertauscht/);
    expect(structuredReply('de', read(-52, 13)!, 0)).toMatch(/Nord oder Süd/);
    expect(structuredReply('de', read(40, 40)!, 0)).toMatch(/^Noch nicht/);
  });

  it('refuses a reading that is no whole degree', () => {
    expect(read(52.5, 13)).toBeNull();
  });

  it('records a typed name and a reading as typed, a tap as tapped', () => {
    expect(typedParts({ type: 'figure_tap', value: { kind: 'map_name', text: 'x' } })).toBe(true);
    expect(typedParts({ type: 'figure_tap', value: { kind: 'map_coords', lat: 1, lon: 1 } })).toBe(
      true,
    );
    expect(typedParts({ type: 'figure_tap', value: { kind: 'map', id: 'DE-BY' } })).toBe(false);
  });

  it('knows every Land of the map by its German name', () => {
    for (const id of ['DE-BY', 'DE-BE', 'DE-HB', 'DE-HH', 'DE-SL'])
      expect(mapFeature('germany', 'areas', id)?.names.de).toBeTruthy();
  });
});
