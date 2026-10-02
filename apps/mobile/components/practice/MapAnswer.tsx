// Karten (issue #251): eine stumme Karte, drei Fragen auf ihr.
//
//   · Antippen („Tippe auf Bayern"): der Tipp IST die Antwort, wie bei jeder Tippfigur (#248).
//     Liegt er nah an einem Ziel, das für einen Finger zu klein ist (Berlin, Luxemburg, eine
//     Hauptstadt), vergrößert der erste Tipp die Karte um die Stelle, der zweite wählt.
//     Unter der Karte steht, DASS etwas gewählt ist — nie sein Name: der wäre die Lösung.
//   · Benennen („Wie heißt das markierte Land?"): ein Feld und „Prüfen". Geprüft wird auf dem
//     Server gegen alle Namen, die die Daten für das Markierte kennen.
//   · Ablesen („Welche Koordinaten hat der markierte Ort?"): Breite und Länge in ganzen Grad,
//     je mit N/S und O/W zum Umschalten. Getippt, nicht angetippt: ein Tipp auf den Punkt
//     würde die Koordinaten verraten, statt sie ablesen zu lassen.
//
// Alles, was sie gesetzt oder getippt hat, steht im Entwurf (lib/drafts.ts): ein Wechsel
// Hell/Dunkel baut den Baum neu, und die Antwort ist trotzdem noch da.

import type {
  FigureTapTaskView,
  StructuredAnswer,
  TapValue,
} from '@learnbuddy/shared-types/contracts';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Text, TextInput, View } from 'react-native';

import { mapFeature, mapName } from '../../../../packages/shared-maps/src/index.js';
import { useDraft } from '../../lib/drafts.js';
import { currentLocale } from '../../lib/i18n/index.js';
import {
  mapSize,
  tapOnMap,
  wholeMap,
  type MapFig,
  type MapWindow,
} from '../../lib/maps/mapFrame.js';
import { SHADOW } from '../../lib/theme/shadow.js';
import { SPACE, TOUCH } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { FigureSurface } from './figure/FigureSurface.js';
import { MapSvg } from './figure/MapSvg.js';
import { TouchLayer } from './figure/TouchLayer.js';

type Props = {
  view: FigureTapTaskView & { figure: MapFig };
  draftKey: string;
  disabled: boolean;
  onSubmit: (parts: StructuredAnswer, shown: string) => void;
};

/** What the draft keeps: her tap, her name, or her two readings with their hemispheres. */
type Kept = {
  id?: string;
  name?: string;
  lat?: string;
  lon?: string;
  south?: boolean;
  west?: boolean;
};

function read(kept: string): Kept {
  try {
    const v: unknown = JSON.parse(kept || '{}');
    return v !== null && typeof v === 'object' ? (v as Kept) : {};
  } catch {
    return {};
  }
}

/** Whole degrees as she typed them, or null while a field is empty or not a number. */
function degrees(text: string | undefined, max: number): number | null {
  if (!text || !/^\d{1,3}$/.test(text)) return null;
  const n = Number(text);
  return n <= max ? n : null;
}

type Dir = 'N' | 'S' | 'E' | 'W';

