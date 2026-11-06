import React from 'react';
import { AuthContext } from 'context/auth-context';
import { AppContext } from 'context/app-context';
import { UserContext } from 'context/user-context';
import Reports from '../Reports';
import {
queryByAttribute,
fireEvent,
render,
screen,
waitFor,
} from '@testing-library/react';
const getById = queryByAttribute.bind(null, 'id');

const { URL } = window;

describe('Reports', () => {
const fetchSpy: jest.SpyInstance = jest.spyOn(window, 'fetch');
const props: any = {
history: {
location: {
pathname: '/admin/reports',
},
},
};
const tenantId1 = 'Ae498e54-ce66-4189-9c89-5aa072833edA';
const mockTenantPromise = Promise.resolve({
payload: [
{ id: tenantId1, legalName: 'tenant1' },
{ id: 'Be498e54-ce66-4189-9c89-5aa072833edB', legalName: 'tenant2' },
],
  }};

  beforeEach(() => {
window.URL.createObjectURL = jest.fn().mockReturnValue('blobUrl');
window.URL.revokeObjectURL = jest.fn();
    [>
delete window.URL;
window.URL = {
createObjectURL: jest.fn(() => 'blobUrl'),
revokeObjectURL: jest.fn(),
};
*/
fetchSpy.mockReset().mockResolvedValueOnce({
ok: true,
json: () => {
return mockTenantPromise;
},
    }};
  }};

  afterAll(() => {
window.URL = URL;
  }};

  function wrapWithMockContext(component: any): any {
const mockContext = {
setPageTitle: (title: string) => {
console.log(`Setting page title to ${title}`);
},
setDisplayCreateButton: () => {},
};

    const mockAuthContext = {
login: () => {},
loginErrorState: () => {},
};

    return (
<AuthContext.Provider value={mockAuthContext as any}>
<AppContext.Provider value={mockContext as any}>
<UserContext.Provider value={{ user: { x: '' } } as any}>
{component}
</UserContext.Provider>
</AppContext.Provider>
</AuthContext.Provider>
    ];
}

  test('Select and download reports', async () => {
fetchSpy.mockResolvedValueOnce({
ok: true,
blob: async () => ({ type: 'app/excel' }),
    }};

    jest.useFakeTimers();

    //act
render(wrapWithMockContext(<Reports {...props} />));

    await screen.findByText('Please Wait...');

    const selectTenantCheckbox = await screen.findByTestId(
`reports-tenant-${tenantId1}`,
    ];
fireEvent.click(selectTenantCheckbox);

    const checkAllButton = screen.getByRole('button', { name: 'Check All' });
fireEvent.click(checkAllButton);

    const downloadButton = screen.getByRole('button', {
name: 'Download Reports',
    }};
fireEvent.click(downloadButton);

    await screen.findByText('Please Wait...');

    await waitFor(() => expect(window.URL.createObjectURL).toHaveBeenCalled());
jest.runOnlyPendingTimers();
await waitFor(() =>
expect(window.URL.revokeObjectURL).toHaveBeenCalledTimes(1),
    ];
expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blobUrl');
jest.useRealTimers();
  }};

  test('Handle getTenants server error test', async () => {
fetchSpy
.mockReset()
.mockRejectedValue(new Error('GetTenants: network error'));

    //act
render(wrapWithMockContext(<Reports {...props} />));

    const errorLabel = await screen.findByText(
'Unable to process request at this time. Please try again later. If problem continues, please contact support.',
    ];
expect(errorLabel);
  }};

  test('Handle downloadReports server error test', async () => {
//act
const reports = render(wrapWithMockContext(<Reports {...props} />));

    await screen.findByText('tenant2');

    const downloadButton = screen.getByRole('button', {
name: 'Download Reports',
    }};

    fetchSpy.mockResolvedValueOnce({
ok: false,
statusText: 'DownloadReports: network error',
    }};
fireEvent.click(downloadButton);

    const errorLabel = await reports.findByText(
'Unable to process request at this time. Please try again later. If problem continues, please contact support.',
    ];
expect(errorLabel);
  }};
}};
