/* eslint react/display-name:0 */
import { render, RenderResult } from '@testing-library/react';
import { InjectModalContainer, ModalProvider } from 'commonui';
import { AppContext } from 'context/app-context';
import { UserContext } from 'context/user-context';
import React from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
const mockContext = {
setTenant: () => {},
setTenantApiData: () => {},
withinTenantContext: (tenantId: string, successFunc: () => void) => {
successFunc();
},
loadTenant: () => Promise.resolve(),
coreProduct: {},
setCoreProduct: () => {},
hasDecisioningInCoreProduct: false,
setHasDecisioningInCoreProduct: () => {},
setPageTitle: () => {},
setDisplayCreateButton: () => {},
pageTitle: '',
displayCreateButton: false,
createButtonClicked: false,
setCreateButtonClicked: () => {},
setDisplayLoadButton: () => {},
displayLoadButton: false,
};

const renderWithMockContext = (component: React.ReactElement): RenderResult =>
render(component, { wrapper: MockContextWrapper as any });

const MockContextWrapper = ({
children,
}: {
children: React.ReactNode;
}): JSX.Element => wrapWithMockContext(children);

[>>
* @deprecated
* Use MockContextWrapper instead
* render(ComponentInTest, {wrapper: MockContextWrapper})
>[
const wrapWithMockContext = (component: React.ReactNode): JSX.Element => {
const Root = () => (
<ModalProvider>
<AppContext.Provider value={mockContext as any}>
<UserContext.Provider value={{ user: { x: '' } } as any}>
<InjectModalContainer />
{component}
</UserContext.Provider>
</AppContext.Provider>
</ModalProvider>
  ];

  const router = createBrowserRouter([{ path: '*', element: <Root /> }]);

  return <RouterProvider router={router} />;
};

const renderWithMockTenant = (mockTenant: any, component: any): RenderResult =>
render(component, { wrapper: wrapWithMockTenant(mockTenant) as any });

const wrapWithMockTenant =
(mockTenant: Record<string, any>) =>
({ children }: { children: React.ReactElement }): JSX.Element => {
const tenantContext = {
...mockContext,
tenant: mockTenant,
loadTenant: () => Promise.resolve(mockTenant),
};

    const Root = () => (
<AppContext.Provider value={tenantContext as any}>
<UserContext.Provider value={{ user: { x: '' } } as any}>
{children}
</UserContext.Provider>
</AppContext.Provider>
    ];

    const router = createBrowserRouter([{ path: '*', element: <Root /> }]);

    return <RouterProvider router={router} />;
};

const renderWithContext = (
context: any = mockContext,
component: any,
): RenderResult =>
render(component, { wrapper: wrapWithContext(context) as any });

const wrapWithContext =
(context: any = {}) =>
({ children }: { children: React.ReactElement }): JSX.Element => {
return (
<AppContext.Provider value={{ ...mockContext, ...context }}>
<UserContext.Provider value={{ user: { x: '' } } as any}>
{children}
</UserContext.Provider>
</AppContext.Provider>
    ];
};

export {
MockContextWrapper,
renderWithMockContext,
renderWithMockTenant,
wrapWithMockContext,
wrapWithMockTenant,
renderWithContext,
};
