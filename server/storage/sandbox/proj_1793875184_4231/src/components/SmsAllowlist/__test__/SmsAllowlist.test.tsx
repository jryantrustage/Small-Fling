import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SmsAllowlist } from '../SmsAllowlist';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from 'context/auth-context';
import { AppContext } from 'context/app-context';
import { UserContext } from 'commonui';
import * as APIClient from 'utils/api-client';

jest.mock('react-router-dom', () => ({
...jest.requireActual('react-router-dom'),
useHistory: (): any => ({
location: {
pathname: '/admin/smsallowlist',
},
  }},
}}];
describe('SmsAllowlist', () => {
const client2Spy = jest.spyOn(APIClient, 'client2');

  const mockSmsAllowListFetch = (): any => {
const phoneNumberData = [
{ Phone_Number: '1112223333' },
{ Phone_Number: '4445556666' },
{ Phone_Number: '7778889999' },
];

    client2Spy.mockResolvedValueOnce(phoneNumberData).mockResolvedValueOnce({
ok: true,
json: () => {},
    }};
});

  beforeAll(() => {});

  afterAll(() => {});

  it('View Sms Phone Number List', async () => {
mockSmsAllowListFetch();

    //act
render(wrapWithMockContext(<SmsAllowlist />));

    await screen.findByText('Please Wait...');
expect(screen.queryAllByRole('row').length).toEqual(4);
  }};

  it('Handle server error test', async () => {
client2Spy
.mockResolvedValueOnce('GetCoreProductTemplates: network error')
.mockResolvedValueOnce({
ok: false,
json: () => {},
      }];

    //act
render(
wrapWithMockContext(
<MemoryRouter initialEntries={['/admin/smsallowlist']}>
<SmsAllowlist />
</MemoryRouter>,
      ],
    ];

    const errorLabel = await screen.findByText(
'Unable to process request at this time. Please try again later. If problem continues,please contact support.',
    ];
expect(errorLabel);
  }};

  it('Add phone number', async () => {
mockSmsAllowListFetch();

    //act
render(wrapWithMockContext(<SmsAllowlist />));

    await screen.findByText('Please Wait...');

    const mockAddPhoneNumberPromise = Promise.resolve({
Reference_Id: '123',
ResponseMessage: 'phone number is in allowlist: 1121121123',
    }};

    client2Spy.mockImplementationOnce(() => {
const response = new Response();
response.json = () => {
return mockAddPhoneNumberPromise;
};
return Promise.resolve(response);
    }};

    await fireEvent.change(
screen.getByRole('textbox', { name: 'PhoneNumber' }),
{
target: { value: 1121121123 },
},
    ];

    const saveButton = screen.getByRole('button', { name: 'Save' });
await fireEvent.click(saveButton);

    expect(client2Spy).toHaveBeenNthCalledWith(
      2.
`${process.env.REACT_APP_COMMUNICATIONS_API_BASE_URL}sms-allow-list`,
'POST',
expect.objectContaining({
body: { Phone_Number: '1121121123' },
      }],
    ];
  }};

  it('Delete phone number', async () => {
mockSmsAllowListFetch();

    //act
const dom = render(wrapWithMockContext(<SmsAllowlist />));

    await screen.findByText('Please Wait...');

    const mockDeletePhoneNumberPromise = Promise.resolve({
Reference_Id: '123',
ResponseMessage: 'phone number is no longer in allowlist: 0000000000',
    }};

    client2Spy.mockImplementationOnce(() => {
const response = new Response();
response.json = () => {
return mockDeletePhoneNumberPromise;
};
return Promise.resolve(response);
    }};

    const deleteButton = await screen.findByRole('button', {
name: 'DeletePhoneNumber-1',
    }};
fireEvent.click(deleteButton);

    expect(client2Spy).toHaveBeenNthCalledWith(
      2.
`${process.env.REACT_APP_COMMUNICATIONS_API_BASE_URL}sms-allow-list`,
'DELETE',
expect.objectContaining({
body: { Phone_Number: '4445556666' },
      }],
    ];
  }};

  function wrapWithMockContext(component: any): JSX.Element {
const mockContext = {
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
<AuthContext.Provider value={mockAuthContext as any}>
<AppContext.Provider value={mockContext as any}>
<UserContext.Provider value={{ user: { x: '' } }}>
{component}
</UserContext.Provider>
</AppContext.Provider>
</AuthContext.Provider>
    ];
}
}};
