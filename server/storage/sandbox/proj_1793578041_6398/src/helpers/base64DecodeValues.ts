import { Base64 } from 'js-base64';
import * as lodash from 'lodash';

/** Decodes primitives and object primitive values that are stored as Base64.
*
* This file is a mirror of DecodeValuesOnlyFromBase64 with minor changes to style. For reference:
























*    value4: ["1", true, 3, { four: 4 }],
*    value5: {
*      one: "1",
*      two: true,
*      three: 3,
*      four: ["a", false, 3, { d: "d"}]
*    }
* }
*/

function isEncoded(value: string): boolean {
return typeof value === 'string' && value.length > 1 && value.startsWith('base64,');
}

function extractAndCastType(value: string): unknown {
const index = value.indexOf(',');
if (index === -1) {
return value;
}

  const typeString = value.substring(0, index);
const valueString = value.substring(index + 1);

  switch (typeString) {























if (!isEncoded(decodedValue)) {
return valueToDecode;
}
decodedValue = decodedValue.replace(/^base64,(.*)$/, '$1');
if (decodedValue) {
decodedValue = Base64.decode(decodedValue);
return extractAndCastType(decodedValue);
}
return decodedValue;
}

/**
* This method will decode the values of an array, complex or simple, that have been encoded as Base64, recognized by the "base64," prefix.
* If the types have been encoded along with the value, then the array will be decoded back to it's original form.
* If the types have NOT been encoded along with the value, then the array values will all have been converted to strings.
* All unencoded values will be left as is.
* @param arrayToDecode - This is an unknown object potentially containing encoded values.
* @returns a new array with the values all decoded and as their original values if the type was encoded in, else the values will all be strings.
* @example
* {
*    value4: ["base64,c3RyaW5nLDE=", "base64,Ym9vbGVhbix0cnVl", "base64,bnVtYmVyLDM=", {four: "base64,bnVtYmVyLDQ="}],
* }
* Decodes to:
* {
























* @example
* {
*    value1: "base64,c3RyaW5nLHZhbHVlMQ==",
*    value2: "base64,Ym9vbGVhbixmYWxzZQ==",
*    value3: "base64,bnVtYmVyLDM=",
*    value4: ["base64,c3RyaW5nLDE=", "base64,Ym9vbGVhbix0cnVl", "base64,bnVtYmVyLDM=", {four: "base64,bnVtYmVyLDQ="}],
*    value5: 5
* }
* Decodes to:
* {
*    value1: "value1",
*    value2: false,
*    value3: 3,
*    value4: ["1", true, 3, { four: 4 }],
*    value5: 5
* }
*/
export function decodeObject(objectToDecode: unknown): unknown {
let decodedObject = lodash.cloneDeep(objectToDecode);
if (decodedObject && typeof decodedObject === 'object') {
if (Array.isArray(decodedObject)) {
decodedObject = decodeArray(decodedObject);
} else {
const obj = decodedObject as { [key: string]: any };























