// The small menu behind the input bar's + (issues #82, #519): Kamera · Fotos · Dateien, and one
// line that helps — what the pages are for when a place asked for them (the homework, the pages
// Buddy could not read, a page for a sheet), or the photo tip. Each choice opens the system's
// camera or picker at once; the pages land above her text. It is the one way to a photo: the
// screen of its own that asked the same again and then wanted "Senden" is gone (#519).

import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { DraftLink } from '../../lib/capture/draft.js';
import type { AttachOpen } from '../../lib/capture/attachRequest.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { Btn } from '../lb/Btn.js';
import type { IconName } from '../lb/Icon.js';
import { Sheet, SHEET_TEXT } from '../lb/Sheet.js';

type Source = Exclude<AttachOpen, 'menu'>;

/** A place that attaches something else than a sheet's pages: its words and its sources. */
export type OwnAttach = { title: string; line: string; sources: readonly Source[] };

const SOURCES: readonly { source: Source; icon: IconName }[] = [
  { source: 'camera', icon: 'camera' },
  { source: 'library', icon: 'book' },
  { source: 'files', icon: 'file' },
];

/** The menu's title and its one line: what the pages are for, as the place that asked says it. */
function wording(link: DraftLink): { title: string; line: string } {
  if (link.completes) {
    if (link.add) return { title: 'capture:again.title_add', line: 'capture:again.intro_add' };
    return {
      title: link.pages ? 'capture:again.title_pages' : 'capture:again.title',
      line: 'capture:again.intro',
    };
  }
  if (link.purpose === 'homework')
    return { title: 'capture:homework.title', line: 'capture:homework.intro' };
  return { title: 'buddy:composer.attach.title', line: 'capture:tip' };
}

export function AttachMenu({
  visible,
  link,
  onChoose,
  onClose,
}: {
  visible: boolean;
  /**
   * What the pages will be for — or, in a practice, what the photo is for (#596): her working,
   * read into her answer, from the camera or a photo she already took; no file.
   */
  link: DraftLink | OwnAttach;
  onChoose: (source: Source) => void;
  onClose: () => void;
}) {
  const { palette } = useTheme();
  const { t } = useTranslation(['buddy', 'capture', 'common', 'practice']);
  const { title, line } = 'sources' in link ? link : wording(link);
  const pages = 'sources' in link ? 0 : link.pages;
  const sources =
    'sources' in link ? SOURCES.filter((s) => link.sources.includes(s.source)) : SOURCES;
  return (
    <Sheet
      visible={visible}
      title={t(title, { pages })}
      closeLabel={t('common:actions.close')}
      onClose={onClose}
    >
      <Text style={[TYPE.meta, SHEET_TEXT, { color: palette.ink2 }]}>
        {`${t(line)} ${t('capture:privacy')}`}
      </Text>
      {sources.map(({ source, icon }) => (
        <Btn
          key={source}
          full
          pill
          size="lg"
          variant="quiet"
          icon={icon}
          onPress={() => onChoose(source)}
        >
          {t(`buddy:composer.attach.${source}`)}
        </Btn>
      ))}
    </Sheet>
  );
}
