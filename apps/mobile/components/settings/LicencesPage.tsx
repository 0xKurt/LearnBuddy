// "Lizenzen" (ui_kits/app/Flows.jsx `Licences`, issue #493): what the app ships, one group of
// rows per kind — today the packages (lib/licences.json, generated). Each row is a name with its
// licence; a tap opens that licence's text under it, one at a time. A list she browses on
// purpose, so the page may scroll (`scroll-list`, tests/web/fit.ts).
//
// A further kind (the pictures in the tasks, design §8) is one more `LicenceGroup` with its own
// line above it — the page itself does not change.

import { useState } from 'react';
import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { lazyModule } from '../../lib/lazyModule.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { ListGroup, Row } from '../lb/ListGroup.js';
import { BoneLines, SkeletonGroup } from '../lb/Skeleton.js';
import { Hint } from './SettingsPage.js';

const useLicences = lazyModule(() => import('../../lib/licences.js'));

type Entry = {
  /** Unique within the page. */
  id: string;
  title: string;
  licence: string;
  text: string;
};

type GroupProps = {
  /** The line above the group: what these are. */
  hint: string;
  entries: readonly Entry[];
  open: string | null;
  onToggle: (id: string) => void;
};

/** One kind of thing with a licence: its line, then its rows on one card. */
function LicenceGroup({ hint, entries, open, onToggle }: GroupProps) {
  const { palette } = useTheme();
  return (
    <>
      <Hint>{hint}</Hint>
      <ListGroup>
        {entries.map(({ id, title, licence, text }) => {
          const shown = open === id;
          return (
            <Row key={id} title={title} sub={licence} expanded={shown} onPress={() => onToggle(id)}>
              {shown ? (
                <Text selectable style={[TYPE.small, { color: palette.ink2 }]}>
                  {text}
                </Text>
              ) : null}
            </Row>
          );
        })}
      </ListGroup>
    </>
  );
}

export function LicencesPage() {
  const { t } = useTranslation('settings');
  const licences = useLicences()?.LICENCES ?? null;
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (id: string) => setOpen((now) => (now === id ? null : id));

  if (licences === null) {
    return (
      <SkeletonGroup label={t('about.licences_loading')}>
        <BoneLines lines={6} />
      </SkeletonGroup>
    );
  }
  return (
    <LicenceGroup
      hint={t('about.licences_intro')}
      entries={licences.map(({ name, version, licence, text }) => ({
        id: `${name}@${version}`,
        title: `${name} ${version}`,
        licence,
        text,
      }))}
      open={open}
      onToggle={toggle}
    />
  );
}
