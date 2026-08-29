import { readFileSync } from 'node:fs';

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_DEPTH = 20;
const MAX_STRING = 32768;
const MAX_LIST = 2048;
const MAX_KEYS = 256;
const UNSAFE_KEY = /^(?:__proto__|constructor|prototype)$/;

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

export function parseStrictJson(text, source = 'JSON') {
  if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) fail('json.bounds', `${source} exceeds the bounded byte size`);
  let index = 0;
  const length = text.length;
  const whitespace = () => { while (index < length && /\s/.test(text[index])) index += 1; };
  const string = () => {
    const start = index;
    if (text[index++] !== '"') fail('json.syntax', `${source} has an invalid string`);
    let value = '';
    while (index < length) {
      const char = text[index++];
      if (char === '"') { if (value.length > MAX_STRING) fail('json.string_bounds', `${source} contains an oversized string`); return { value, start }; }
      if (char === '\\') {
        if (index >= length) fail('json.syntax', `${source} has a truncated escape`);
        const escape = text[index++];
        if (escape === 'u') {
          const hex = text.slice(index, index + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('json.syntax', `${source} has an invalid unicode escape`);
          value += String.fromCharCode(Number.parseInt(hex, 16)); index += 4;
        } else if ('"\\/bfnrt'.includes(escape)) value += escape;
        else fail('json.syntax', `${source} has an invalid escape`);
      } else {
        if (char < ' ') fail('json.syntax', `${source} contains an unescaped control character`);
        value += char;
      }
      if (value.length > MAX_STRING) fail('json.string_bounds', `${source} contains an oversized string`);
    }
    fail('json.syntax', `${source} has an unterminated string`);
  };
  const value = (depth) => {
    if (depth > MAX_DEPTH) fail('json.depth', `${source} exceeds the maximum nesting depth`);
    whitespace();
    const char = text[index];
    if (char === '"') return string().value;
    if (char === '{') {
      index += 1; whitespace(); const keys = new Set(); const result = {};
      if (text[index] === '}') { index += 1; return result; }
      while (index < length) {
        whitespace(); const key = string().value;
        if (UNSAFE_KEY.test(key)) fail('json.unsafe_key', `${source} contains an unsafe object key`);
        if (keys.has(key)) fail('json.duplicate_key', `${source} contains duplicate key ${key}`);
        keys.add(key); if (keys.size > MAX_KEYS) fail('json.keys_bounds', `${source} contains too many object keys`);
        whitespace(); if (text[index++] !== ':') fail('json.syntax', `${source} is missing a colon`);
        result[key] = value(depth + 1); whitespace();
        if (text[index] === '}') { index += 1; return result; }
        if (text[index++] !== ',') fail('json.syntax', `${source} is missing an object separator`);
      }
      fail('json.syntax', `${source} has an unterminated object`);
    }
    if (char === '[') {
      index += 1; whitespace(); const result = [];
      if (text[index] === ']') { index += 1; return result; }
      while (index < length) {
        if (result.length >= MAX_LIST) fail('json.list_bounds', `${source} contains an oversized list`);
        result.push(value(depth + 1)); whitespace();
        if (text[index] === ']') { index += 1; return result; }
        if (text[index++] !== ',') fail('json.syntax', `${source} is missing an array separator`);
      }
      fail('json.syntax', `${source} has an unterminated array`);
    }
    const remaining = text.slice(index);
    const literal = /^(?:true|false|null)\b/.exec(remaining);
    if (literal) { index += literal[0].length; return JSON.parse(literal[0]); }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(remaining);
    if (number) { index += number[0].length; return Number(number[0]); }
    fail('json.syntax', `${source} has an invalid value`);
  };
  const parsed = value(0); whitespace();
  if (index !== length) fail('json.syntax', `${source} has trailing content`);
  try { return JSON.parse(text); } catch (error) { fail('json.syntax', `${source} cannot be decoded: ${error.message}`); }
}

export function readStrictJson(path) {
  const text = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  return parseStrictJson(text, path);
}
