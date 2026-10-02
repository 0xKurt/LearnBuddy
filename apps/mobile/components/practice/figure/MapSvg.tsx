// A map from Natural Earth (issue #251): water, the land she is asked about and the land
// around it, rivers, capitals, the illumination zones, the graticule. A "stumme Karte" — no
// names on it, ever: the names are what she is practising.
//
// Drawn in the data's own units (packages/shared-maps), so a zoom is only another viewBox.
// Line widths and text sizes are given in screen points and divided by the scale, so they
// stay the same however far the map is magnified.
//
// What she has chosen and what is marked are never only a colour (UX-PRINCIPLES): a chosen
// shape gets a thick outline, a marked one a filled accent and an outline, a chosen or marked
// city a ring, and the words under the map say the same.

import { Platform } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import {
  graticule,
  mapArea,
  mapFeature,
  mapFeatures,
  type MapAreaId,
  type MapLayer,
} from '../../../../../packages/shared-maps/src/index.js';
import type { MapMark } from '@learnbuddy/shared-types/contracts';

import type { MapWindow } from '../../../lib/maps/mapFrame.js';
import { useTheme } from '../../../lib/theme/ThemeProvider.js';

const FAMILY = Platform.select({
  web: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  default: undefined,
});

/** Graticule labels never closer than this (pt): every second line is labelled when they are. */
const LABEL_GAP = 30;

type Props = {
  area: MapAreaId;
  layer: MapLayer;
  win: MapWindow;
  width: number;
  height: number;
  graticule: boolean;
  /** The feature the question marks (name, coords). */
  mark: MapMark | null;
  /** The feature she has tapped (tap). */
  chosen: string | null;
  /** "N", "S", "O", "W" in her language, for the graticule's numbers. */
  dir: (d: 'N' | 'S' | 'E' | 'W') => string;
};

