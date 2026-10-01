# Bestätigungs-E-Mail: der Klick ist die bestätigte Einwilligung

> **Das muss der Owner selbst einpflegen — niemand sonst kommt an die Vorlagen.**
> Supabase-Konsole → **Authentication → Emails → Templates → „Confirm signup"**: Betreff in
> _Subject heading_, Text in den _Message body_. Die Vorlagen liegen im Supabase-Projekt, nicht
> im Repo: weder eine Migration noch ein Deployment kann sie ändern.

## Warum dieser Text

Die Bestätigung der E-Mail-Adresse ist ohnehin erzwungen (Supabase Auth, _Confirm email_ an):
ohne den Klick auf den Link gibt es keine Sitzung, niemand kommt in die App. Neu ist nur, was
die Mail **sagt** — dass dieser Klick die Einwilligung bestätigt, die beim Anlegen des Kontos
gegeben wurde. Damit ist die Eltern-E-Mail-Schleife der nachprüfbare Schritt, den der EDPB als
angemessene Anstrengung zur Prüfung der elterlichen Einwilligung beschreibt (Guidelines 05/2020
on consent, Beispiel 23; Issue #30).

Der Klick wird protokolliert: die API schreibt beim ersten Request, der eine bestätigte Adresse
trägt, den Zeitpunkt, den Supabase für den Klick festgehalten hat, nach
`accounts.consent_confirmed_at` — einmal, nie überschrieben (`docs/privacy.md` §Accounts and
minors, `docs/dpia.md` §5 R8). **Nichts hängt davon ab.** Es gibt keine Sperre und kein Warten:
eine Mail, die im Spam landet oder liegen bleibt, sperrt niemanden aus dem eigenen Lernen aus.

## Vorlagen und Sprachen

Die Konsole hält **eine** Vorlage je Mail-Art für das ganze Projekt. Welche Sprache sie trägt,
entscheidet der Owner; für den Familienstart ist das die deutsche. Die vier Übersetzungen stehen
hier, damit der Text in jeder Sprache existiert, die die App spricht (CLAUDE.md §Tone & copy) —
einsetzbar, sobald die Mail über einen eigenen Versand mit Sprachwahl geht.

- `{{ .ConfirmationURL }}` ist der Bestätigungslink; Supabase setzt ihn ein.
- Die Adresse der Datenschutzerklärung kennt die Vorlage nicht: **`PRIVACY_URL` unten durch die
  Adresse ersetzen**, die auch `EXPO_PUBLIC_PRIVACY_URL` in der App trägt.
- Angeredet wird mit „du" — so spricht die App mit allen, auch mit den Eltern
  (`apps/mobile/locales/<lang>/auth.json`). Ein „Sie" in der Mail wäre ein Bruch mit ihrem Ton.
- Der Text ist als HTML-Body gedacht (Supabase versendet HTML); die Absätze sind `<p>`, die
  Punkte eine `<ul>`.

## Was im Text stehen bleiben muss

Wenn der Owner umformuliert, müssen diese sieben Dinge drinbleiben:

1. der ausdrückliche Bestätigungscharakter („Mit dem Klick bestätigst du die Einwilligung …"),
2. wer bestätigt: die sorgeberechtigte Person für ein Kind unter 16 — oder man selbst, ab 16,
3. worum es geht, in denselben Punkten wie im Einwilligungs-Screen
   (`locales/<lang>/auth.json` → `consent.point_*`),
4. der Link auf die vollständige Datenschutzerklärung,
5. der Widerruf: jederzeit, und wo er steht,
6. ein Satz für den Fall, dass jemand das Konto nicht angelegt hat,
7. keine Frist, keine Drohung, kein „sonst".

---

## Deutsch

**Betreff:** Ein Klick noch: die Einwilligung für LearnBuddy bestätigen

```html
<p>Schön, dass ihr LearnBuddy ausprobiert.</p>

<p>
  <strong>Mit dem Klick auf den Link bestätigst du die Einwilligung</strong>, die du gerade beim
  Anlegen des Kontos gegeben hast: als sorgeberechtigte Person für dein Kind (DSGVO Art. 8) oder für
  dich selbst, wenn du ab 16 selbst lernst.
</p>

<p><a href="{{ .ConfirmationURL }}">Einwilligung bestätigen und loslegen</a></p>

<p>Worum es dabei geht, in Kürze:</p>

<ul>
  <li>
    Wir speichern, was im Chat mit Buddy steht, die Arbeitsblätter und wie die Übungen laufen. Nur
    so kann Buddy beim Lernen helfen.
  </li>
  <li>Fotos löschen wir spätestens 7 Tage, nachdem Buddy sie gelesen hat.</li>
  <li>Buddy nutzt eine KI von Google Cloud mit Servern in der EU.</li>
  <li>Keine Werbung, kein Weiterverkauf – und wir trainieren keine Modelle mit euren Daten.</li>
  <li>
    Push-Benachrichtigungen aufs Handy schickt Buddy nur, wenn das erlaubt ist. Bei unter
    16-Jährigen erlauben es die Eltern – mit ihrer PIN.
  </li>
  <li>Alles lässt sich jederzeit ansehen, ändern und löschen.</li>
</ul>

<p>
  Ausführlich steht das in der <a href="PRIVACY_URL">Datenschutzerklärung</a>. Du kannst die
  Einwilligung jederzeit widerrufen: im Elternbereich der App unter „Konto löschen" – dort gibt es
  auch den Export aller gespeicherten Daten.
</p>

<p>
  Du hast kein Konto angelegt? Dann ignorier diese E-Mail einfach. Ohne den Klick passiert nichts,
  und die Adresse wird nicht weiter verwendet.
</p>
```

---

## English

**Subject:** One click left: confirm your consent for LearnBuddy

```html
<p>Lovely that you are giving LearnBuddy a try.</p>

<p>
  <strong>Clicking the link confirms the consent</strong> you just gave when the account was
  created: as the person with parental responsibility for your child (GDPR Art. 8), or for yourself
  if you are 16 or older and learning yourself.
</p>

<p><a href="{{ .ConfirmationURL }}">Confirm consent and get started</a></p>

<p>What it is about, in brief:</p>

<ul>
  <li>
    We store what is written in the chat with Buddy, the worksheets and how practice goes. That's
    the only way Buddy can help with learning.
  </li>
  <li>We delete photos at the latest 7 days after Buddy has read them.</li>
  <li>Buddy uses an AI by Google Cloud with servers in the EU.</li>
  <li>No advertising, nothing sold on – and we train no models on your data.</li>
  <li>
    Buddy only sends push notifications to the phone if that is allowed. For under 16s, the parents
    allow it – with their PIN.
  </li>
  <li>Everything can be viewed, changed and deleted at any time.</li>
</ul>

<p>
  The full version is in the <a href="PRIVACY_URL">privacy policy</a>. You can withdraw your consent
  at any time: in the parents' area of the app under "Delete account" – where you will also find the
  export of everything stored.
</p>

<p>
  You did not create an account? Then simply ignore this e-mail. Without the click nothing happens,
  and the address is not used any further.
</p>
```

---

## Français

**Objet :** Un clic encore : confirme le consentement pour LearnBuddy

```html
<p>Merci d'essayer LearnBuddy.</p>

<p>
  <strong>En cliquant sur le lien, tu confirmes le consentement</strong> que tu viens de donner en
  créant le compte : en tant que titulaire de la responsabilité parentale pour ton enfant (RGPD art.
  8), ou pour toi-même si tu as 16 ans ou plus et que c'est toi qui apprends.
</p>

<p><a href="{{ .ConfirmationURL }}">Confirmer le consentement et commencer</a></p>

<p>De quoi il s'agit, en bref :</p>

<ul>
  <li>
    Nous conservons ce qui est écrit dans le chat avec Buddy, les fiches de travail et le
    déroulement des exercices. C'est la seule façon pour Buddy d'aider à apprendre.
  </li>
  <li>Nous supprimons les photos au plus tard 7 jours après que Buddy les a lues.</li>
  <li>Buddy utilise une IA de Google Cloud, avec des serveurs dans l'UE.</li>
  <li>Pas de publicité, rien de revendu – et nous n'entraînons aucun modèle avec vos données.</li>
  <li>
    Buddy n'envoie des notifications push sur le téléphone que si c'est autorisé. Pour les moins de
    16 ans, ce sont les parents qui l'autorisent – avec leur code PIN.
  </li>
  <li>Tout peut être consulté, modifié et supprimé à tout moment.</li>
</ul>

<p>
  Le détail se trouve dans la
  <a href="PRIVACY_URL">politique de confidentialité</a>. Tu peux retirer ton consentement à tout
  moment : dans l'espace parents de l'application, sous « Supprimer le compte » – tu y trouveras
  aussi l'export de toutes les données conservées.
</p>

<p>
  Tu n'as pas créé de compte ? Ignore simplement cet e-mail. Sans le clic, il ne se passe rien et
  l'adresse n'est pas utilisée davantage.
</p>
```

---

## Español

**Asunto:** Un clic más: confirma el consentimiento para LearnBuddy

```html
<p>Nos alegra que probéis LearnBuddy.</p>

<p>
  <strong>Al tocar el enlace confirmas el consentimiento</strong> que acabas de dar al crear la
  cuenta: como titular de la patria potestad o tutela de tu hijo o tu hija (RGPD art. 8), o para ti
  mismo o ti misma si tienes 16 años o más y eres quien aprende.
</p>

<p><a href="{{ .ConfirmationURL }}">Confirmar el consentimiento y empezar</a></p>

<p>De qué se trata, en resumen:</p>

<ul>
  <li>
    Guardamos lo que se escribe en el chat con Buddy, las fichas y cómo van los ejercicios. Solo así
    puede Buddy ayudar a aprender.
  </li>
  <li>Eliminamos las fotos, a más tardar, 7 días después de que Buddy las haya leído.</li>
  <li>Buddy usa una IA de Google Cloud con servidores en la UE.</li>
  <li>Sin publicidad, sin venta de datos – y no entrenamos ningún modelo con vuestros datos.</li>
  <li>
    Buddy solo envía notificaciones push al móvil si está permitido. En el caso de menores de 16
    años, lo permiten los padres, con su PIN.
  </li>
  <li>Todo se puede ver, cambiar y borrar en cualquier momento.</li>
</ul>

<p>
  Con detalle está en la <a href="PRIVACY_URL">política de privacidad</a>. Puedes retirar el
  consentimiento cuando quieras: en el área de padres de la app, en «Eliminar la cuenta»; allí
  también está la exportación de todo lo guardado.
</p>

<p>
  ¿No has creado ninguna cuenta? Ignora este correo sin más. Sin el clic no ocurre nada y la
  dirección no se usa para nada más.
</p>
```

---

## Italiano

**Oggetto:** Manca un clic: conferma il consenso per LearnBuddy

```html
<p>Che bello che proviate LearnBuddy.</p>

<p>
  <strong>Toccando il link confermi il consenso</strong> che hai appena dato creando l'account: come
  titolare della responsabilità genitoriale per tuo figlio o tua figlia (GDPR art. 8), oppure per te
  se hai 16 anni o più e sei tu a imparare.
</p>

<p><a href="{{ .ConfirmationURL }}">Conferma il consenso e inizia</a></p>

<p>Di che cosa si tratta, in breve:</p>

<ul>
  <li>
    Conserviamo quello che viene scritto nella chat con Buddy, le schede e l'andamento degli
    esercizi. Solo così Buddy può aiutare a imparare.
  </li>
  <li>Cancelliamo le foto al più tardi 7 giorni dopo che Buddy le ha lette.</li>
  <li>Buddy usa un'IA di Google Cloud con server nell'UE.</li>
  <li>Niente pubblicità, niente vendita dei dati – e non addestriamo modelli con i vostri dati.</li>
  <li>
    Buddy manda notifiche push sul telefono solo se è permesso. Per chi ha meno di 16 anni lo
    permettono i genitori – con il loro PIN.
  </li>
  <li>Tutto si può vedere, modificare e cancellare in qualsiasi momento.</li>
</ul>

<p>
  Per esteso è nell'<a href="PRIVACY_URL">informativa sulla privacy</a>. Puoi revocare il consenso
  in qualsiasi momento: nell'area genitori dell'app, alla voce «Elimina l'account» – lì c'è anche
  l'esportazione di tutto ciò che è conservato.
</p>

<p>
  Non hai creato nessun account? Allora ignora questa email. Senza il clic non succede nulla e
  l'indirizzo non viene usato oltre.
</p>
```
