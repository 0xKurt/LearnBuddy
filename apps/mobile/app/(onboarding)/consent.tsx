// DSGVO consent. Doc 05 §6. Doc 09 §11 supplies the plain-language summary.
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn, Icon } from '../../components/lb/index.js';
import { LB } from '../../lib/theme/colors.js';

export default function ConsentScreen() {
  const { t } = useTranslation('onboarding');
  const [adultOk, setAdultOk] = useState(false);
  const [consentOk, setConsentOk] = useState(false);
  const canContinue = adultOk && consentOk;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: LB.paper }}>
      <View style={{ flex: 1, paddingHorizontal: 28, paddingVertical: 32, justifyContent: 'space-between' }}>
        <View style={{ gap: 14, marginTop: 24 }}>
          <Text style={{ fontSize: 24, fontWeight: '600', color: LB.ink, letterSpacing: -0.5 }}>
            {t('consent.title')}
          </Text>
          <Text style={{ fontSize: 13, color: LB.ink2, lineHeight: 19 }}>
            {t('consent.summary')}
          </Text>
          <View style={{ marginTop: 18, gap: 14 }}>
            <Checkbox value={adultOk} onChange={setAdultOk} label={t('consent.adult_checkbox')} />
            <Checkbox value={consentOk} onChange={setConsentOk} label={t('consent.consent_checkbox')} />
          </View>
        </View>

        <Btn size="lg" full variant={canContinue ? 'primary' : 'ghost'} onPress={() => canContinue && router.push('/(onboarding)/who-uses')}>
          {t('consent.cta')}
        </Btn>
      </View>
    </SafeAreaView>
  );
}

function Checkbox({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Pressable onPress={() => onChange(!value)} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          borderWidth: 1.5,
          borderColor: value ? LB.primary : LB.ink4,
          backgroundColor: value ? LB.primary : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {value && <Icon name="check" size={16} color="#fff" />}
      </View>
      <Text style={{ flex: 1, fontSize: 13, color: LB.ink, lineHeight: 19 }}>{label}</Text>
    </Pressable>
  );
}
