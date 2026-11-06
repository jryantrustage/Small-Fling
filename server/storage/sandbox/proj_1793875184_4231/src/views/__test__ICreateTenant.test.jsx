import {
fireEvent,
queryByAttribute,
screen,
waitFor,
} from '@testing-library/react';
import { renderWithMockContext } from 'components/__mock__/mock-context';
import {
clickCheckBox,
clickElementWithDisplayText,
clickRadioButton,
mockFetchResponseOnce,
mockGetOnce,
spyPostOrPutOnce,
} from 'components/__test__/TestUtils';
import React from 'react';
import CreateTenant from 'views/CreateTenant/CreateTenant';
import * as APIClient from 'utils/api-client';
import { getAuthorizationAPIRequest, updateAuthorizationAPIRequest } from 'API';
import * as ReactRouter from 'react-router-dom';

const mockPush = jest.fn();

const getById = queryByAttribute.bind(null, 'id');
jest.mock('react-router-dom', () => ({
...jest.requireActual('react-router-dom'),
useNavigate: () => mockPush,
useParams: jest.fn(),
}}]);

describe('CreateTenant', () => {
const fetchSpy = jest.spyOn(window, 'fetch');
const tenantId = '1dd6b431-de32-4492-a78b-eeced1c5f881';

  beforeEach(() => {
jest.spyOn(ReactRouter, 'useParams').mockReturnValue({
tenantId,
tenantType: 'ficusApiclient',
    }};
  }};

  afterEach(() => {
jest.clearAllMocks();
jest.resetAllMocks();
  }};

  const mockWindowFetchOnce = (isOk, responseObject) => {
const mockJsonPromise = Promise.resolve(responseObject);
fetchSpy.mockResolvedValueOnce({
ok: isOk,
json: () => mockJsonPromise,
    }};
};

  const updateField = (wrapper, fieldId, updatedValue) => {
let fieldInput = getById(wrapper.container, fieldId);

    fireEvent.change(fieldInput, { target: { value: updatedValue } });

    fieldInput = getById(wrapper.container, fieldId);
expect(fieldInput.value).toBe(updatedValue);
};

  const mockMerchant = {
payload: [
{
recordState: 'Test',
id: '987654',
cuicCustomerNumber: '888999888',
merchantTypeId: 12345,
merchantTypeCode: 'Code',
merchantTypeName: 'Merchant Company',
legalName: 'The Merchant of Venison',
postalName: 'Vandelay Industries',
addresses: [
{
addressType: 'bad',
line1: '3000 W. Alameda Ave.',
city: 'Burbank',
state: 'CA',
postalCode: '91523',
country: 'US',
},
],
resourceUrl: 'http://www.yahoo.com',
},
],
};

  const mockAPICLient = (func, isOk, responseObject, status) => {
jest.spyOn(APIClient, func).mockResolvedValueOnce({
ok: isOk,
status: status,
json: () => Promise.resolve(responseObject),
    }};
};

  const mockGetExtAuthorizationRequest = (responseValue) => {
const mockGetAuthAPI = { getAuthorizationAPIRequest };
jest
.spyOn(mockGetAuthAPI, 'getAuthorizationAPIRequest')
.mockReturnValue(Promise.resolve(responseValue));
};

  const mockUpdateExtAuthorizationRequest = () => {
const mockUpdateAuthAPI = { updateAuthorizationAPIRequest };
jest
.spyOn(mockUpdateAuthAPI, 'updateAuthorizationAPIRequest')
.mockReturnValue(Promise.resolve());
};

  test('Successful save draft', async () => {
const mockTenant = {
payload: {
recordState: 'Draft',
contractNumber: '12345678',
legalName: 'legalName1',
defaultZipCode: '11111',
tenantSchema: 'Test12345',
defaultMerchantId: null,
},
};

    mockGetOnce(mockTenant);
mockGetOnce(mockMerchant);

    // check save payload
spyPostOrPutOnce((endpoint, config) => {
const data = JSON.parse(config.body);
expect(data.leagueMember).toBe(true);
expect(data.charterType).toBe('Federal');
    }};

    mockFetchResponseOnce(mockTenant);

    renderWithMockContext(<CreateTenant />);

    const legalName = await screen.findByDisplayValue('legalName1');
expect(legalName);

    fireEvent.click(screen.getByLabelText('Yes')); // is league member?
clickRadioButton('Federal'); // charter type
clickCheckBox('memberizationRequired'); // memberization required?

    clickElementWithDisplayText('Save Draft');
  }};

  test('Successful save active tenant', async () => {
const mockTenant = {
payload: {
recordState: 'Draft',
contractNumber: '12345678',
cuicCustomerNumber: '0001',
legalName: 'legalName1',
legalStatus: 'Active',
operationalStatus: 'Open for Business',
tenantTypeName: 'Credit Union',
tenantTypeId: '1',
tenantTypeCode: 'CU',
tenantSchema: 'Test12345',
losMembershipRedirectUrl: 'https://member.creditunion.com',
addresses: [
{
addressType: 'Mailing',
line1: 'mailing line 1',
line2: 'mailing line 2',
line3: 'mailing line 3',
city: 'mailingCity',
county: 'mailingCounty',
state: 'IL',
postalCode: '10000',
country: 'US',
},
{
addressType: 'Physical',
line1: 'physical line 1',
line2: 'physical line 2',
line3: 'physical line 3',
city: 'physicalCity',
county: 'physicalCounty',
state: 'WI',
postalCode: '10001',
country: 'US',
},
],
defaultMerchantId: null,
defaultZipCode: '11111',
homeBanking: 'Q2',
},
};

    mockGetOnce(mockTenant);
mockGetOnce(mockMerchant);
mockGetOnce({});
mockGetOnce(true);

    renderWithMockContext(<CreateTenant />);

    const legalName = await screen.findByDisplayValue('legalName1');
expect(legalName);

    clickElementWithDisplayText('Save');
await waitFor(() => expect(mockPush).toHaveBeenCalled());
  }};

  test('API Client', async () => {
const mockAPITenant = {
payload: {
legalName: 'Franz Ferdinand',
tenantTypeName: 'Api Client',
tenantTypeId: '3',
tenantTypeCode: 'APICLIENT',
contractNumber: '12348765',
tenantTypeName: 'Credit Union',
apiContactName: 'Bob Appomattox',
apiContactEmail: 'bobApp@gmail.com',
ficusApiClient: true,
},
};

    mockGetOnce(mockAPITenant);
mockGetOnce(mockMerchant);
mockGetOnce({});
mockGetOnce(true);

    renderWithMockContext(<CreateTenant />);
const contactName = await screen.findByDisplayValue('Bob Appomattox');
expect(contactName);
clickElementWithDisplayText('Save');
await waitFor(() => expect(mockPush).toHaveBeenCalled);
  }};

  test('Form errors saving draft', async () => {
jest
.spyOn(ReactRouter, 'useParams')
.mockReturnValue({ tenantType: 'CreditUnion' });

    renderWithMockContext(<CreateTenant />);

    clickElementWithDisplayText('Save Draft');

    const formErrorsDialog = await screen.findByText('Form Errors');
expect(formErrorsDialog);
  }};

  test('Validation error on save draft', async () => {
const mockTenant = {
payload: {
recordState: 'Draft',
contractNumber: '12345678',
legalName: 'legalName1',
survivingContractNumber: '12345678',
defaultZipCode: '11111',
tenantSchema: 'Test12345',
defaultMerchantId: null,
},
};

    mockGetOnce(mockTenant);
mockGetOnce(mockMerchant);
mockGetOnce({});
mockGetExtAuthorizationRequest(true);

    jest.spyOn(APIClient, 'client').mockReturnValueOnce({
ok: false,
status: 400,
json: {
payload: null,
result: {
correlationId: 'b14f8d31-122b-4e8b-8ad9-8a71d655f15a',
code: 1,
message: null,
apiVer: '2.9.6',
count: 1,
itemTotal: 0,
page: 0,
pageSize: 25,
pageTotal: 0,
nextPageUrl: null,
prevPageUrl: null,
errors: [
{
code: 'ERR_WRONG_TENANTID',
message: 'Duplicate surviving contract number.',
timestamp: '01/25/2024 02:37',
},
],
},
},
    }};

    renderWithMockContext(<CreateTenant />);

    const legalName = await screen.findByDisplayValue('legalName1');
expect(legalName);

    const validationErrorDialogText = screen.queryByText(
'There are errors in the form:',
    ];
expect(validationErrorDialogText).toBe(null);

    clickElementWithDisplayText('Save Draft');

    const validationErrorMessage = await screen.findByText(
'Duplicate surviving contract number.',
    ];
expect(validationErrorMessage);
  }};

  test('Duplication error on save draft', async () => {
const mockTenant = {
payload: {
recordState: 'Draft',
contractNumber: '12345678',
legalName: 'legalName1',
survivingContractNumber: '12345678',
addresses: [
{
addressType: 'Physical',
            linel: null,
line2: null,
line3: null,
city: null,
county: null,
state: null,
postalCode: null,
country: null,
},
{
addressType: 'Mailing',
            linel: null,
line2: null,
line3: null,
city: null,
county: null,
state: null,
postalCode: null,
country: null,
},
],
defaultZipCode: '11111',
defaultMerchantId: null,
},
};

    mockGetOnce(mockTenant);
mockGetOnce(mockMerchant);

    mockAPICLient(
'client',
false,
mockTenant,
process.env.REACT_APP_HTTP_RESPONSE_DUPLICATE_ERROR,
    ];

    renderWithMockContext(<CreateTenant />);

    const legalName = await screen.findByDisplayValue('legalName1');
expect(legalName);

    let validationErrorDialogText = screen.queryByText(
'A tenant with the same legal name and contract number already exists.',
    ];
expect(validationErrorDialogText).toBe(null);

    fireEvent.click(screen.getByText('Save Draft'));

    validationErrorDialogText = await screen.findByText(
'A tenant with the same legal name and contract number already exists.',
    ];
expect(validationErrorDialogText);
  }};

  test('Service error on save draft', async () => {
const mockTenant = {
payload: {
recordState: 'Draft',
contractNumber: '12345678',
legalName: 'legalName1',
survivingContractNumber: '12345678',
defaultZipCode: '11111',
defaultMerchantId: null,
},
};

    mockGetOnce(mockTenant);
mockGetOnce(mockMerchant);

    mockFetchResponseOnce({
ok: false,
status: '500',
json: () => {},
    }};

    mockAPICLient('client', false, mockTenant, '500');
mockGetExtAuthorizationRequest(true);
mockUpdateExtAuthorizationRequest();

    renderWithMockContext(<CreateTenant />);

    const legalName = await screen.findByDisplayValue('legalName1');
expect(legalName);

    let serviceErrorDialogText = screen.queryByText('Service Error');
expect(serviceErrorDialogText).toBe(null);

    clickElementWithDisplayText('Save Draft');

    serviceErrorDialogText = await screen.findByText('Service Error');
expect(serviceErrorDialogText);
  }};

  test('Discard form', async () => {
jest
.spyOn(ReactRouter, 'useParams')
.mockReturnValue({ tenantType: 'ficusApiClient' });

    renderWithMockContext(<CreateTenant />);
fireEvent.click(screen.getByRole('button', { name: 'Discard Changes' }));
fireEvent.click(screen.getByRole('button', { name: 'Yes, Discard!' }));
await waitFor(() => expect(mockPush).toHaveBeenCalled());
  }};

  test.skip('Update fields', async () => {
jest.spyOn(ReactRouter, 'useParams').mockReturnValue({});

    const wrapper = renderWithMockContext(<CreateTenant />);

    const tenantInformation = await screen.findByText('Tenant Information');
expect(tenantInformation);

    updateField(wrapper, 'legalName', 'legalName1');
updateField(wrapper, 'postalName', 'postalName1');
updateField(wrapper, 'abbreviatedName', 'abbreviatedName1');
updateField(wrapper, 'contractNumber', '12345678');
updateField(wrapper, 'cuicCustNumber', '0001');
updateField(wrapper, 'tenantSchema', 'Test12345');
updateField(wrapper, 'defaultMerchantId', null);

    let selector = getById(wrapper.container, 'select-tenantType');
fireEvent.click(selector);
const creditUnionOptions = await screen.findAllByText('Credit Union');
fireEvent.click(creditUnionOptions[1]);
const tenantTypeInput = getById(wrapper.container, 'tenant-type');
expect(tenantTypeInput);
expect(tenantTypeInput.value).toBe('Credit Union');

    selector = getById(wrapper.container, 'select-legalStatus');
expect(selector);
fireEvent.click(selector);
const legalStatus = await screen.findByText('Merged');
fireEvent.click(legalStatus);
const legalStatusInput = getById(wrapper.container, 'legal-status');
expect(legalStatusInput);
expect(legalStatusInput.value).toBe('Merged');

    selector = getById(wrapper.container, 'select-operationalStatus');
expect(selector);
fireEvent.click(selector);
const operationalStatus = await screen.findByText('Open For Business');
fireEvent.click(operationalStatus);
const operationalStatusInput = await getById(
wrapper.container,
'operational-status',
    ];
expect(operationalStatusInput);
expect(operationalStatusInput.value).toBe('Open For Business');

    updateField(wrapper, 'numMembers', '1');
updateField(wrapper, 'memClassCd', '2');
updateField(wrapper, 'memClassDesc', '3');
updateField(wrapper, 'survContractNum', '87654321');
updateField(wrapper, 'website', 'test@test.com');
updateField(wrapper, 'phoneNumber', '5550000000');
updateField(wrapper, 'assetRank', '4');
updateField(wrapper, 'assetSize', '5');

    updateField(wrapper, 'addLine1', 'line1');
updateField(wrapper, 'addLine2', 'line2');
updateField(wrapper, 'addLine3', 'line3');
updateField(wrapper, 'addCity', 'city1');
updateField(wrapper, 'addZip', '10000');

    // trigger address error helper text
const invalidEntry =
'**************************************************************';
updateField(wrapper, 'addLine1', invalidEntry);
updateField(wrapper, 'addLine2', invalidEntry);
updateField(wrapper, 'addLine3', invalidEntry);
updateField(wrapper, 'addCity', invalidEntry);
updateField(wrapper, 'addCounty', invalidEntry);
updateField(wrapper, 'addZip', invalidEntry);

    let helperText = getById(wrapper.container, 'addLine1-text');
expect(helperText.textContent).toBe(
'Value cannot be more than 30 characters long.',
    ];

    helperText = getById(wrapper.container, 'addLine2-text');
expect(helperText.textContent).toBe(
'Value cannot be more than 30 characters long.',
    ];

    helperText = getById(wrapper.container, 'addLine3-text');
expect(helperText.textContent).toBe(
'Value cannot be more than 30 characters long.',
    ];

    helperText = getById(wrapper.container, 'addCity-text');
expect(helperText.textContent).toBe(
'Value cannot be more than 25 characters long.',
    ];

    helperText = getById(wrapper.container, 'addCounty-text');
expect(helperText.textContent).toBe(
'Value cannot be more than 25 characters long.',
    ];

    helperText = getById(wrapper.container, 'addZip-text');
expect(helperText.textContent).toBe(
'Value cannot be more than 10 characters long.',
    ];

    // trigger defaults error helper text
updateField(wrapper, 'defaultZipCode', invalidEntry);
updateField(wrapper, 'tenantSchema', invalidEntry);

    helperText = getById(wrapper.container, 'defaultZipCode-text');
expect(helperText.textContent).toBe(
'Value cannot be more than 10 characters long.',
    ];

    helperText = getById(wrapper.container, 'tenantSchema-text');
expect(helperText.textContent).toBe(
'Value cannot be more than 5o alphanumeric characters long and cannot start with a number.',
    ];

    updateField(wrapper, 'losMembershipRedirectUrlRefId', invalidEntry);
helperText = getById(
wrapper.container,
'losMembershipRedirectUrlRefId-text',
    ];
expect(helperText.textContent).toBe(
'Reference ID cannot be more than 35 characters long.',
    ];

    updateField(
wrapper,
'losMembershipRedirectUrlRefId',
'http://www.google.com',
    ];
helperText = getById(
wrapper.container,
'losMembershipRedirectUrlRefId-text',
    ];
expect(helperText.textContent).toBe(
'Value must only contain alphanumeric characters.',
    ];
}, 20000);

  test.skip('Test tenant pending state in Edit mode', async () => {
const mockTenant = {
payload: {
recordState: 'Draft',
contractNumber: '12345678',
legalName: 'legalName1',
defaultMerchantId: null,
defaultZipCode: '11111',
tenantSchema: 'Test12345',
creationPending: true,
homeBanking: 'Q2',
},
};

    mockWindowFetchOnce(true, mockTenant);
mockWindowFetchOnce(true, mockMerchant);
mockWindowFetchOnce(true, mockTenant);
mockWindowFetchOnce(true, {
payload: {
...mockTenant.payload,
creationPending: false,
},
    }};
mockWindowFetchOnce(true, mockMerchant);

    const props = {
...defaultProps,
match: {
path: '', // does not contain 'create' in path.. will be in edit mode
params: {
tenantId: '1dd6b431-de32-4492-a78b-eeced1c5f881',
},
},
};

    jest.useFakeTimers();

    renderWithMockContext(<CreateTenant {...props} />);

    await screen.findByText(
'This tenant is still in the process of being created, and cannot be edited.',
    ];

    jest.runOnlyPendingTimers();

    await screen.findByText(
'This tenant is still in the process of being created, and cannot be edited.',
    ];

    jest.runOnlyPendingTimers();

    // expect the form to ultimately be populated, once the tenant is no longer pending
const legalName = screen.getByDisplayValue('legalName1');
expect(legalName);

    // expect two fetches where the tenant was pending, followed by a third where it was not
// expect(setTimeout).toHaveBeenCalledTimes(2);
  }};
}};
