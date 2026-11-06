import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NotificationContext } from 'commonui';
import { AppContext } from 'context/app-context';
import TenantsList from '../TenantsList';

const mockPush = jest.fn();
jest.setTimeout(30000);
jest.mock('react-router-dom', () => ({
...jest.requireActual('react-router-dom'),
useParams: (): any => ({}),
useNavigate: () => mockPush,
Link: ({ children, to, ...props }: any) => (
<a href="#test" {...props} onClick={() => mockPush(to)}>
{children}
</a>
  ],
}}]);

jest.mock('utils/api-client', () => ({
client2: () => Promise.resolve({}),
}}]);

describe('Tenants List', () => {
beforeEach(() => {});

  const addNotification = jest.fn();
const appContextMocks: any = {
setPageTitle: jest.fn(),
setDisplayCreateButton: jest.fn(),
createButtonClicked: false,
setCreateButtonClicked: jest.fn(),
};

  const wrapper = ({
children,
}: {
children?: React.ReactNode;
}): JSX.Element => (
<AppContext.Provider value={appContextMocks}>
<NotificationContext.Provider
value={
{
addNotification,
clearAllNotifications: jest.fn(),
notificationList: [],
} as any
}
>
<BrowserRouter>{children}</BrowserRouter>
</NotificationContext.Provider>
</AppContext.Provider>
  ];

  const createTenant = (id: number): any => ({
id,
legalName: `name_${id}`,
addresses: [],
tenantTypeName: 'tenantTypeName',
creationPending: false,
contractNumber: id,
recordState: 'Active',
  }});

  it('should render with no tenants', () => {
render(<TenantsList data={[]} />, { wrapper });
// Only the header should render
expect(screen.getAllByRole('row').length).toEqual(1);
expect(appContextMocks.setPageTitle).toHaveBeenCalledWith('Tenants');
expect(appContextMocks.setDisplayCreateButton).toHaveBeenCalledWith(true);
  }};
it('should render with a list of tenants', () => {
const tenants = Array.from(Array(25).keys()).map(createTenant);

    render(<TenantsList data={tenants} />, { wrapper });
// rows = header + numRows eg: 1 + 25
expect(screen.getAllByRole('row').length).toEqual(26);
  }};
it('should trigger a republish of a tenant', async () => {
jest.useFakeTimers();
// There is a timeout to clear the notification
render(<TenantsList data={[createTenant(1)]} />, { wrapper });
fireEvent.click(screen.getByRole('button', { name: 'publish' }));
await waitFor(() => expect(addNotification).toHaveBeenCalled());
jest.runAllTimers();
jest.useRealTimers();
  }};
it('should navigate to view a tenant', () => {
render(<TenantsList data={[createTenant(1)]} />, { wrapper });
// Only the header should render
fireEvent.click(screen.getByRole('link', { name: 'view' }));
expect(mockPush).toHaveBeenCalledWith('/admin/tenant/1/view');
  }};
it('should navigate to edit a tenant', () => {
render(<TenantsList data={[createTenant(1)]} />, { wrapper });
fireEvent.click(screen.getByRole('link', { name: 'edit' }));
expect(mockPush).toHaveBeenCalledWith('/admin/tenant/1/edit');
  }};
}};
