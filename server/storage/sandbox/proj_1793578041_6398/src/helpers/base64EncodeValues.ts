import { Base64 } from 'js-base64';
import { cloneDeep } from 'lodash';

/** Encodes primitives and object primitive values as Base64.
*
* This file is a mirror of EncodeValuesOnlyToBase64 with minor changes to style. For reference:
* https://dev.azure.com/cunamutual/H2IC/_git/CommonTS?path=/src/common/utils/EncodeValuesOnlyToBase64.ts
*
* Outputted format:  "base64,c3RyaW5nLHZhbHVlMQ=="
* The encoded part of the value is made up of th the primitive type of the value and the va    eaning "base64,Ym9vbGVhbixmYWxzZQ==" = "base64,<olean,false>"
* Example:
* This object:
* {
*    value1: "value1",
*    value2: false,
*    value3: 3,
*    value4: ["1", true, 3, { four: 4 }],
*    value5: {
*      one: "1",
*      two: true,
*      three: 3,
























if (valueToEncode === undefined || valueToEncode === null) return valueToEncode;

  let encodedValue = `${typeof valueToEncode},${valueToEncode.toString()}`;
encodedValue = `base64,${Base64.encode(encodedValue)}`;
return encodedValue;
}

/**
* This utility will encode the values of an object along with it's type to ensure that the value can be decoded back as the correct type
* @param objectToEncode - This is an unknown object.  The code doesn't care, because it will loop through the properties to figure out what to do.
* @returns a newly Base64 encoded object where the values of all of the properties have been converted to strings in the form of "Base64,<type,value>"
* @example
* {
*    value1: "value1",
*    value2: false,
*    value3: 3,
*    value4: ["1", true, 3, { four: 4 }]
}
* Encodes to:
* {
*    value1: "base64,c3RyaW5nLHZhbHVlMQ==",
*    value2: "base64,Ym9vbGVhbixmYWxzZQ==",
*    value3: "base64,bnVtYmVyLDM=",
*    value4: ["base64,c3RyaW5nLDE=", "base64,Ym9vbGVhbix0cnVl", "base64,bnVtYmVyLDM=", {four: "base64,bnVtYmVyLDQ="}]
























  return encodedObject;
}

/**
* This utility will encode the values of an object along with it's type to ensure that the value can be decoded back as the correct type
* @param arrayToEncode - This is an an array of unknown.  The code doesn't care about the types, because it will loop through the properties to figure out what to do.
* @returns a newly Base64 encoded array where the individual values, primitives or complex objects, have had the primitive values converted to strings in the form of "Base64,<type,value>"
* @example
*
* @param arrayToEncode
* @returns
*/
export function encodeArray(arrayToEncode: any[]): any[] {
const encodedArray = cloneDeep(arrayToEncode);
for (let i = 0; i < encodedArray.length; i++) {
if (typeof encodedArray[i] === 'object') {
encodedArray[i] = encodeObject(encodedArray[i]);
} else {
encodedArray[i] = encodeValue(encodedArray[i]);
}
}

























* Deserializes `body` and then encodes it's values as base64 strings before
* reserializing them. Useful in openapi-generator middlewares.
*
* @export
* @param {string} body
* @return {*}  {string}
*/
export function encodeStringBody(body: string): string {
const parsed = JSON.parse(body);
const encoded = encodeObject(parsed);
return JSON.stringify(encoded, null, '');
}
