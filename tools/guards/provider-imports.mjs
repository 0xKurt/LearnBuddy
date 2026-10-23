// Provider SDKs belong to adapters (#893); no implicit eval/test exemption.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { REPO_ROOT } from './measure.mjs';

const ADAPTERS = /^apps\/api\/src\/(llm|speech|embeddings)\//;
const EVAL_IMPORTS = new Map([
  ['apps/api/evals/schema/inventory.ts', new Set(['@google/genai'])],
  ['apps/api/evals/requests/measure.ts', new Set(['@google/genai/tokenizer/node'])],
]);
/** @param {string} path @param {string} source @returns {string[]} */
export function providerImportProblems(path, source) {
  if (ADAPTERS.test(path)) return [];
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  /** @type {string[]} */
  const problems = [];
  /** @param {import('typescript').Node} node */
  const visit = (node) => {
    let specifier;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      specifier = node.moduleSpecifier;
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
      specifier = node.argument.literal;
    else if (ts.isExternalModuleReference(node)) specifier = node.expression;
    else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    )
      specifier = node.arguments[0];
    if (
      specifier &&
      ts.isStringLiteralLike(specifier) &&
      /^(openai|@google\/genai)(\/|$)/.test(specifier.text) &&
      !EVAL_IMPORTS.get(path)?.has(specifier.text)
    )
      problems.push(`${path}: ${specifier.text} gehört in einen Adapter`);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return problems;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const paths = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  )
    .split('\0')
    .filter((path) => /\.[cm]?[jt]sx?$/.test(path));
  const problems = [...new Set(paths)].flatMap((path) => {
    try {
      return providerImportProblems(path, readFileSync(`${REPO_ROOT}/${path}`, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  });
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exitCode = 1;
  } else
    console.log('✓ Anbieter-SDKs nur in Adaptern; zwei explizite bestehende Eval-Importe (#893)');
}