export function MapAnswer({ view, draftKey, disabled, onSubmit }: Props) {
  const { t } = useTranslation('practice');
  const { palette } = useTheme();
  const fig = view.figure;
  const { text: keptText, setText: keep } = useDraft(draftKey);
  const kept = read(keptText);
  const save = (next: Kept) => keep(JSON.stringify({ ...kept, ...next }));
  const [zoom, setZoom] = useState<MapWindow | null>(null);
  const locale = currentLocale();
  const dir = (d: Dir) => t(`map.dir_${d}`);

  const chosen =
    fig.ask === 'tap' && kept.id && mapFeature(fig.area, fig.layer, kept.id) ? kept.id : null;
  const lat = degrees(kept.lat, 90);
  const lon = degrees(kept.lon, 180);
  const name = (kept.name ?? '').trim();

  const value: TapValue | null =
    fig.ask === 'tap'
      ? chosen
        ? { kind: 'map', id: chosen }
        : null
      : fig.ask === 'name'
        ? name
          ? { kind: 'map_name', text: name }
          : null
        : lat !== null && lon !== null
          ? {
              kind: 'map_coords',
              lat: kept.south && lat !== 0 ? -lat : lat,
              lon: kept.west && lon !== 0 ? -lon : lon,
            }
          : null;

  const position = (v: { lat: number; lon: number }) =>
    t('map.position', {
      lat: `${Math.abs(v.lat)}° ${dir(v.lat < 0 ? 'S' : 'N')}`,
      lon: `${Math.abs(v.lon)}° ${dir(v.lon < 0 ? 'W' : 'E')}`,
    });

  /** What she sent, as it stands in the conversation (the server writes the same words). */
  const shown = (v: TapValue): string => {
    switch (v.kind) {
      case 'map': {
        const f = mapFeature(fig.area, fig.layer, v.id);
        return f ? mapName(f, locale) : '';
      }
      case 'map_name':
        return v.text;
      case 'map_coords':
        return position(v);
      default:
        return '';
    }
  };

  const submit = () => {
    if (value) onSubmit({ type: 'figure_tap', value }, shown(value));
  };

  const readout =
    zoom !== null
      ? t('figure.zoomed')
      : fig.ask === 'tap'
        ? chosen
          ? t('map.chosen')
          : t('map.tap_hint')
        : fig.ask === 'name'
          ? t(`map.marked_${fig.layer === 'areas' && fig.area === 'germany' ? 'land' : fig.layer}`)
          : value?.kind === 'map_coords'
            ? t('map.your_position', { position: position(value) })
            : t('map.coords_hint');

  const tools =
    zoom !== null ? (
      <Btn
        size="sm"
        variant="ghost"
        pill
        onPress={() => setZoom(null)}
        accessibilityHint={t('map.whole_hint')}
      >
        {t('map.whole')}
      </Btn>
    ) : null;

  const canvas = (box: { width: number; height: number }) => {
    const size = mapSize(fig.area, box);
    const win = zoom ?? wholeMap(fig.area);
    return (
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={`${t(`map.canvas_${fig.area}`)}. ${readout}`}
        style={{
          width: size.width,
          height: size.height,
          borderRadius: 12,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: palette.hairline,
        }}
      >
        <MapSvg
          area={fig.area}
          layer={fig.layer}
          win={win}
          width={size.width}
          height={size.height}
          graticule={fig.graticule}
          mark={fig.mark}
          chosen={chosen}
          dir={dir}
        />
        {fig.ask === 'tap' ? (
          <TouchLayer
            testID="figure-touch"
            width={size.width}
            height={size.height}
            disabled={disabled}
            onTap={(x, y) => {
              const res = tapOnMap(fig, size, zoom, x, y);
              if (res.kind === 'zoom' && res.window) setZoom(res.window);
              else if (res.kind === 'feature') {
                save({ id: res.id });
                setZoom(null);
              }
            }}
          />
        ) : null}
      </View>
    );
  };

  return (
    <FigureSurface
      testID="figure-tap"
      readout={readout}
      tools={tools}
      bar={
        fig.ask === 'tap' ? (
          <Btn
            pill
            full
            disabled={disabled || value === null}
            onPress={submit}
            accessibilityHint={value === null ? t('figure.check_waits') : undefined}
          >
            {t('check')}
          </Btn>
        ) : fig.ask === 'name' ? (
          <Pill>
            <TextInput
              testID="map-name"
              value={kept.name ?? ''}
              onChangeText={(text) => save({ name: text })}
              placeholder={t('map.name_placeholder')}
              placeholderTextColor={palette.placeholder}
              accessibilityLabel={t('map.name_label')}
              editable={!disabled}
              maxLength={60}
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
              returnKeyType="send"
              submitBehavior="submit"
              onSubmitEditing={submit}
              style={[fieldStyle, { flex: 1, color: palette.ink }]}
            />
            <Btn pill size="sm" disabled={disabled || value === null} onPress={submit}>
              {t('check')}
            </Btn>
          </Pill>
        ) : (
          <Pill>
            <Degree
              testID="map-lat"
              label={t('map.lat')}
              value={kept.lat ?? ''}
              onChange={(v) => save({ lat: v })}
              flipped={kept.south === true}
              onFlip={() => save({ south: !kept.south })}
              signs={['N', 'S']}
              dir={dir}
              disabled={disabled}
            />
            <Degree
              testID="map-lon"
              label={t('map.lon')}
              value={kept.lon ?? ''}
              onChange={(v) => save({ lon: v })}
              flipped={kept.west === true}
              onFlip={() => save({ west: !kept.west })}
              signs={['E', 'W']}
              dir={dir}
              disabled={disabled}
            />
            <Btn pill size="sm" disabled={disabled || value === null} onPress={submit}>
              {t('check')}
            </Btn>
          </Pill>
        )
      }
    >
      {canvas}
    </FigureSurface>
  );
}

const fieldStyle = {
  minHeight: TOUCH,
  paddingHorizontal: 0,
  paddingVertical: SPACE.sm,
  fontSize: 16,
  lineHeight: 22,
  backgroundColor: 'transparent',
  outlineWidth: 0,
} as const;

/** The floating white pill every typed answer sits in (components/practice/AnswerComposer.tsx). */
function Pill({ children }: { children: ReactNode }) {
  const { palette } = useTheme();
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.sm,
          backgroundColor: palette.paper,
          borderRadius: 30,
          paddingVertical: 6,
          paddingLeft: SPACE.lg,
          paddingRight: 6,
          minHeight: 60,
        },
        SHADOW.float,
      ]}
    >
      {children}
    </View>
  );
}

/** One reading: whole degrees, and the hemisphere as a button that turns over (N ↔ S). */
function Degree({
  testID,
  label,
  value,
  onChange,
  flipped,
  onFlip,
  signs,
  dir,
  disabled,
}: {
  testID: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  flipped: boolean;
  onFlip: () => void;
  signs: [Dir, Dir];
  dir: (d: Dir) => string;
  disabled: boolean;
}) {
  const { t } = useTranslation('practice');
  const { palette } = useTheme();
  const now = signs[flipped ? 1 : 0];
  const other = signs[flipped ? 0 : 1];
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.xs }}>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={(v) => onChange(v.replace(/\D/g, '').slice(0, 3))}
        placeholder={label}
        placeholderTextColor={palette.placeholder}
        accessibilityLabel={t('map.degrees_of', { label })}
        editable={!disabled}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={3}
        style={[
          fieldStyle,
          {
            flex: 1,
            minWidth: 0,
            color: palette.ink,
            textAlign: 'right',
            fontVariant: ['tabular-nums'],
            ...(Platform.OS === 'web' ? { width: '100%' } : {}),
          },
        ]}
      />
      <Text style={[TYPE.body, { color: palette.ink2 }]}>°</Text>
      <Btn
        size="sm"
        variant="outline"
        pill
        disabled={disabled}
        onPress={onFlip}
        accessibilityLabel={t('map.flip', {
          now: t(`map.dir_long_${now}`),
          other: t(`map.dir_long_${other}`),
        })}
      >
        {dir(now)}
      </Btn>
    </View>
  );
}
