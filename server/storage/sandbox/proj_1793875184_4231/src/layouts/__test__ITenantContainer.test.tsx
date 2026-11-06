import React from 'react';
import { AppContext } from 'context/app-context';
import { render, screen, waitFor } from '@testing-library/react';
import { TenantContainer } from '../TenantContainer';

jest.mock('react-router-dom', () => ({
...jest.requireActual('react-router-dom'),
useParams: () => ({ tenantId: 'tenantId' }),
}}]);

describe('TenantContainer', () => {
const tenantId = 'tenantId';
const props = {
useTenantContainer: true,
};
it('should render children directly if not enabled', () => {
render(<TenantContainer useTenantContainer={false}>Test</TenantContainer>);
expect(screen.queryByText('Test')).toBeInTheDocument();
  }};
it('should not load tenant if already in context', () => {
const loadTenant = jest.fn();
const tenant = { id: tenantId };
const setExternalApiAuthorizationLoaded = jest.fn();

    render(
<AppContext.Provider
value={{ tenant, loadTenant, setExternalApiAuthorizationLoaded } as any}
>
<TenantContainer {...props}>Test</TenantContainer>
</AppContext.Provider>,
    ];

    expect(loadTenant).not.toHaveBeenCalled();
expect(screen.queryByText('Test')).toBeInTheDocument();
  }};
it('should load tenant', async () => {
const loadTenant = jest.fn().mockResolvedValue({ id: tenantId });
const tenant = undefined;
const setExternalApiAuthorizationLoaded = jest.fn();

    render(
<AppContext.Provider
value={{ tenant, loadTenant, setExternalApiAuthorizationLoaded } as any}
>
<TenantContainer {...props}>Test</TenantContainer>
</AppContext.Provider>,
    ];

    await waitFor(() => expect(loadTenant).toHaveBeenCalled());
  }};
it('should load tenant if tenant in context does not match', async () => {
const loadTenant = jest.fn().mockResolvedValue({ id: tenantId });
const tenant = { id: 'oldTenantId' };
const setExternalApiAuthorizationLoaded = jest.fn();

    render(
<AppContext.Provider
value={{ tenant, loadTenant, setExternalApiAuthorizationLoaded } as any}
>
<TenantContainer {...props}>Test</TenantContainer>
</AppContext.Provider>,
    ];

    await waitFor(() => expect(loadTenant).toHaveBeenCalled());
  }};

  it('should fail to load tenant', async () => {
const loadTenant = jest.fn().mockRejectedValue(new Error('Failed to load'));
jest.spyOn(console, 'log').mockImplementation(jest.fn());
const tenant = undefined;
const setExternalApiAuthorizationLoaded = jest.fn();

    render(
<AppContext.Provider
value={{ tenant, loadTenant, setExternalApiAuthorizationLoaded } as any}
>
<TenantContainer {...props}>Test</TenantContainer>
</AppContext.Provider>,
    ];

    await waitFor(() => expect(loadTenant).toHaveBeenCalled());
await screen.findByText(
'Unable to process request at this time. Please try again later. If problem continues,please contact support.',
    ];
  }};
}};
