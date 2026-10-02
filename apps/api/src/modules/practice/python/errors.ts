// Was ein Programm der Lehr-Teilmenge abbrechen lässt (issue #262).
//
// Drei Familien, und die Unterscheidung ist der Kern dieser Datei:
//   · **Python-Fehler** (`name`, `type`, `zero_division`, …): echtes Python bräche an derselben
//     Stelle mit demselben Fehler ab. Das ist eine Aussage über IHR Programm.
//   · **Grenzen** (`steps`, `memory`, `output`, `recursion`, `too_long`, `number_too_big`): der
//     Interpreter hört auf, bevor er dem Server schadet. Echtes Python liefe vielleicht weiter —
//     eine Endlosschleife ist die häufigste Ursache, aber sicher ist das nicht, und der Text sagt
//     es auch nicht.
//   · **Nicht in der Teilmenge** (`unsupported`): echtes Python könnte das, dieser Interpreter
//     nicht. Das ist NIE ein Urteil über ihr Programm, und es darf nie wie eines aussehen —
//     `input()` ist kein NameError, nur weil es hier fehlt.

export type PyErrorKind =
  // Python-Fehler
  | 'syntax'
  | 'indent'
  | 'name'
  | 'unbound_local'
  | 'type'
  | 'value'
  | 'zero_division'
  | 'index'
  | 'key'
  | 'attribute'
  | 'runtime'
  | 'recursion'
  // Grenzen
  | 'steps'
  | 'memory'
  | 'output'
  | 'too_long'
  | 'number_too_big'
  // nicht in der Teilmenge
  | 'unsupported';

/** Die Fehler, die echtes Python an derselben Stelle ebenso werfen würde. */
export const PYTHON_ERRORS: ReadonlySet<PyErrorKind> = new Set([
  'name',
  'unbound_local',
  'type',
  'value',
  'zero_division',
  'index',
  'key',
  'attribute',
  'runtime',
]);

export class PyError extends Error {
  constructor(
    readonly kind: PyErrorKind,
    /** Die 1-basierte Zeile, in der es passiert ist. */
    readonly line: number,
    /**
     * Ein Name, wenn einer dazugehört (`name`: der unbekannte Bezeichner, `unsupported`: was
     * fehlt). Immer nur Bezeichnerzeichen oder ein festes Wort — nie freier Text aus dem
     * Programm, damit nichts davon ungeprüft in eine Antwort gerät.
     */
    readonly detail: string | null = null,
  ) {
    super(`${kind} in line ${line}${detail ? ` (${detail})` : ''}`);
    this.name = 'PyError';
  }
}
