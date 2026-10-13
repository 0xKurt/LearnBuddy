// "Lizenzen" (ui_kits/app/Flows.jsx `Licences`, issue #493): what the app ships, one group of
// rows per kind — the packages (lib/licences.json, generated) and the pictures in the tasks
// (lib/figureLicences.ts, issue #599: every entry of both `assets/figures/**/sources.json`). Each
// row is a name with its licence; a tap opens what that licence asks to travel with it under the
// row, one at a time: a package's licence text; a picture's attribution sentence, what we changed,
// and the ways to its licence and its source. A list she browses on purpose, so the page may
// scroll (`scroll-list`, tests/web/fit.ts).

import { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { lazyModule } from '../../lib/lazyModule.js';
import { SPACE } from '../../lib/theme/space.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import { ListGroup, Row } from '../lb/ListGroup.js';
import { BoneLines, SkeletonGroup } from '../lb/Skeleton.js';
import { toast } from '../lb/Toast.js';
import { Hint } from './SettingsPage.js';

const useLicences = lazyModule(() => import('../../lib/licences.js'));
const useFigureLicences = lazyModule(() => import('../../lib/figureLicences.js'));

type Entry = {
  /** Unique within the page. */
  id: string;
  title: string;
  licence: string;
  text: string;
  /** Where its licence and its source can be read, each a button under the text. */
  links?: ReadonlyArray<{ label: string; url: string }>;
};

type GroupProps = {
  /** The line above the group: what these are. */
  hint: string;
  entries: readonly Entry[];
  open: string | null;
  onToggle: (id: string) => void;
  /** Opens one of an entry's links. */
  onLink: (url: string) => void;
};

/** One kind of thing with a licence: its line, then its rows on one card. */
function LicenceGroup({ hint, entries, open, onToggle, onLink }: GroupProps) {
  const { palette } = useTheme();
  return (
    <>
      <Hint>{hint}</Hint>
      <ListGroup>
        {entries.map(({ id, title, licence, text, links = [] }) => {
          const shown = open === id;
          return (
            <Row key={id} title={title} sub={licence} expanded={shown} onPress={() => onToggle(id)}>
              {shown ? (
                <View style={{ gap: SPACE.sm }}>
                  <Text selectable style={[TYPE.small, { color: palette.ink2 }]}>
                    {text}
                  </Text>
                  {links.map(({ label, url }) => (
                    <Btn key={url + label} variant="ghost" size="sm" onPress={() => onLink(url)}>
                      {label}
                    </Btn>
                  ))}
                </View>
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
  const figures = useFigureLicences()?.FIGURE_LICENCES ?? null;
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (id: string) => setOpen((now) => (now === id ? null : id));
  const openLink = (url: string) => {
    Linking.openURL(url).catch(() => toast.show(t('about.open_failed'), 'error'));
  };

  if (licences === null || figures === null) {
    return (
      <SkeletonGroup label={t('about.licences_loading')}>
        <BoneLines lines={6} />
      </SkeletonGroup>
    );
  }
  return (
    <>
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
        onLink={openLink}
      />
      {/* The pictures in the tasks (#599): every entry of both sources.json files, none left out. */}
      <LicenceGroup
        hint={t('about.figures_intro')}
        entries={figures.map((f) => ({
          id: `figure:${f.files.join()}:${f.title}`,
          // The work's title without its file ending, as the source names it.
          title: f.title.replace(/\.(svg|png|jpe?g)$/i, ''),
          licence: f.licence === 'Public domain' ? t('about.figures_public_domain') : f.licence,
          // The finished sentence the source asks for, then what we changed.
          text: `${f.attribution}\n${t('about.figures_edited', { what: f.edited })}`,
          links: [
            ...(f.licenceUrl ? [{ label: t('about.figures_licence'), url: f.licenceUrl }] : []),
            { label: t('about.figures_source'), url: f.source },
          ],
        }))}
        open={open}
        onToggle={toggle}
        onLink={openLink}
      />
    </>
  );
}
