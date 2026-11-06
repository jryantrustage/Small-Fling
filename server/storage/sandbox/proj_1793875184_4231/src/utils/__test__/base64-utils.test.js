import { fileToBase64, b64toBlob } from '../base64-utils';

test('Test base64 to file to base64', async () => {
const testText = 'test123';

  const inputBase64 = btoa(testText);

  const file = b64toBlob(inputBase64, 'text/plain');
const base64Output = await fileToBase64(file);

  expect(base64Output.split(',', 2)[1]).toBe(inputBase64);
}};
