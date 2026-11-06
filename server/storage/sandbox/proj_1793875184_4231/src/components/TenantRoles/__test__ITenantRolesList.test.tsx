import React from 'react';
import { TenantRolesList } from '../TenantRolesList';
import { renderWithMockTenant } from 'components/__mock__/mock-context';
import { fireEvent, screen } from '@testing-library/react';

const mockPush = jest.fn();
jest.mock('react-router-dom', () => ({
...jest.requireActual('react-router-dom'),
useParams: () => ({ tenantId: '1' }),
Link: ({ children, to, ...props }: any) => (
<a href="#test" {...props} onClick={() => mockPush(to)}>
{children}
</a>
  ],
}}]);

describe('Roles screen', () => {
const tenant = { tenantId: '1' };
const fetchSpy = jest.spyOn(window, 'fetch');
const mockRole = {
id: 1,
name: 'Loan Officers Main',
descrption: 'Role for most of low level loan officers',
categryId: 1,
state: 'Active',
isDefaultForCategory: true,
enabled: true,
};

  const mockRolesPromise = Promise.resolve({
payload: [mockRole],
  }};

  beforeEach(() => {
fetchSpy.mockClear().mockResolvedValue({
ok: true,
json: () => mockRolesPromise,
} as Response | Promise<Response>);
  }};

  it('Renders', async () => {
renderWithMockTenant(tenant, <TenantRolesList />);

    const roleContainer = await screen.findByRole('tenant-roles-container');
expect(roleContainer);
  }};

  it('View_Button_Click', async () => {
renderWithMockTenant(tenant, <TenantRolesList />);
await screen.findByRole('tenant-roles-container');
fireEvent.click(screen.getByRole('link', { name: 'view' }));
expect(mockPush).toHaveBeenCalledWith('/admin/systemroles/1/view');
  }};

  it('Select Button Click', async () => {
renderWithMockTenant(tenant, <TenantRolesList />);
await screen.findByRole('tenant-roles-container');
const viewButton = screen.getByRole('tenant-role-check-1');
fireEvent.click(viewButton);
  }};
}};
