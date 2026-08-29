import { readFileSync, statSync } from 'node:fs';

export const STRICT_JSON_LIMITS = Object.freeze({
  maxBytes: 4 * 1024 * 1024,
  maxDepth: 20,
  maxString: 32768,
  maxList: 2048,
  maxKeys: 256,
  maxNumberCharacters: 128,
  maxAbsoluteNumber: Number.MAX_SAFE_INTEGER,
});

const UNSAFE_KEY = /^(?:__proto__|constructor|prototype)$/;
const SCHEMA_KEYWORDS = new Set([
  '$schema', '$id', '$ref', '$defs', 'title', 'description', 'type', 'const', 'enum',
  'additionalProperties', 'required', 'properties', 'items', 'minItems', 'maxItems',
  'uniqueItems', 'minLength', 'maxLength', 'pattern', 'minimum', 'maximum',
  'exclusiveMinimum', 'exclusiveMaximum',
]);

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function stableKey(value) {
  if (Array.isArray(value)) return `[${value.map(stableKey).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableKey(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function parseStrictJson(text, source = 'JSON') {
  if (typeof text !== 'string') fail('json.input', `${source} is not UTF-8 text`);
  if (Buffer.byteLength(text, 'utf8') > STRICT_JSON_LIMITS.maxBytes) fail('json.bounds', `${source} exceeds the bounded byte size`);
  let index = 0;
  const length = text.length;
  const whitespace = () => { while (index < length && /[\u0009\u000a\u000d\u0020]/.test(text[index])) index += 1; };
  const string = () => {
    const start = index;
    if (text[index++] !== '"') fail('json.syntax', `${source} has an invalid string`);
    while (index < length) {
      const char = text[index++];
      if (char === '"') {
        let decoded;
        try { decoded = JSON.parse(text.slice(start, index)); } catch (error) { fail('json.syntax', `${source} has an invalid string: ${error.message}`); }
        if (decoded.length > STRICT_JSON_LIMITS.maxString) fail('json.string_bounds', `${source} contains an oversized string`);
        return decoded;
      }
      if (char === '\\') {
        if (index >= length) fail('json.syntax', `${source} has a truncated escape`);
        const escape = text[index++];
        if (escape === 'u') {
          const hex = text.slice(index, index + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('json.syntax', `${source} has an invalid unicode escape`);
          index += 4;
        } else if (!'"\\/bfnrt'.includes(escape)) fail('json.syntax', `${source} has an invalid escape`);
      } else if (char < ' ') fail('json.syntax', `${source} contains an unescaped control character`);
      if (index - start > STRICT_JSON_LIMITS.maxString * 6 + 2) fail('json.string_bounds', `${source} contains an oversized encoded string`);
    }
    fail('json.syntax', `${source} has an unterminated string`);
  };
  const value = (depth) => {
    if (depth > STRICT_JSON_LIMITS.maxDepth) fail('json.depth', `${source} exceeds the maximum nesting depth`);
    whitespace();
    const char = text[index];
    if (char === '"') return string();
    if (char === '{') {
      index += 1;
      whitespace();
      const keys = new Set();
      const result = {};
      if (text[index] === '}') { index += 1; return result; }
      while (index < length) {
        whitespace();
        const key = string();
        if (UNSAFE_KEY.test(key)) fail('json.unsafe_key', `${source} contains an unsafe object key`);
        if (keys.has(key)) fail('json.duplicate_key', `${source} contains duplicate key ${key}`);
        keys.add(key);
        if (keys.size > STRICT_JSON_LIMITS.maxKeys) fail('json.keys_bounds', `${source} contains too many object keys`);
        whitespace();
        if (text[index++] !== ':') fail('json.syntax', `${source} is missing a colon`);
        result[key] = value(depth + 1);
        whitespace();
        if (text[index] === '}') { index += 1; return result; }
        if (text[index++] !== ',') fail('json.syntax', `${source} is missing an object separator`);
      }
      fail('json.syntax', `${source} has an unterminated object`);
    }
    if (char === '[') {
      index += 1;
      whitespace();
      const result = [];
      if (text[index] === ']') { index += 1; return result; }
      while (index < length) {
        if (result.length >= STRICT_JSON_LIMITS.maxList) fail('json.list_bounds', `${source} contains an oversized list`);
        result.push(value(depth + 1));
        whitespace();
        if (text[index] === ']') { index += 1; return result; }
        if (text[index++] !== ',') fail('json.syntax', `${source} is missing an array separator`);
      }
      fail('json.syntax', `${source} has an unterminated array`);
    }
    const remaining = text.slice(index);
    const literal = /^(?:true|false|null)(?=\s|[,}\]]|$)/.exec(remaining);
    if (literal) {
      index += literal[0].length;
      if (literal[0] === 'true') return true;
      if (literal[0] === 'false') return false;
      return null;
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?(?=\s|[,}\]]|$)/.exec(remaining);
    if (number) {
      if (number[0].length > STRICT_JSON_LIMITS.maxNumberCharacters) fail('json.number_bounds', `${source} contains an oversized number`);
      const parsed = Number(number[0]);
      if (!Number.isFinite(parsed) || Math.abs(parsed) > STRICT_JSON_LIMITS.maxAbsoluteNumber) fail('json.number_bounds', `${source} contains a number outside the safe bound`);
      index += number[0].length;
      return parsed;
    }
    fail('json.syntax', `${source} has an invalid value`);
  };
  const parsed = value(0);
  whitespace();
  if (index !== length) fail('json.syntax', `${source} has trailing content`);
  return parsed;
}

function validateSchemaDefinition(schema, source, depth = 0, path = '$') {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) fail('schema.definition', `${source} ${path} is not a schema object`);
  if (depth > STRICT_JSON_LIMITS.maxDepth) fail('schema.depth', `${source} schema exceeds the maximum nesting depth`);
  for (const key of Object.keys(schema)) {
    if (UNSAFE_KEY.test(key)) fail('schema.unsafe_key', `${source} ${path} contains an unsafe key`);
    if (!SCHEMA_KEYWORDS.has(key)) fail('schema.keyword', `${source} ${path} contains unsupported keyword ${key}`);
  }
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const allowedTypes = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);
    if (types.length === 0 || types.some((type) => typeof type !== 'string' || !allowedTypes.has(type))) fail('schema.type_definition', `${source} ${path}.type is invalid`);
  }
  if (schema.required !== undefined && (!Array.isArray(schema.required) || schema.required.some((key) => typeof key !== 'string' || key.length === 0 || UNSAFE_KEY.test(key)) || new Set(schema.required).size !== schema.required.length)) fail('schema.required_definition', `${source} ${path}.required is invalid`);
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || schema.enum.length === 0)) fail('schema.enum_definition', `${source} ${path}.enum is invalid`);
  for (const key of ['minItems', 'maxItems', 'minLength', 'maxLength']) {
    if (schema[key] !== undefined && (!Number.isSafeInteger(schema[key]) || schema[key] < 0)) fail('schema.bound_definition', `${source} ${path}.${key} is invalid`);
  }
  for (const key of ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum']) {
    if (schema[key] !== undefined && (!Number.isFinite(schema[key]) || Math.abs(schema[key]) > STRICT_JSON_LIMITS.maxAbsoluteNumber)) fail('schema.bound_definition', `${source} ${path}.${key} is invalid`);
  }
  if (schema.pattern !== undefined) {
    if (typeof schema.pattern !== 'string' || schema.pattern.length > STRICT_JSON_LIMITS.maxString) fail('schema.pattern_definition', `${source} ${path}.pattern is invalid`);
    try { new RegExp(schema.pattern, 'u'); } catch (error) { fail('schema.pattern_definition', `${source} ${path}.pattern cannot compile: ${error.message}`); }
  }
  if (schema.additionalProperties !== undefined && schema.additionalProperties !== true && schema.additionalProperties !== false && (!schema.additionalProperties || typeof schema.additionalProperties !== 'object' || Array.isArray(schema.additionalProperties))) fail('schema.additional_definition', `${source} ${path}.additionalProperties is invalid`);
  if (schema.properties !== undefined) {
    if (!schema.properties || typeof schema.properties !== 'object' || Array.isArray(schema.properties)) fail('schema.properties', `${source} ${path}.properties is invalid`);
    for (const [key, child] of Object.entries(schema.properties)) {
      if (UNSAFE_KEY.test(key)) fail('schema.unsafe_key', `${source} ${path}.properties contains an unsafe key`);
      validateSchemaDefinition(child, source, depth + 1, `${path}.properties.${key}`);
    }
  }
  if (schema.$defs !== undefined) {
    if (!schema.$defs || typeof schema.$defs !== 'object' || Array.isArray(schema.$defs)) fail('schema.defs', `${source} ${path}.$defs is invalid`);
    for (const [key, child] of Object.entries(schema.$defs)) {
      if (UNSAFE_KEY.test(key)) fail('schema.unsafe_key', `${source} ${path}.$defs contains an unsafe key`);
      validateSchemaDefinition(child, source, depth + 1, `${path}.$defs.${key}`);
    }
  }
  if (schema.items !== undefined) validateSchemaDefinition(schema.items, source, depth + 1, `${path}.items`);
  if (schema.additionalProperties !== undefined && schema.additionalProperties !== false && schema.additionalProperties !== true) {
    validateSchemaDefinition(schema.additionalProperties, source, depth + 1, `${path}.additionalProperties`);
  }
}

function resolveLocalReference(rootSchema, reference, source) {
  if (typeof reference !== 'string' || !reference.startsWith('#/')) fail('schema.ref', `${source} uses a non-local or malformed $ref`);
  let current = rootSchema;
  for (const encoded of reference.slice(2).split('/')) {
    const key = encoded.replace(/~1/g, '/').replace(/~0/g, '~');
    if (UNSAFE_KEY.test(key) || !current || typeof current !== 'object' || !Object.hasOwn(current, key)) fail('schema.ref', `${source} cannot resolve ${reference}`);
    current = current[key];
  }
  return current;
}

function valueTypeMatches(value, expected) {
  if (expected === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (expected === 'array') return Array.isArray(value);
  if (expected === 'integer') return typeof value === 'number' && Number.isSafeInteger(value);
  if (expected === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (expected === 'null') return value === null;
  return typeof value === expected;
}

function validateValue(value, schema, rootSchema, source, path, depth) {
  if (depth > STRICT_JSON_LIMITS.maxDepth) fail('schema.value_depth', `${source} ${path} exceeds the maximum schema depth`);
  if (schema.$ref !== undefined) return validateValue(value, resolveLocalReference(rootSchema, schema.$ref, source), rootSchema, source, path, depth + 1);
  if (schema.const !== undefined && !deepEqual(value, schema.const)) fail('schema.const', `${source} ${path} does not equal the required constant`);
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || !schema.enum.some((candidate) => deepEqual(candidate, value)))) fail('schema.enum', `${source} ${path} is not an allowed value`);
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => valueTypeMatches(value, type))) fail('schema.type', `${source} ${path} has the wrong type`);
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) fail('schema.min_length', `${source} ${path} is too short`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) fail('schema.max_length', `${source} ${path} is too long`);
    if (schema.pattern !== undefined && !(new RegExp(schema.pattern, 'u')).test(value)) fail('schema.pattern', `${source} ${path} does not match the required pattern`);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Math.abs(value) > STRICT_JSON_LIMITS.maxAbsoluteNumber) fail('schema.number_bounds', `${source} ${path} is outside the safe numeric bound`);
    if (schema.minimum !== undefined && value < schema.minimum) fail('schema.minimum', `${source} ${path} is below the minimum`);
    if (schema.maximum !== undefined && value > schema.maximum) fail('schema.maximum', `${source} ${path} is above the maximum`);
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) fail('schema.exclusive_minimum', `${source} ${path} is not above the exclusive minimum`);
    if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) fail('schema.exclusive_maximum', `${source} ${path} is not below the exclusive maximum`);
  }
  if (Array.isArray(value)) {
    if (value.length > STRICT_JSON_LIMITS.maxList) fail('schema.list_bounds', `${source} ${path} exceeds the global list bound`);
    if (schema.minItems !== undefined && value.length < schema.minItems) fail('schema.min_items', `${source} ${path} has too few items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) fail('schema.max_items', `${source} ${path} has too many items`);
    if (schema.uniqueItems === true) {
      const seen = new Set();
      for (const item of value) {
        const key = stableKey(item);
        if (seen.has(key)) fail('schema.unique_items', `${source} ${path} contains duplicate items`);
        seen.add(key);
      }
    }
    if (schema.items !== undefined) value.forEach((item, itemIndex) => validateValue(item, schema.items, rootSchema, source, `${path}[${itemIndex}]`, depth + 1));
  } else if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length > STRICT_JSON_LIMITS.maxKeys) fail('schema.keys_bounds', `${source} ${path} exceeds the global object-key bound`);
    for (const required of schema.required ?? []) {
      if (!Object.hasOwn(value, required)) fail('schema.required', `${source} ${path} is missing ${required}`);
    }
    for (const key of keys) {
      if (UNSAFE_KEY.test(key)) fail('schema.unsafe_key', `${source} ${path} contains an unsafe key`);
      const propertySchema = schema.properties?.[key];
      if (propertySchema) validateValue(value[key], propertySchema, rootSchema, source, `${path}.${key}`, depth + 1);
      else if (schema.additionalProperties === false) fail('schema.additional_property', `${source} ${path} contains unknown field ${key}`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') validateValue(value[key], schema.additionalProperties, rootSchema, source, `${path}.${key}`, depth + 1);
    }
  }
  return value;
}

export function validateJsonSchema(value, schema, { source = 'JSON', schemaSource = 'schema' } = {}) {
  validateSchemaDefinition(schema, schemaSource);
  return validateValue(value, schema, schema, source, '$', 0);
}

export function readStrictJson(path, { schema, schemaSource } = {}) {
  const info = statSync(path);
  if (!info.isFile()) fail('json.file', `${path} is not a regular file`);
  if (info.size > STRICT_JSON_LIMITS.maxBytes) fail('json.bounds', `${path} exceeds the bounded byte size`);
  const text = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  const parsed = parseStrictJson(text, path);
  if (schema !== undefined) validateJsonSchema(parsed, schema, { source: path, schemaSource });
  return parsed;
}

export function readStrictJsonWithSchema(path, schemaPath) {
  const schema = readStrictJson(schemaPath);
  validateSchemaDefinition(schema, schemaPath);
  return readStrictJson(path, { schema, schemaSource: schemaPath });
}
