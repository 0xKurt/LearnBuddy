// Preserve incomplete strings/brackets while restoring null sentinels in completed array elements.
// Closing a partial JSON string ourselves would make partialString falsely announce it as done.
import type { JsonSchema } from './gateway.js';
import { optionalNull, schemaObject } from './azure-schema.js';
import { partialString } from './partial.js';

/** Every real union we emit is tagged (schema-inventory.md); nullable wrappers are unambiguous. */
function objectBranch(schema: JsonSchema, raw: string): JsonSchema {
  if (!Array.isArray(schema.anyOf)) return schema;
  const objects = schema.anyOf.filter(schemaObject).flatMap((s) => {
    const branch = objectBranch(s, raw);
    return branch.type === 'object' ? [branch] : [];
  });
  return (
    objects.find(
      (s) =>
        schemaObject(s.properties) &&
        Object.entries(s.properties).some(
          ([key, v]) =>
            schemaObject(v) &&
            Array.isArray(v.enum) &&
            v.enum.length === 1 &&
            partialString(raw, key)?.text === v.enum[0],
        ),
    ) ?? (objects.length === 1 ? objects[0]! : schema)
  );
}

export function restoreAzurePartial(schema: JsonSchema, raw: string): string {
  let at = 0;
  const whitespace = () => {
    while (/\s/.test(raw[at] ?? '') && at < raw.length) at++;
  };
  const string = (): string => {
    const start = at++;
    while (at < raw.length) {
      const c = raw[at++];
      if (c === '\\') at++;
      else if (c === '"') break;
    }
    return raw.slice(start, at);
  };
  const value = (node: JsonSchema): string => {
    whitespace();
    if (raw[at] === '"') return string();
    if (raw[at] !== '{' && raw[at] !== '[') {
      const start = at;
      while (at < raw.length && !/[\s,}\]]/.test(raw[at]!)) at++;
      return raw.slice(start, at);
    }
    const object = raw[at] === '{';
    const active = object
      ? objectBranch(node, raw.slice(at))
      : Array.isArray(node.anyOf)
        ? node.anyOf.find((s) => schemaObject(s) && s.type === 'array')
        : node;
    const container = schemaObject(active) ? active : {};
    const properties = schemaObject(container.properties) ? container.properties : {};
    const end = object ? '}' : ']';
    at++;
    const entries: string[] = [];
    while (at < raw.length) {
      whitespace();
      if (raw[at] === end) {
        at++;
        return (object ? '{' : '[') + entries.join(',') + end;
      }
      if (raw[at] === ',') {
        at++;
        continue;
      }
      if (at >= raw.length) break;
      if (object) {
        if (raw[at] !== '"') break;
        const keyText = string();
        let key: unknown;
        try {
          key = JSON.parse(keyText);
        } catch {
          entries.push(keyText);
          break;
        }
        whitespace();
        if (raw[at] !== ':') {
          entries.push(keyText);
          break;
        }
        at++;
        const property = typeof key === 'string' ? properties[key] : undefined;
        const text = value(schemaObject(property) ? property : {});
        if (!(typeof key === 'string' && text === 'null' && optionalNull(container, key, null)))
          entries.push(`${keyText}:${text}`);
      } else {
        const items = schemaObject(container.items) ? container.items : {};
        const before = at;
        entries.push(value(items));
        if (at === before) break;
      }
    }
    return (object ? '{' : '[') + entries.join(',');
  };
  return value(schema);
}
