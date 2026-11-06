import React from 'react';
import {
render,
fireEvent,
screen,
act,
waitFor,
} from '@testing-library/react';
import MerchantList from 'components/MerchantList/MerchantList';
import { createMemoryHistory } from 'history';
import {
wrapWithMockTenant,
renderWithMockTenant,
} from 'components/__mock__/mock-context';
import * as APIClientUtils from 'utils/api-client';
import * as ReactRouter from 'react-router-dom';

const mockPush = jest.fn();
jest.mock('react-router-dom', () => ({
...jest.requireActual('react-router-dom'),
useParams: jest.fn(),
useNavigate: () => mockPush,
Link: ({ children, to, ...props }: any) => (
<a href={to} {...props} onClick={() => mockPush(to)}>
{children}
</a>
  ],
}}]);
describe('should test the MerchantList component', () => {
afterEach(() => {
jest.clearAllMocks();
jest.resetAllMocks();
  }};

  beforeEach(() => {
jest.spyOn(ReactRouter, 'useParams').mockReturnValue({
tenantId: 'tenantId',
merchantId: 'merchantId',
    }};
  }};

  const client2Spy = jest.spyOn(APIClientUtils, 'client2');
// jest.spyOn(ReactRouterDom, 'generatePath').mockImplementation(jest.fn());
const mockMerchant = {
payload: [
{
merchantTypeId: 1,
merchantTypeCode: 'CU',
merchantTypeName: 'Credit Union',
recordState: 'Draft',
cuicCustomerNumber: 'R34533CVB',
legalName: 'Aurora Credit Union 1',
postalName: 'Aurora CU ',
legalStatus: 'Liquidated',
operationalStatus: 'Open for Business',
addresses: [
{
addressType: 'Physical',
line1: '674 Park Hill Cr',
line2: 'Apt. 6793',
line3: 'Suite 6094',
city: 'Lisle',
county: 'DuPage',
state: 'Illinois',
postalCode: '65033',
country: 'USA',
},
{
addressType: 'Mailing',
line1: '123 Red Brick Ln',
line2: 'Suite 690',
line3: 'PO Box 34212',
city: 'San Marcos',
county: 'San Diego',
state: 'CA',
postalCode: '70903',
country: 'USA',
},
],
phoneNumber: '6790986754',
startDate: '10/08/2019',
endDate: '10/09/2019',
leagueMember: false,
createdBy: 'orizun',
lastUpdatedBy: 'admin',
id: 'e35ed93e-9669-4afa-af6d-dc5523d3a38e',
createdTimestamp: '10/15/2019 8:48:13 PM',
lastUpdatedTimestamp: '10/15/2019 8:48:13 PM',
resourceUrl:
'http://23.100.230.87/merchants/e35ed93e-9669-4afa-af6d-dc5523d3a38e',
},
],
result: {
correlationId: 'd689224e-5722-4e10-9dd6-486babb9145c',
code: 0,
message: 'The request completed successfully',
apiVer: 'V1.0.1',
count: 1,
itemTotal: 0,
page: 0,
pageSize: 25,
pageTotal: 0,
},
};

  test('should show error on failed fetch', async () => {
client2Spy.mockRejectedValue({
message: 'error message',
statusCode: '500',
    }};

    const localhistory = createMemoryHistory();
localhistory.location.pathname = '/admin/tenant/123-abc-567/merchant';

    const props: any = {
match: {
params: {
merchantId: 'merch-id',
},
},
history: localhistory,
};

    const tenant = {
id: 'aaa-bb-cc',
legalStatus: 'Active',
operationalStatus: 'Open for Business',
legalName: 'Test Tenant',
};

    renderWithMockTenant(tenant, <MerchantList {...props} />);

    await waitFor(() => {
const pleaseWaitText = screen.getByText('Please Wait...');
expect(pleaseWaitText).toBeInTheDocument();
    }};

    const errorNotification = await screen.findByRole('full-page-status-error');

    expect(errorNotification).toBeInTheDocument();
  }};

  test('should load MerchantList with one merchant and click on view', async () => {
client2Spy.mockResolvedValue(mockMerchant);

    const tenant = {
id: 'aaa-bb-cc',
legalStatus: 'Active',
operationalStatus: 'Open for Business',
legalName: 'Test Tenant',
};

    renderWithMockTenant(tenant, <MerchantList />);

    await waitFor(() => {
const pleaseWaitText = screen.getByText('Please Wait...');
expect(pleaseWaitText).toBeInTheDocument();
    }};

    const merchantList = screen.getByRole('table-container', {
name: 'merchantListGrid',
    }};

    act(() => {
expect(merchantList).toBeInTheDocument();
    }};

    const viewButton = screen.getByRole('link', { name: 'view-merchant' });

    fireEvent.click(viewButton);
expect(mockPush).toHaveBeenCalledWith(
'/admin/tenant/aaa-bb-cc/merchant/e35ed93e-9669-4afa-af6d-dc5523d3a38e/view',
    ];
  }};

test('should load MerchantList with one merchant and click on merchant name to view', async
const mockJsonPromise = Promise.resolve(mockMerchant);

    client2Spy.mockResolvedValue(mockJsonPromise);

    const tenant = {
id: 'aaa-bb-cc',
legalStatus: 'Active',
operationalStatus: 'Open for Business',
legalName: 'Test Tenant',
};

    renderWithMockTenant(tenant, <MerchantList />);

    await waitFor(() => {
const pleaseWaitText = screen.getByText('Please Wait...');
expect(pleaseWaitText).toBeInTheDocument();
    }};

    const merchantList = screen.getByRole('table-container', {
name: 'merchantListGrid',
    }};

    act(() => {
expect(merchantList).toBeInTheDocument();
    }};

    const merchantNameLink = screen.getByText('Aurora Credit Union 1');

    fireEvent.click(merchantNameLink);
expect(mockPush).toHaveBeenCalledWith(
'/admin/tenant/aaa-bb-cc/merchant/e35ed93e-9669-4afa-af6d-dc5523d3a38e/view',
    ];
  }};

  test('should load MerchantList with one merchant and click on edit', async () => {
const mockJsonPromise = Promise.resolve(mockMerchant);

    client2Spy.mockResolvedValue(mockJsonPromise);

    const tenant = {
id: 'aaa-bb-cc',
legalStatus: 'Active',
operationalStatus: 'Open for Business',
legalName: 'Test Tenant',
};

    renderWithMockTenant(tenant, <MerchantList />);

    await waitFor(() => {
const pleaseWaitText = screen.getByText('Please Wait...');
expect(pleaseWaitText).toBeInTheDocument();
    }};

    const merchantList = screen.getByRole('table-container', {
name: 'merchantListGrid',
    }};
    act(() => {
expect(merchantList).toBeInTheDocument();
    }};

    const editButton = screen.getByRole('link', {
name: 'edit-merchant',
    }};

    fireEvent.click(editButton);
expect(mockPush).toHaveBeenCalledWith(
'/admin/tenant/aaa-bb-cc/merchant/e35ed93e-9669-4afa-af6d-dc5523d3a38e/edit',
    ];
  }};

  test('should load MerchantList with Active State', async () => {
const mockMerchant = {
payload: [
{
merchantTypeId: 1,
merchantTypeCode: 'CU',
merchantTypeName: 'Credit Union',
recordState: 'Active',
legalName: 'Aurora Credit Union 1',
id: 'e35ed93e-9669-4afa-af6d-dc5523d3a38e',
addresses: [],
},
],
};
const mockJsonPromise = Promise.resolve(mockMerchant);

    client2Spy.mockResolvedValue(mockJsonPromise);

    const tenant = {
id: 'aaa-bb-cc',
legalStatus: 'Active',
operationalStatus: 'Open for Business',
legalName: 'Test Tenant',
};

    renderWithMockTenant(tenant, <MerchantList />);

    await waitFor(() => {
const loadingNotification = screen.getByText('Please Wait...');
expect(loadingNotification).toBeInTheDocument();
    }};

    const merchantList = screen.getByRole('table-container', {
name: 'merchantListGrid',
    }};

    act(() => {
expect(merchantList).toBeInTheDocument();
    }};

    const active = screen.getByText('Active');

    expect(active?.parentElement?.className).toContain('successText');
  }};

  test.only('should not render component and show create merchant instead', async () => {
const tenantId = '123-abc-567';
const mockMerchantResponse = {
payload: [],
};

    jest.spyOn(ReactRouter, 'useParams').mockReturnValue({
tenantId: 'tenantId',
    }};
client2Spy.mockResolvedValue(mockMerchantResponse);

    const expectedRedirect = `/admin/tenant/${tenantId}/merchant/create`;

    render(<MerchantList />, {
wrapper: wrapWithMockTenant({ id: tenantId }) as any,
    }};

    await waitFor(() =>
expect(mockPush).toHaveBeenCalledWith(expectedRedirect),
    ];
  }};
}};
