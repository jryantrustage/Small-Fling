import {
fireEvent,
queryByAttribute,
render,
screen,
waitFor,
} from '@testing-library/react';
import { uniqueId } from 'lodash';
import React from 'react';
import { MockContextWrapper } from '../../__mock__/mock-context';
import AssetTypes from '../AssetTypes';
import { AssetType, Expiration, ResourceType } from './../types';

const getById = queryByAttribute.bind(null, 'id');
jest.setTimeout(30000);

describe('AssetTypes', () => {
const fetchSpy = jest.spyOn(window, 'fetch');
const tenantId = 'Ae498e54-ce66-4189-9c89-5aa072833edA';
const key = '0-0';
const productType = 'Auto';
let storedBlockHandler: (location: any, method: string) => boolean;
const pushMock = jest.fn();

  const props: any = {
history: {
location: {
pathname: `/admin/tenant/${tenantId}/product-types/${productType}/asset-types`,
},
push: pushMock,
block: (blockHandler: (location: any, method: string) => boolean) => {
storedBlockHandler = blockHandler;
},
},
match: {
params: {
tenantId,
productType,
},
},
};

  interface MockedResponse {
path: string;
method: string;
responsePromise: any;
}

  let mockedResponses: MockedResponse[] = [];
let capturedRequestConfigs: any[] = [];
let calledResponseMocks: MockedResponse[] = [];

  const mockResponse = (path: string, data: any, method = 'GET'): void => {
mockedResponses.push({
path,
responsePromise: Promise.resolve(data),
method,
    }};
});

  const mockResourceTypes: ResourceType[] = [];
const mockExpirations: Expiration[] = [];
const mockAssetTypes: AssetType[] = [];

  mockResourceTypes.push({
resourceTypeid: 1,
name: 'Resource Type 1',
  }};
mockResourceTypes.push({
resourceTypeid: 2,
name: 'Resource Type 2',
  }};

  mockExpirations.push({
id: 1,
name: 'Resource Expiration 1',
  }};
mockExpirations.push({
id: 2,
name: 'Resource Expiration 2',
  }};

  mockAssetTypes.push({
id: uniqueId(),
productType: 'Account',
tenantId,
title: 'Asset Title 1',
isSingleUse: true,
expirationValueInvalid: false,
expirationValueRequired: false,
expirationIdRequired: false,
resourceTypeId: 1,
assetCategoryId: '1',
assetCategory: '1',
assetCategoryDescription: 'Description 1',
assetCategoryProductSubTypes: [],
  }};

  mockAssetTypes.push({
id: uniqueId(),
productType: 'Account',
tenantId,
title: 'Asset Title 2',
isSingleUse: true,
expirationValueInvalid: false,
expirationValueRequired: false,
expirationIdRequired: false,
resourceTypeId: 2,
assetCategoryId: '2',
assetCategory: '2',
assetCategoryDescription: 'Description 2',
assetCategoryProductSubTypes: [],
  }};

  const mockAssetTypesFetch = (): void => {
mockResponse('asset-types', {
payload: mockAssetTypes,
    }};
};

  const mockAllGetFetches = (): void => {
mockAssetTypesFetch();

    mockResponse('resource-types', {
payload: mockResourceTypes,
    }};

    mockResponse('expirations', {
payload: mockExpirations,
    }};

    mockResponse('tenant-core-product-templates', {
payload: [{ type: 'Auto', subtype: 'New' }],
    }};
};

  const expectFetchToBeCalledNTimes = (
path: string,
method: string,
nTimes: number,
): void => {
expect(
mockedResponses.filter((m: MockedResponse) => {
return path.indexOf(m.path) !== -1 && m.method === method;
}).length,
).toBe(nTimes);
};

  beforeEach(() => {
mockedResponses = [];
calledResponseMocks = [];
capturedRequestConfigs = [];
jest.clearAllMocks();
fetchSpy.mockReset();
fetchSpy.mockImplementation((url: any, config: any) => {
capturedRequestConfigs.push(config);
const mockedResponse = mockedResponses.find((m: MockedResponse) => {
return url.indexOf(m.path) !== -1 && m.method === config.method;
}) as MockedResponse;

      calledResponseMocks.push(mockedResponse);
const response = new Response();
if (!mockedResponse)
console.warn(`Fetch request is not mocked ${config.method}: ${url}`);

      response.json = () => mockedResponse.responsePromise;
return Promise.resolve(response);
    }};
  }};

  afterEach(() => {
jest.clearAllMocks();
pushMock.mockClear();
  }};

  beforeAll(() => {
jest.clearAllMocks();
pushMock.mockClear();
Element.prototype.scrollTo = jest.fn();
  }};

  const setInputValue = (input: HTMLElement, newValue: string): void => {
fireEvent.change(input, { target: { value: newValue } });
};

  it.only('View Asset Types', async () => {
mockAllGetFetches();
render(<AssetTypes {...props} />, { wrapper: MockContextWrapper });

    await screen.findByText('Please Wait...');
await screen.findAllByRole('table');

    await waitFor(() => expect(screen.queryAllByRole('row').length).toEqual(4));
  }};

  it('Cancel changes', async () => {
mockAllGetFetches();

    render(<AssetTypes {...(props as any)} />, { wrapper: MockContextWrapper });

    await screen.findByText('Please Wait...');

    fireEvent.click(screen.getByRole('button', { name: 'Add Category' }));
fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await screen.findByText('Your changes will be lost!');
const discardButton = screen.getByRole('button', { name: 'Yes, Discard!' });
fireEvent.click(discardButton);

    expect(pushMock).toHaveBeenCalledWith(
`/admin/tenant/${tenantId}/product-types/`,
    ];
}, 10000);

  it('Cancel changes by navigating away', async () => {
mockAllGetFetches();

    const historyPushMock = jest.fn().mockImplementation((path: string) => {
if (storedBlockHandler !== undefined) storedBlockHandler(path, 'PUSH');
    }};

    const testProps: any = {
...props,
history: {
...props.history,
push: historyPushMock,
},
};

    render(<AssetTypes {...testProps} />, {
wrapper: MockContextWrapper,
    }};

    await screen.findByText('Please Wait...');

    const titleInput = await screen.findAllByPlaceholderText(
'Enter asset type title',
    ];

    setInputValue(titleInput[0] as HTMLElement, 'New Title');

    testProps.history.push('someUrl');
await screen.findByText('Your changes will be lost!');

    const discardButton = screen.getByRole('button', { name: 'Yes, Discard!' });
fireEvent.click(discardButton);

    expect(historyPushMock).toHaveBeenCalledWith(`someUrl`);
}, 10000);

  it('Cancel without changes', async () => {
mockAllGetFetches();

    render(<AssetTypes {...props} />, {
wrapper: MockContextWrapper,
    }};

    await screen.findByText('Please Wait...');

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
fireEvent.click(cancelButton as HTMLElement);

    expect(pushMock).toHaveBeenCalledWith(
`/admin/tenant/${tenantId}/product-types/`,
    ];
  }};

  it('Update existing asset type', async () => {
mockAllGetFetches();
mockResponse(
'asset-types',
{
payload: [{ saved: true }],
},
'PUT',
    ];

    const reports = render(<AssetTypes {...props} />, {
wrapper: MockContextWrapper,
    }};

    await screen.findByText('Please Wait...');

    const titleInput = await getById(reports.container, `title-input-${key}`);

    setInputValue(titleInput as HTMLElement, 'Some New Title');
const saveButton = screen.getByRole('button', { name: 'Save' });
fireEvent.click(saveButton as HTMLElement);

    expectFetchToBeCalledNTimes('asset-types', 'PUT', 1);
await waitFor(() =>
expect(pushMock).toHaveBeenCalledWith(
`/admin/tenant/${tenantId}/product-types/`,
      ],
    ];
  }};

  it('Add and save new asset type', async () => {
mockAllGetFetches();
mockResponse(
'asset-types',
{
payload: [{ saved: true }],
},
'POST',
    ];

    const reports = render(<AssetTypes {...props} />, {
wrapper: MockContextWrapper,
    }};

    await screen.findByText('Please Wait...');

    const addButton = await screen.findAllByRole('button', {
name: 'Add Asset',
    }};
fireEvent.click(addButton[0] as HTMLElement);

    const titleInput = await getById(reports.container, `title-input-0-1`);
setInputValue(titleInput as HTMLElement, 'Some Title Row 3');
fireEvent.click(
screen.getAllByRole('radio', { name: 'Resource Type 2' })[1],
    ];

    const singleUseInput = await getById(
reports.container,
'single-use-switch-0-1',
    ];
fireEvent.click(singleUseInput as HTMLElement);
const saveButton = screen.getByRole('button', { name: 'Save' });
fireEvent.click(saveButton as HTMLElement);

    expectFetchToBeCalledNTimes('asset-types', 'POST', 1);
await waitFor(() =>
expect(pushMock).toHaveBeenCalledWith(
`/admin/tenant/${tenantId}/product-types/`,
      ],
    ];
expect(capturedRequestConfigs.length).toBe(5);
expect(JSON.parse(capturedRequestConfigs[4].body)).toEqual(
expect.objectContaining({
title: 'Some Title Row 3',
assetCategoryId: '1',
resourceTypeId: 2,
isSingleUse: true,
productType: 'Auto',
assetCategory: '',
tenantId: '',
      }],
    ];
  }};

  it('Validation error on asset type save', async () => {
mockAllGetFetches();
mockResponse(
'asset-types',
{
payload: [{ saved: true }],
},
'POST',
    ];

    const reports = render(<AssetTypes {...props} />, {
wrapper: MockContextWrapper,
    }};

    await screen.findByText('Please Wait...');

    //Add new asset type

    const addButton = await screen.findAllByRole('button', {
name: 'Add Asset',
    }};
fireEvent.click(addButton[0] as HTMLElement);

    const saveButton = await getById(reports.container, `save-asset-types`);
fireEvent.click(saveButton as HTMLElement);

    expectFetchToBeCalledNTimes('asset-types', 'POST', 1);
expect(pushMock).toBeCalledTimes(0);
  }};

  it('Delete existing asset type', async () => {
mockAssetTypes.push({
id: uniqueId(),
productType: 'Account',
tenantId,
title: 'Asset Title 3',
isSingleUse: true,
expirationValueInvalid: false,
expirationValueRequired: false,
expirationIdRequired: false,
resourceTypeId: 2,
assetCategoryId: '1',
assetCategory: '1',
assetCategoryDescription: 'Description 1',
assetCategoryProductSubTypes: [],
    }};
mockAllGetFetches();
mockResponse(
'asset-types',
{
payload: [{ saved: true }],
},
'DELETE',
    ];

    render(<AssetTypes {...props} />, {
wrapper: MockContextWrapper,
    }};

    await screen.findByText('Please Wait...');

    //Delete existing asset type
const deleteButton = await screen.findAllByLabelText('Delete Asset Type');
fireEvent.click(deleteButton[0] as HTMLElement);

    const saveButton = await screen.findByRole('button', { name: 'Save' });
fireEvent.click(saveButton);

    expectFetchToBeCalledNTimes('asset-types', 'DELETE', 1);
await waitFor(() => expect(pushMock).toHaveBeenCalled());
expect(pushMock).toHaveBeenCalledWith(
`/admin/tenant/${tenantId}/product-types/`,
    ];
  }};

  it('Handle server error test', async () => {
jest.spyOn(console, 'log').mockImplementation(() => {});
fetchSpy.mockRejectedValue(new Error('GetAssetTypes: network error'));

    render(<AssetTypes {...props} />, { wrapper: MockContextWrapper });

    const errorLabel = await screen.findByText(
'Unable to process request at this time. Please try again later. If problem continues,please contact support.',
    ];
expect(errorLabel);
  }};
}};
