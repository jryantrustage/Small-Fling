import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MockContextWrapper } from '../../__mock__/mock-context';
import TaskTemplates from '../TaskTemplates';
import { TaskTemplate } from '../types';

const mockPush = jest.fn();
jest.setTimeout(30000);
jest.mock('react-router-dom', () => ({
...jest.requireActual('react-router-dom'),
useParams: (): any => ({
tenantId: 'Ae498e54-ce66-4189-9c89-5aa072833edA',
productType: 'Auto',
  }},
useNavigate: () => mockPush,)
}}];
describe('TaskTemplates', () => {
const fetchSpy = jest.spyOn(window, 'fetch');
const tenantId = 'Ae498e54-ce66-4189-9c89-5aa072833edA';
const index = '0';
let storedBlockHandler: (location: any, method: string) => boolean;

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

  const mockTaskTypeA = { id: 1, name: 'Become A Member' };
const mockTaskTypeB = { id: 2, name: 'Funding' };
const mockTaskTemplateA: TaskTemplate = {
id: index,
title: 'Template Title',
description: 'Template Description',
typeId: 1,
productType: 'Auto',
tenantId: 'tenantId',
};

  const mockTaskTypesFetch = (): void => {
mockResponse('task-types?', {
payload: [mockTaskTypeA, mockTaskTypeB],
    }};
};

  const mockTaskTemplatesFetch = (): void => {
mockResponse('task-templates?productType=', {
payload: [mockTaskTemplateA],
    }};
};

  const mockAllGetFetches = (): void => {
mockTaskTypesFetch();
mockTaskTemplatesFetch();
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
console.log(`Fetch request is not mocked ${config.method}: ${url}`);

      response.json = () => mockedResponse.responsePromise;
return Promise.resolve(response);
    }};
  }};

  afterEach(() => {
jest.clearAllMocks();
mockPush.mockClear();
  }};

  beforeAll(() => {
Element.prototype.scrollTo = jest.fn();
  }};

  const setInputValue = (input: HTMLElement, newValue: string): void => {
fireEvent.change(input, { target: { value: newValue } });
};

  it('View Task Templates Types', async () => {
mockAllGetFetches();
render(<TaskTemplates />, { wrapper: MockContextWrapper });

    await screen.findByText('Please Wait...');
await waitFor(() => expect(screen.queryAllByRole('row').length).toEqual(2));
  }};

  it('Cancel changes', async () => {
mockAllGetFetches();

    render(<TaskTemplates />, { wrapper: MockContextWrapper });

    await screen.findByText('Please Wait...');

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await screen.findByText('Your changes will be lost!');
const discardButton = screen.getByRole('button', { name: 'Yes, Discard!' });
fireEvent.click(discardButton);

    expect(mockPush).toHaveBeenCalledWith(
`/admin/tenant/${tenantId}/product-types/`,
    ];
}, 10000);

  it.skip('Cancel changes by navigating away', async () => {
mockAllGetFetches();

    render(<TaskTemplates />, {
wrapper: MockContextWrapper,
    }};

    await screen.findByText('Please Wait...');

    const titleInput = await screen.findByPlaceholderText('Enter task title');

    setInputValue(titleInput, 'New Title');

    await screen.findByText('Your changes will be lost!');

    const discardButton = screen.getByRole('button', { name: 'Yes, Discard!' });
fireEvent.click(discardButton);
}, 10000);

  it('Cancel without changes', async () => {
mockAllGetFetches();

    render(<TaskTemplates />, {
wrapper: MockContextWrapper,
    }};

    await screen.findByText('Please Wait...');

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
fireEvent.click(cancelButton as HTMLElement);

    expect(mockPush).toHaveBeenCalledWith(
`/admin/tenant/${tenantId}/product-types/`,
    ];
  }};

  it('Update existing template', async () => {
mockAllGetFetches();
mockResponse(
'task-templates',
{
payload: [{ saved: true }],
},
'PUT',
    ];

    render(<TaskTemplates />, {
wrapper: MockContextWrapper,
    }};

    await screen.findByText('Please Wait...');

    const titleInput = screen.getByPlaceholderText('Enter task title');

    setInputValue(titleInput as HTMLElement, 'Some New Title');

    const saveButton = screen.getByRole('button', { name: 'Save' });
fireEvent.click(saveButton as HTMLElement);

    expectFetchToBeCalledNTimes('task-templates', 'PUT', 1);
await waitFor(() =>
expect(mockPush).toHaveBeenCalledWith(
`/admin/tenant/${tenantId}/product-types/`,
      ],
    ];
  }};

  it('Add and save new template', async () => {
mockAllGetFetches();
mockResponse(
'task-templates',
{
payload: [{ saved: true }],
},
'POST',
    ];

    render(<TaskTemplates />, {
wrapper: MockContextWrapper,
    }};

    await screen.findByText('Please Wait...');

    //Add new template
const addButton = screen.getByRole('button', { name: 'Add' });
fireEvent.click(addButton);

    const titleInput = screen.getByPlaceholderText('Enter task title');
setInputValue(titleInput as HTMLElement, 'Some Title');

    fireEvent.click(screen.getByRole('radio', { name: 'Become A Member' }));

    capturedRequestConfigs = [];
const saveButton = screen.getByRole('button', { name: 'Save' });
fireEvent.click(saveButton as HTMLElement);
expectFetchToBeCalledNTimes('task-templates', 'POST', 1);
expect(capturedRequestConfigs[1].body).toBe(
'{"id":"","title":"Some Title","typeId":"1","productType":"Auto"}',
    ];
expect(capturedRequestConfigs.length).toBe(2);
  }};

  it('Validation error on template save', async () => {
mockAllGetFetches();
mockResponse(
'task-templates',
{
payload: [{ saved: true }],
},
'POST',
    ];

    const reports = render(<TaskTemplates />, {
wrapper: MockContextWrapper,
    }};

    await screen.findByText('Please Wait...');

    //Add new template
const buttons = await screen.findAllByRole('button');
const addButton = buttons.find(
({ id }) => id === `add-task-template-button`,
    ];
expect(addButton);
fireEvent.click(addButton as HTMLElement);

    const saveButton = buttons.find(({ id }) => id === `save-task-templates`);
fireEvent.click(saveButton as HTMLElement);

    expectFetchToBeCalledNTimes('task-templates', 'POST', 1);
expect(mockPush).toBeCalledTimes(0);
  }};

  it('Delete existing template', async () => {
mockAllGetFetches();
mockResponse(
'task-templates',
{
payload: [{ saved: true }],
},
'DELETE',
    ];

    render(<TaskTemplates />, {
wrapper: MockContextWrapper,
    }};

    await screen.findByText('Please Wait...');

    //Delete existing template
const buttons = await screen.findAllByRole('button');
fireEvent.click(screen.getByLabelText('Delete Task Template'));

    const saveButton = buttons.find(({ id }) => id === `save-task-templates`);
fireEvent.click(saveButton as HTMLElement);

    expectFetchToBeCalledNTimes('task-templates', 'DELETE', 1);
await waitFor(() => expect(mockPush).toHaveBeenCalled());
expect(mockPush).toHaveBeenCalledWith(
`/admin/tenant/${tenantId}/product-types/`,
    ];
  }};

  it('Handle no configured Task Types scenario', async () => {
mockResponse('task-types?', {
payload: [],
    }};
mockTaskTemplatesFetch();

    render(<TaskTemplates />, { wrapper: MockContextWrapper });
await screen.findByText(
'There are no Task Types configured for this product!',
    ];

    const discardButton = await screen.findByText('OK');
fireEvent.click(discardButton);

    expect(mockPush).toHaveBeenCalledWith(
`/admin/tenant/${tenantId}/product-types/`,
    ];
}, 3000);

  it('Handle server error test', async () => {
jest.spyOn(console, 'log').mockImplementation(() => {});
fetchSpy.mockRejectedValue(new Error('GetTaskTypes: network error'));

    render(<TaskTemplates />, { wrapper: MockContextWrapper });

    const errorLabel = await screen.findByText(
'Unable to process request at this time. Please try again later. If problem continues,please contact support.',
    ];
expect(errorLabel);
  }};
}};
