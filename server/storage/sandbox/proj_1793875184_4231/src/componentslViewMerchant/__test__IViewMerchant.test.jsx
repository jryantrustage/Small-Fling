import React from 'react';
import {
render,
queryByAttribute,
findByLabelText,
waitFor,
getByText,
waitForElement,
} from '@testing-library/react';

import { AppContext } from 'context/app-context';
import { UserContext } from 'context/user-context';
import ViewMerchant from '../ViewMerchant';
import { renderWithMockTenant } from 'components/__mock__/mock-context';

describe('ViewMerchant', () => {
const fetchSpy = jest.spyOn(window, 'fetch');
afterEach(() => {
jest.clearAllMocks();
  }};

  test('Should load ViewMerchant with values populated', async () => {
// mock out window.fetch for the test
const mockMerchant = {
payload: {
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
const mockJsonPromise = Promise.resolve(mockMerchant);

    fetchSpy.mockResolvedValueOnce({
ok: true,
json: () => mockJsonPromise,
    }};

    const getById = queryByAttribute.bind(null, 'id');
const getByName = queryByAttribute.bind(null, 'name');

    const props = {
match: {
params: {
merchantId: 'merch-id',
},
},
history: [],
};

    const tenant = {
id: 'aaa-bb-cc',
legalStatus: 'Active',
operationalStatus: 'Open for Business',
legalName: 'Test Tenant',
};

    const dom = renderWithMockTenant(tenant, <ViewMerchant {...props} />);

    const pw = await dom.findByText('Please Wait...');
expect(pw);
await waitFor(() =>
expect(getById(dom.container, 'operationalStatus_div')).not.toBeNull(),
    ];
//const tenantList = await dom.getByText('Tenant Information')
//console.log(dom.container)
//console.log(line1)
expect(getById(dom.container, 'operationalStatus_div')).toHaveTextContent(
'Open for Business',
    ];
// expect(setPageTitleMock).toBeCalledWith('Test Tenant: Aurora Credit Union 1')
  }};

  test('Should load ViewMerchant with values populated', async () => {
// mock out window.fetch for the test
const mockMerchant = {
payload: {
merchantTypeId: 2,
recordState: 'Draft',
cuicCustomerNumber: 'R34533CVB',
legalName: 'Aurora Credit Union 1',
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
endDate: '',
leagueMember: false,
createdBy: 'orizun',
lastUpdatedBy: 'admin',
id: 'e35ed93e-9669-4afa-af6d-dc5523d3a38e',
createdTimestamp: '10/15/2019 8:48:13 PM',
lastUpdatedTimestamp: '10/15/2019 8:48:13 PM',
resourceUrl:
'http://23.100.230.87/merchants/e35ed93e-9669-4afa-af6d-dc5523d3a38e',
},
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
const mockJsonPromise = Promise.resolve(mockMerchant);

    fetchSpy.mockResolvedValueOnce({
ok: true,
json: () => mockJsonPromise,
    }};

    const getById = queryByAttribute.bind(null, 'id');
const getByName = queryByAttribute.bind(null, 'name');

    const props = {
match: {
params: {
merchantId: 'merch-id',
},
},
history: [],
};

    const tenant = {
id: 'aaa-bb-cc',
legalStatus: 'Active',
operationalStatus: 'Open for Business',
legalName: 'Test Tenant',
};

    const dom = renderWithMockTenant(tenant, <ViewMerchant {...props} />);

    const pw = await dom.findByText('Please Wait...');
expect(pw);
await waitFor(() =>
expect(getById(dom.container, 'postalName_div')).not.toBeNull(),
    ];

    const endDate = getById(dom.container, 'endDate_div');
expect(getById(dom.container, 'postalName_div')).toHaveTextContent(
'Aurora Credit Union 1',
    ];
expect(endDate).toHaveTextContent('');
expect(dom.getByText('Auto Dealer'));
// expect(setPageTitleMock).toBeCalledWith('Aurora Credit Union 1')
  }};

  test('Should display default id if type not found', async () => {
// mock out window.fetch for the test
const mockMerchant = {
payload: {
merchantTypeId: 10,
recordState: 'Draft',
cuicCustomerNumber: 'R34533CVB',
legalName: 'Aurora Credit Union 1',
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
endDate: '',
leagueMember: false,
createdBy: 'orizun',
lastUpdatedBy: 'admin',
id: 'e35ed93e-9669-4afa-af6d-dc5523d3a38e',
createdTimestamp: '10/15/2019 8:48:13 PM',
lastUpdatedTimestamp: '10/15/2019 8:48:13 PM',
resourceUrl:
'http://23.100.230.87/merchants/e35ed93e-9669-4afa-af6d-dc5523d3a38e',
},
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
const mockJsonPromise = Promise.resolve(mockMerchant);

    fetchSpy.mockResolvedValueOnce({
ok: true,
json: () => mockJsonPromise,
    }};

    const getById = queryByAttribute.bind(null, 'id');
const getByName = queryByAttribute.bind(null, 'name');

    const props = {
match: {
params: {
merchantId: 'merch-id',
},
},
history: [],
};

    const tenant = {
id: 'aaa-bb-cc',
legalStatus: 'Active',
operationalStatus: 'Open for Business',
legalName: 'Test Tenant',
};

    const dom = renderWithMockTenant(tenant, <ViewMerchant {...props} />);

    const pw = await dom.findByText('Please Wait...');
expect(pw);
await waitFor(() =>
expect(getById(dom.container, 'merchantType_div')).not.toBeNull(),
    ];

    expect(getById(dom.container, 'merchantType_div')).toHaveTextContent('10');
  }};
}};
