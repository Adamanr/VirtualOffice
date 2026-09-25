// Generates shared/protocol.gen.ts from shared/protocol.json (the single source of truth).
// Usage: node scripts/gen-protocol.mjs [--check]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const shared = resolve(dirname(fileURLToPath(import.meta.url)), '../../shared');
const proto = JSON.parse(readFileSync(resolve(shared, 'protocol.json'), 'utf8'));
const pascal = (s) => s.replace(/(^|_)(\w)/g, (_, __, c) => c.toUpperCase());
const tsType = (t) => t.replace(/\binteger\b/g, 'number');

function obj(fields, indent = '  ') {
  const entries = Object.entries(fields);
  if (entries.length === 0) return '{}';
  const lines = entries.map(([k, t]) => {
    const opt = k.endsWith('?');
    return `${indent}${opt ? k.slice(0, -1) : k}${opt ? '?' : ''}: ${tsType(t)};`;
  });
  return `{\n${lines.join('\n')}\n${indent.slice(2)}}`;
}

const out = [];
out.push('// AUTO-GENERATED from shared/protocol.json by client/scripts/gen-protocol.mjs. Do not edit.');
out.push('/* eslint-disable */');
out.push(`export const PROTOCOL_VERSION = ${proto.version};`, '');
for (const [name, values] of Object.entries(proto.enums)) {
  out.push(`export const ${name} = ${JSON.stringify(values)} as const;`);
  out.push(`export type ${name} = (typeof ${name})[keyof typeof ${name}];`, '');
}
for (const [name, def] of Object.entries(proto.types)) {
  out.push(typeof def === 'string' ? `export type ${name} = ${tsType(def)};` : `export interface ${name} ${obj(def)}`, '');
}
out.push(`export interface JoinParams ${obj(proto.join.params)}`, '');
out.push(`export interface JoinReply ${obj(proto.join.reply)}`, '');
out.push(`export type JoinError = ${proto.join.errors.map((e) => `'${e}'`).join(' | ')};`, '');
for (const [name, ev] of Object.entries(proto.client)) {
  out.push(`export interface ${pascal(name)}Payload ${obj(ev.payload)}`);
  if (ev.reply) out.push(`export interface ${pascal(name)}Reply ${obj(ev.reply)}`);
  out.push('');
}
out.push('export interface ClientEvents {');
for (const [name, ev] of Object.entries(proto.client)) {
  out.push(`  ${name}: { payload: ${pascal(name)}Payload; reply: ${ev.reply ? `${pascal(name)}Reply` : 'null'} };`);
}
out.push('}', '');
for (const [name, fields] of Object.entries(proto.server)) out.push(`export interface ${pascal(name)}Event ${obj(fields)}`, '');
out.push('export interface ServerEvents {');
for (const name of Object.keys(proto.server)) out.push(`  ${name}: ${pascal(name)}Event;`);
out.push('}', '');
out.push(`export type ProtocolError = ${proto.errors.map((e) => `'${e}'`).join(' | ')};`, '');
out.push(`export const CLIENT_EVENTS = ${JSON.stringify(Object.keys(proto.client))} as const;`);
out.push(`export const SERVER_EVENTS = ${JSON.stringify(Object.keys(proto.server))} as const;`, '');

const text = out.join('\n');
const target = resolve(shared, 'protocol.gen.ts');
if (process.argv.includes('--check')) {
  let current = '';
  try { current = readFileSync(target, 'utf8'); } catch { /* missing */ }
  if (current !== text) { console.error('shared/protocol.gen.ts is stale: run npm run gen:protocol'); process.exit(1); }
} else {
  writeFileSync(target, text);
  console.log('wrote', target);
}