export function MapSvg({
  area,
  layer,
  win,
  width,
  height,
  graticule: showGrid,
  mark,
  chosen,
  dir,
}: Props) {
  const { figure: ink, palette } = useTheme();
  const a = mapArea(area);
  const scale = width / win.width;
  /** A length in screen points, in map units. */
  const pt = (n: number) => n / scale;
  const areas = mapFeatures(area, 'areas');
  const chosenF = chosen ? mapFeature(area, layer, chosen) : null;
  const grid = showGrid ? graticule(area) : null;
  const visible = (v: number, lo: number, hi: number) => v >= lo - 1e-6 && v <= hi + 1e-6;

  const latLabel = (deg: number) =>
    deg === 0 ? '0°' : `${Math.abs(deg)}° ${dir(deg > 0 ? 'N' : 'S')}`;
  const lonLabel = (deg: number) =>
    deg === 0 ? '0°' : `${Math.abs(deg)}° ${dir(deg > 0 ? 'E' : 'W')}`;

  const lineEvery = (n: number) => Math.max(1, Math.ceil(LABEL_GAP / n));

  return (
    <Svg width={width} height={height} viewBox={`${win.x} ${win.y} ${win.width} ${win.height}`}>
      <Rect x={-a.width} y={-a.height} width={a.width * 3} height={a.height * 3} fill={ink.sea} />

      {/* Land around the area: drawn, never asked about. */}
      {a.context.map((d, i) => (
        <Path
          key={`c${i}`}
          d={d}
          fill={ink.landContext}
          stroke={ink.border}
          strokeWidth={pt(0.6)}
          strokeLinejoin="round"
        />
      ))}

      {/* The countries or Länder. On the areas layer each is a target; on the others land. */}
      {areas.map((f) => {
        const on = layer === 'areas' && f.id === chosen;
        return (
          <Path
            key={f.id}
            d={f.d}
            fill={on ? ink.fillSoft : ink.land}
            stroke={ink.border}
            strokeWidth={pt(layer === 'areas' ? 0.9 : 0.6)}
            strokeLinejoin="round"
          />
        );
      })}

      {/* The illumination zones: the tropics and polar circles as dashed lines, a chosen band
          tinted and outlined. */}
      {layer === 'zones'
        ? mapFeatures(area, 'zones').map((f) => {
            const on = f.id === chosen;
            const [, y0, , y1] = f.box;
            return (
              <G key={f.id}>
                {on ? (
                  <Rect
                    id="map-chosen"
                    x={0}
                    y={y0}
                    width={a.width}
                    height={y1 - y0}
                    fill={ink.fillSoft}
                    stroke={ink.point}
                    strokeWidth={pt(2.5)}
                  />
                ) : null}
                {y0 > 0 ? (
                  <Line
                    x1={0}
                    y1={y0}
                    x2={a.width}
                    y2={y0}
                    stroke={ink.axis}
                    strokeWidth={pt(1.2)}
                    strokeDasharray={`${pt(5)} ${pt(4)}`}
                  />
                ) : null}
              </G>
            );
          })
        : null}

      {grid ? (
        <G>
          {grid.lats.map((l) => (
            <Line
              key={`la${l.deg}`}
              x1={0}
              y1={l.at}
              x2={a.width}
              y2={l.at}
              stroke={ink.gridStrong}
              strokeWidth={pt(l.deg === 0 ? 1.4 : 0.8)}
            />
          ))}
          {grid.lons.map((l) => (
            <Line
              key={`lo${l.deg}`}
              x1={l.at}
              y1={0}
              x2={l.at}
              y2={a.height}
              stroke={ink.gridStrong}
              strokeWidth={pt(l.deg === 0 ? 1.4 : 0.8)}
            />
          ))}
        </G>
      ) : null}

      {/* Rivers: a line each; the chosen one thicker and in the accent. */}
      {layer === 'rivers' || area === 'germany'
        ? mapFeatures(area, 'rivers').map((f) => {
            const on = layer === 'rivers' && f.id === chosen;
            return (
              <Path
                key={f.id}
                d={f.d}
                fill="none"
                stroke={on ? ink.point : ink.river}
                strokeWidth={pt(on ? 4 : layer === 'rivers' ? 2.2 : 1.2)}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })
        : null}

      {/* The capitals she taps among (layer cities, ask tap). */}
      {layer === 'cities' && mark === null
        ? mapFeatures(area, 'cities').map((f) => {
            const on = f.id === chosen;
            return (
              <G key={f.id}>
                {on ? (
                  <Circle
                    cx={f.anchor[0]}
                    cy={f.anchor[1]}
                    r={pt(11)}
                    fill={ink.fillSoft}
                    stroke={ink.point}
                    strokeWidth={pt(2.5)}
                  />
                ) : null}
                <Circle
                  cx={f.anchor[0]}
                  cy={f.anchor[1]}
                  r={pt(on ? 5 : 4)}
                  fill={on ? ink.point : ink.stroke}
                  stroke={ink.paper}
                  strokeWidth={pt(1.5)}
                />
              </G>
            );
          })
        : null}

      {/* Her chosen shape, outlined on top of its neighbours (a fill alone would be colour). */}
      {chosenF && chosenF.form === 'shape' && layer === 'areas' ? (
        <Path
          // The walkthrough reads which feature is chosen off this outline (tests/web/maps.spec.ts).
          id="map-chosen"
          d={chosenF.d}
          fill="none"
          stroke={ink.point}
          strokeWidth={pt(3)}
          strokeLinejoin="round"
        />
      ) : null}

      {/* What the question marks. */}
      {mark?.form === 'path' ? (
        layer === 'rivers' ? (
          <G>
            <Path
              d={mark.d}
              fill="none"
              stroke={ink.paper}
              strokeWidth={pt(8)}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Path
              d={mark.d}
              fill="none"
              stroke={ink.point}
              strokeWidth={pt(4.5)}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </G>
        ) : (
          <Path
            d={mark.d}
            fill={ink.fill}
            fillOpacity={layer === 'zones' ? 0.55 : 1}
            stroke={ink.point}
            strokeWidth={pt(2.5)}
            strokeLinejoin="round"
          />
        )
      ) : null}
      {mark?.form === 'point' ? (
        <G>
          <Circle
            cx={mark.x}
            cy={mark.y}
            r={pt(12)}
            fill="none"
            stroke={ink.point}
            strokeWidth={pt(2.5)}
          />
          <Circle
            cx={mark.x}
            cy={mark.y}
            r={pt(5)}
            fill={ink.point}
            stroke={ink.paper}
            strokeWidth={pt(1.5)}
          />
        </G>
      ) : null}

      {/* The graticule's degrees last, so no land covers them: latitudes at the left edge,
          longitudes at the bottom edge of what is shown. */}
      {grid ? (
        <G>
          {grid.lats
            .filter((l) => visible(l.at, win.y + pt(10), win.y + win.height - pt(18)))
            .filter((_, i, all) => {
              const every = lineEvery(
                all.length > 1 ? Math.abs(all[1]!.at - all[0]!.at) * scale : LABEL_GAP,
              );
              return i % every === 0;
            })
            .map((l) => (
              <SvgText
                key={`tla${l.deg}`}
                fontFamily={FAMILY}
                x={win.x + pt(4)}
                y={l.at - pt(3)}
                fontSize={pt(11)}
                fontWeight="600"
                fill={palette.ink2}
              >
                {latLabel(l.deg)}
              </SvgText>
            ))}
          {grid.lons
            .filter((l) => visible(l.at, win.x + pt(22), win.x + win.width - pt(22)))
            .filter((_, i, all) => {
              const every = lineEvery(
                all.length > 1 ? Math.abs(all[1]!.at - all[0]!.at) * scale : LABEL_GAP,
              );
              return i % every === 0;
            })
            .map((l) => (
              <SvgText
                key={`tlo${l.deg}`}
                fontFamily={FAMILY}
                x={l.at}
                y={win.y + win.height - pt(5)}
                fontSize={pt(11)}
                fontWeight="600"
                fill={palette.ink2}
                textAnchor="middle"
              >
                {lonLabel(l.deg)}
              </SvgText>
            ))}
        </G>
      ) : null}
    </Svg>
  );
}
