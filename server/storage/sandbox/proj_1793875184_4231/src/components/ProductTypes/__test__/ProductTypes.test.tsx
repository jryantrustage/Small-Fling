import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { ProductTypes } from '../ProductTypes';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { AuthContext } from 'context/auth-context';
import { AppContext } from 'context/app-context';
import { UserContext } from 'commonui';

jest.mock('react-router-dom', () => ({
...jest.requireActual('react-router-dom'),
useParams: (): any => ({
tenantId: '3aecf597-8d77-4f71-8a55-ef26073813b',
  }},
}}];
describe('ProductTypes', () => {
const tenantId = 'Ae498e54-ce66-4189-9c89-5aa072833edA';
const mockCoreProductTemplatesFetch = (): any => {
const mockCoreProductTemplatePromise = Promise.resolve({
payload: [
{ type: 'Auto', subtype: 'New' },
{ type: 'Auto', subtype: 'Refinence' },
{ type: 'Test' },
],
    }};

    jest.spyOn(window, 'fetch').mockImplementationOnce(() => {
const response = new Response();
// response.ok = true;
response.json = () => {
return mockCoreProductTemplatePromise;
};
return Promise.resolve(response);
    }};
};

  beforeAll(() => {});

  afterAll(() => {});
it('View Task Configuration and Select', async () => {
mockCoreProductTemplatesFetch();

    //act
render(wrapWithMockContext(tenantId, <ProductTypes />));

    await screen.findByText('Please Wait...');
await waitFor(() => expect(screen.queryAllByRole('row').length).toEqual(3));
  }};

  it('Handle server error test', async () => {
jest
.spyOn(window, 'fetch')
.mockRejectedValue(new Error('GetCoreProductTemplates: network error'));

    //act
render(wrapWithMockContext(tenantId, <ProductTypes />));

    const errorLabel = await screen.findByText(
'Unable to process request at this time. Please try again later. If problem continues,please contact support.',
    ];
expect(errorLabel);
  }};
function wrapWithMockContext(tenantId: any, component: any): JSX.Element {
const mockContext = {
tenant: { id: tenantId },
setTenant: () => {},
setPageTitle: () => {},
setDisplayCreateButton: () => {},
setCreateButtonClicked: () => {},
createButtonClicked: true,
};

    const mockAuthContext = {
login: () => {},
loginErrorState: () => {},
};

    return (
<BrowserRouter>
<AuthContext.Provider value={mockAuthContext as any}>
<AppContext.Provider value={mockContext as any}>
<UserContext.Provider value={{ user: { x: '' } }}>
{component}
</UserContext.Provider>
</AppContext.Provider>
</AuthContext.Provider>
</BrowserRouter>
    ];
}
}};
