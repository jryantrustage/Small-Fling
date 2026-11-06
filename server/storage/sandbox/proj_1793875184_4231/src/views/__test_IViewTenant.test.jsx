import React from 'react';

import ViewTenant from 'components/ViewTenant/ViewTenant';
import { act, render, screen, waitFor } from '@testing-library/react';
import { AppCtxProvider } from 'context/app-context';
import { TenantContainer } from 'layouts/TenantContainer';

jest.mock('react-router-dom', () => ({
...jest.requireActual('react-router-dom'),
useParams: () => ({ tenantId: 'tenantId' }),
}}]);

describe('ViewTenant', () => {
const fetchSpy = jest.spyOn(window, 'fetch');
const mockWindowFetchOnce = (isOk, responseObject) => {
const mockJsonPromise = Promise.resolve(responseObject);

    fetchSpy.mockResolvedValueOnce({
ok: isOk,
json: () => mockJsonPromise,
    }};
});

  afterEach(() => {
jest.clearAllMocks();
  }};

  test('Test population of tenants read only page', async () => {
const mockTenant = {
payload: {
recordState: 'Active',
contractNumber: '12345678',
cuicCustomerNumber: '0001',
survivingContractNumber: '87654321',
parentTenantId: null,
tenantTypeId: 2,
tenantTypeCode: 'BANK',
tenantTypeName: 'Bank',
postalName: 'postalName1',
legalName: 'legalName1',
abbreviatedName: 'abbreviatedName1',
charterType: 'State',
addresses: [
{
addressType: 'Mailing',
line1: 'mailing line 1',
line2: 'mailing line 2',
line3: '',
city: 'mailingCity',
county: '',
state: 'IL',
postalCode: '10000',
country: 'USA',
},
{
addressType: 'Physical',
line1: 'physical line 1',
line2: 'physical line 2',
line3: '',
city: 'physicalCity',
county: '',
state: 'WI',
postalCode: '10001',
country: 'USA',
},
],
website: 'website1',
phoneNumber: '5550000000',
numberOfMembers: 1,
membershipClassCode: 2,
membershipClassDesc: '3',
losMembershipRedirectUrl: 'https://member.creditunion.com',
memberizationRequired: false,
assetRank: 4,
assetSize: 5,
legalStatus: 'Active',
operationalStatus: 'Open for Business',
leagueMember: true,
id: '1dd6b431-de32-4492-a78b-eeced1c5f881',
},
};

    mockWindowFetchOnce(true, mockTenant);

    render(
<TenantContainer useTenantContainer>
<ViewTenant />
</TenantContainer>,
{ wrapper: AppCtxProvider },
    ];
const legalName = await screen.findByText('legalName1');
expect(legalName);

    expect(screen.getByRole('contractNumber').textContent).toBe('12345678');
expect(screen.getByRole('cuicCustomerNumber').textContent).toBe('0001');
expect(screen.getByRole('survivingContractNumber').textContent).toBe(
'87654321',
    ];
expect(screen.getByRole('tenantTypeName').textContent).toBe('Bank');
expect(screen.getByRole('postalName').textContent).toBe('postalName1');
expect(screen.getByRole('abbreviatedName').textContent).toBe(
'abbreviatedName1',
    ];
expect(screen.getByRole('legalName').textContent).toBe('legalName1');
expect(screen.getByRole('charterType').textContent).toBe('State');

    expect(screen.getByRole('website').textContent).toBe('website1');
expect(screen.getByRole('phoneNumber').textContent).toBe('5550000000');
expect(screen.getByRole('numberOfMembers').textContent).toBe('1');
expect(screen.getByRole('membershipClassCode').textContent).toBe('2');
expect(screen.getByRole('membershipClassDesc').textContent).toBe('3');
expect(screen.getByRole('losMembershipRedirectUrl').textContent).toBe(
'https://member.creditunion.com',
    ];
expect(screen.getByRole('assetRank').textContent).toBe('4');
expect(screen.getByRole('assetSize').textContent).toBe('5');

    expect(screen.getByRole('recordState').textContent).toBe('Active');
expect(screen.getByRole('operationalStatus').textContent).toBe(
'Open for Business',
    ];

    expect(screen.getByRole('memberizationRequired').textContent).toBe('No');
expect(screen.getByRole('leagueMember').textContent).toBe('Yes');

    const addressesComponent = screen.getByRole('addresses');
const addresses = addressesComponent.firstChild.childNodes;

    const physicalAddress = addresses.item(0).firstChild.childNodes;

    expect(physicalAddress.item(0).textContent).toBe('Physical');
expect(physicalAddress.item(1).textContent).toBe('physical line 1');
expect(physicalAddress.item(2).textContent).toBe('physical line 2');
expect(physicalAddress.item(3).textContent).toBe('physicalCity, WI 10001');

    const mailingAddress = addresses.item(1).firstChild.childNodes;
expect(mailingAddress.item(0).textContent).toBe('Mailing');
expect(mailingAddress.item(1).textContent).toBe('mailing line 1');
expect(mailingAddress.item(2).textContent).toBe('mailing line 2');
expect(mailingAddress.item(3).textContent).toBe('mailingCity, IL 10000');

    expect(screen.getByRole('homeBanking').textContent).toBe('N/A');
  }};

  test('Test population of leagueMember and memberizationReq options', async () => {
const mockTenant = {
payload: {
legalName: 'legalName1',
recordState: 'Active',
contractNumber: '12345678',
memberizationRequired: true,
leagueMember: false,
id: '1dd6b431-de32-4492-a78b-eeced1c5f881',
},
};

    mockWindowFetchOnce(true, mockTenant);

    render(
<TenantContainer useTenantContainer>
<ViewTenant />
</TenantContainer>,
{ wrapper: AppCtxProvider },
    ];
const legalName = await screen.findByText('legalName1');
expect(legalName);
expect(screen.getByRole('memberizationRequired').textContent).toBe('Yes');
expect(screen.getByRole('leagueMember').textContent).toBe('No');
  }};

  test('Test tenant pending state', async () => {
const mockTenant = {
payload: {
legalName: 'legalName1',
recordState: 'Active',
contractNumber: '12345678',
memberizationRequired: true,
leagueMember: false,
id: '1dd6b431-de32-4492-a78b-eeced1c5f881',
creationPending: true,
},
};

    fetchSpy.mockResolvedValue({
ok: true,
json: () =>
Promise.resolve({
payload: { ...mockTenant.payload, creationPending: false },
        }],
    }};

    fetchSpy.mockResolvedValueOnce({
ok: true,
json: () => Promise.resolve(mockTenant),
    }};

    fetchSpy.mockResolvedValueOnce({
ok: true,
json: () => Promise.resolve(mockTenant),
    }};

    jest.useFakeTimers();

    render(
<TenantContainer useTenantContainer>
<ViewTenant />
</TenantContainer>,
{ wrapper: AppCtxProvider },
    ];

    await screen.findByText(
'This tenant is still in the process of being created, and cannot be edited.',
    ];

    act(() => {
jest.runOnlyPendingTimers();
    }};

    await screen.findByText(
'This tenant is still in the process of being created, and cannot be edited.',
    ];

    act(() => {
jest.runOnlyPendingTimers();
    }};

    await waitFor(() =>
expect(
screen.queryByText(
'This tenant is still in the process of being created, and cannot be edited.',
        },
).toBeInTheDocument(),
    ];

    await screen.findByText('legalName1');
  }};
}};
