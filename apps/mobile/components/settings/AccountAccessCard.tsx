// Sign-in details in the parents' area: change the account's e-mail address
// (Supabase Auth, lib/auth/supabase.ts) or password (PUT /account/password,
// so the server checks the parents' PIN too). For a minor's profile the
// parents' PIN comes first — this is the adults' login, not the child's — and
// counts for this one sheet: closing it drops the admin token.
// An e-mail change is only asked for here: Supabase sends confirmation links
// (with secure e-mail change to the old and the new address) and the new
// address counts only once confirmed, so that is what the sheet says.

import { useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { adminToken, clearAdminToken } from '../../lib/admin.js';
import { useAnnounce } from '../../lib/announce.js';
import { setPassword as savePasswordOnServer } from '../../lib/api/endpoints.js';
import { looksLikeEmail, passwordProblem } from '../../lib/auth/recovery.js';
import { changeEmail } from '../../lib/auth/supabase.js';
import { messageFor } from '../../lib/errors.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { TYPE } from '../../lib/theme/type.js';
import { NewPasswordFields } from '../auth/NewPasswordFields.js';
import { Btn } from '../lb/Btn.js';
import { Card } from '../lb/Card.js';
import { LbTextInput } from '../lb/LbTextInput.js';
import { Sheet } from '../lb/Sheet.js';
import { toast } from '../lb/Toast.js';
import { AdultCancelled, afterModalCloses, asAdultIfNeeded, confirmAdult } from './adultGate.js';
import { Divider, Row } from './Row.js';

type Props = {
  minor: boolean;
  pinSet: boolean;
  /** The account's e-mail from the stored session ('' when unknown). */
  email: string;
  /** False while another account task runs (AdultSection). */
  enabled: boolean;
};

type Open = 'email' | 'password' | null;

export function AccountAccessCard({ minor, pinSet, email, enabled }: Props) {
  const { palette } = useTheme();
  const { t } = useTranslation(['settings', 'common']);
  const [open, setOpen] = useState<Open>(null);
  const [opening, setOpening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  // Shown inside the sheet: a toast would sit under the open modal on iOS.
  const [failure, setFailure] = useState<string | null>(null);

  async function start(which: Exclude<Open, null>) {
    if (opening) return;
    setOpening(true);
    try {
      if (minor) {
        const prompted = adminToken() === null;
        await confirmAdult(pinSet, 'credentials');
        // The PIN screen has to be gone before the sheet can open.
        if (prompted) await afterModalCloses();
      }
      setNewEmail('');
      setPendingEmail(null);
      setPassword('');
      setRepeat('');
      setFailure(null);
      setOpen(which);
    } catch (err) {
      if (err instanceof AdultCancelled) {
        if (err.reason === 'no_pin') toast.show(t('settings:pin_first'));
      } else {
        toast.show(messageFor(err), 'error');
      }
    } finally {
      setOpening(false);
    }
  }

  function close() {
    setOpen(null);
    setPassword('');
    setRepeat('');
    // The PIN was for this sheet only.
    clearAdminToken();
  }

  const emailValid =
    looksLikeEmail(newEmail) && newEmail.trim().toLowerCase() !== email.toLowerCase();
  const passwordValid = passwordProblem(password, repeat) === null;

  async function saveEmail() {
    if (!emailValid || busy) return;
    setBusy(true);
    setFailure(null);
    const address = newEmail.trim();
    try {
      const result = await changeEmail(address);
      if (result === 'changed') {
        toast.show(t('settings:adult.access.email_changed'));
        close();
      } else {
        setPendingEmail(address);
      }
    } catch (err) {
      setFailure(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  async function savePassword() {
    if (!passwordValid || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      // The server checks the parents' PIN itself (asks again if it lapsed meanwhile).
      const done = await asAdultIfNeeded(() => savePasswordOnServer(password), {
        pinSet,
        purpose: 'credentials',
      });
      // Never claim the other devices are out when the revoke could not be confirmed
      // (issue #131, CLAUDE.md rule 5) — the password is set either way.
      toast.show(
        t(
          done.others_signed_out === false
            ? 'settings:adult.access.password_saved_others_unsure'
            : 'settings:adult.access.password_saved',
        ),
      );
      close();
    } catch (err) {
      setFailure(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  const locked = !enabled || opening;

  return (
    <>
      <Card padding={18}>
        <View style={{ gap: 16 }}>
          <Row
            question={t('settings:adult.access.email_title')}
            answer={email || undefined}
            hint={email ? undefined : t('settings:adult.access.email_unknown')}
          >
            {minor ? (
              <Text style={[TYPE.body, { color: palette.ink2 }]}>
                {t('settings:adult.needs_pin')}
              </Text>
            ) : null}
            <Btn pill variant="outline" onPress={() => void start('email')} disabled={locked}>
              {t('settings:adult.access.email_cta')}
            </Btn>
          </Row>
          <Divider />
          <Row question={t('settings:adult.access.password_title')}>
            {minor ? (
              <Text style={[TYPE.body, { color: palette.ink2 }]}>
                {t('settings:adult.needs_pin')}
              </Text>
            ) : null}
            <Btn pill variant="outline" onPress={() => void start('password')} disabled={locked}>
              {t('settings:adult.access.password_cta')}
            </Btn>
          </Row>
        </View>
      </Card>

      <Sheet
        visible={open === 'email'}
        title={t('settings:adult.access.email_sheet_title')}
        closeLabel={pendingEmail ? t('settings:adult.access.done') : t('common:actions.cancel')}
        onClose={close}
        footer={
          pendingEmail ? undefined : (
            <Btn pill full busy={busy} disabled={!emailValid} onPress={() => void saveEmail()}>
              {busy ? t('settings:adult.access.sending') : t('settings:adult.access.email_save')}
            </Btn>
          )
        }
      >
        {pendingEmail ? (
          <Card tone="mint">
            <Text style={TYPE.title}>{t('settings:adult.access.email_pending_title')}</Text>
            <Text style={[TYPE.body, { marginTop: 4 }]} accessibilityLiveRegion="polite">
              {email
                ? t('settings:adult.access.email_pending_body', {
                    old_email: email,
                    new_email: pendingEmail,
                  })
                : t('settings:adult.access.email_pending_body_no_old', {
                    new_email: pendingEmail,
                  })}
            </Text>
          </Card>
        ) : (
          <>
            <Text style={TYPE.body}>{t('settings:adult.access.email_intro')}</Text>
            <LbTextInput
              value={newEmail}
              onChangeText={setNewEmail}
              placeholder={t('settings:adult.access.email_new')}
              accessibilityLabel={t('settings:adult.access.email_new')}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="send"
              onSubmitEditing={() => void saveEmail()}
            />
            <Failure text={failure} />
          </>
        )}
      </Sheet>

      <Sheet
        visible={open === 'password'}
        title={t('settings:adult.access.password_sheet_title')}
        closeLabel={t('common:actions.cancel')}
        onClose={close}
        footer={
          <Btn pill full busy={busy} disabled={!passwordValid} onPress={() => void savePassword()}>
            {busy ? t('settings:adult.access.saving') : t('settings:adult.access.password_save')}
          </Btn>
        }
      >
        <Text style={TYPE.body}>{t('settings:adult.access.password_intro')}</Text>
        <NewPasswordFields
          password={password}
          repeat={repeat}
          onChangePassword={setPassword}
          onChangeRepeat={setRepeat}
          onSubmit={() => void savePassword()}
        />
        <Failure text={failure} />
      </Sheet>
    </>
  );
}

function Failure({ text }: { text: string | null }) {
  const { palette } = useTheme();
  // iOS has no live regions: the failure says itself (lib/announce.ts).
  useAnnounce(text);
  if (!text) return null;
  return (
    <Text accessibilityLiveRegion="polite" style={[TYPE.body, { color: palette.danger }]}>
      {text}
    </Text>
  );
}
