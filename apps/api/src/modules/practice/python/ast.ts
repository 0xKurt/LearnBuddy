// Der Syntaxbaum der Lehr-Teilmenge (issue #262). Nur was hier steht, kann laufen: jede
// Konstruktion, die keinen Knoten hat, lehnt der Parser mit einem Namen ab.

export type BinOpName = '+' | '-' | '*' | '/' | '//' | '%' | '**';
export type CmpOp = '==' | '!=' | '<' | '>' | '<=' | '>=' | 'in' | 'not in' | 'is' | 'is not';

export type Expr = { line: number } & (
  | { e: 'int'; v: bigint }
  | { e: 'float'; v: number }
  | { e: 'str'; v: string }
  /** Ein f-String: Text und eingebettete Ausdrücke im Wechsel; `digits` ist ein `:.Nf`. */
  | { e: 'fstr'; parts: Array<string | { expr: Expr; digits: number | null }> }
  | { e: 'const'; v: null | boolean }
  | { e: 'name'; id: string }
  | { e: 'list'; items: Expr[] }
  | { e: 'tuple'; items: Expr[] }
  | { e: 'dict'; keys: Expr[]; values: Expr[] }
  | { e: 'bin'; op: BinOpName; l: Expr; r: Expr }
  | { e: 'unary'; op: '-' | '+'; x: Expr }
  | { e: 'not'; x: Expr }
  | { e: 'bool'; op: 'and' | 'or'; l: Expr; r: Expr }
  | { e: 'cmp'; first: Expr; rest: Array<{ op: CmpOp; x: Expr }> }
  | { e: 'ifexp'; test: Expr; then: Expr; else: Expr }
  | {
      e: 'call';
      fn: Expr;
      args: Expr[];
      kwargs: Array<{ name: string; value: Expr }>;
    }
  /** `obj.name` — nur als Ziel eines Aufrufs gültig (eine Methode); sonst lehnt der Lauf ab. */
  | { e: 'attr'; obj: Expr; name: string }
  | { e: 'index'; obj: Expr; index: Expr }
  | { e: 'slice'; obj: Expr; lo: Expr | null; hi: Expr | null; step: Expr | null }
);

/** Wohin zugewiesen werden darf: ein Name, eine Stelle einer Liste/eines Dicts, ein Tupel davon. */
export type Target = { line: number } & (
  | { t: 'name'; id: string }
  | { t: 'index'; obj: Expr; index: Expr }
  | { t: 'tuple'; items: Target[] }
);

export type Stmt = { line: number } & (
  | { s: 'expr'; x: Expr }
  | { s: 'assign'; targets: Target[]; value: Expr }
  | { s: 'aug'; target: Target; op: BinOpName; value: Expr }
  | { s: 'if'; test: Expr; body: Stmt[]; orelse: Stmt[] }
  | { s: 'while'; test: Expr; body: Stmt[] }
  | { s: 'for'; target: Target; iter: Expr; body: Stmt[] }
  | { s: 'break' }
  | { s: 'continue' }
  | { s: 'pass' }
  | { s: 'def'; name: string; params: string[]; body: Stmt[]; locals: ReadonlySet<string> }
  | { s: 'return'; value: Expr | null }
);

export type Program = { body: Stmt[] };
