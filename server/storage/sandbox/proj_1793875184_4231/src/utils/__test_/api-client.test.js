import { client2 } from 'utils/api-client';
import { waitFor } from '@testing-library/react';

test('should get the token from localStorage', async () => {
jest.spyOn(window.localStorage.__proto__, 'getItem');
localStorage.__proto__.getItem = jest.fn().mockReturnValue('Astro_Token');

  const mockMerchant = {
payload: 'Hello World',
};

  const mockJsonPromise = Promise.resolve(mockMerchant);

  jest.spyOn(window, 'fetch').mockImplementationOnce(() => {
return Promise.resolve({
ok: true,
json: () => mockJsonPromise,
    }};
  }};

  client2('fetch url');

  const args = window.fetch.mock.calls[window.fetch.mock.calls.length - 1][1];
expect(args.headers['content-type']).toBe('application/json');
expect(args.headers.Authorization).toBe('Bearer Astro_Token');
expect(args.method).toBe('GET');
}};
