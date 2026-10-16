-- Ein Blatt mit mehr großen Fotos, als ein Lesen dem Modell mitgeben kann, sagt das selbst
-- (issue #688, Nacharbeit zu KI-Audit K17).
--
-- Seit #688 weist der Modellzugang eine Anfrage ab, die mehr eingebettete Medien trägt, als der
-- Anbieter annimmt (`GatewayProfile.maxInlineBytes`), bevor sie gesendet wird. Ein Blatt, dessen
-- Fotos zusammen darüber liegen, endete damit als `model_error` mit „Nochmal lesen“, was mit
-- denselben Fotos nie hilft. Jetzt endet es als `too_large`: endgültig, und sie liest „schick es in
-- zwei Teilen“.
--
-- Der neunte Grund, eingetragen wie 0093 den achten eintrug.
alter table materials drop constraint materials_failure_reason_check;
alter table materials
  add constraint materials_failure_reason_check check (failure_reason in (
    'photos_missing','unreadable','not_learning_material','model_error','budget_exhausted','blocked',
    'form_not_practicable','nothing_marked','too_large'
  ));
