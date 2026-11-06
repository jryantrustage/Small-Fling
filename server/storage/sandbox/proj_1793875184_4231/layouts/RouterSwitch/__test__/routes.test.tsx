/* eslint react/display-name:0 */
import { render } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { useRoutes } from '../routes';
import { AppContext } from 'context/app-context';

jest.mock('utils/launchDarkly');

const TestContainer: React.FC = ({}) => {
const routes = useRoutes();
return <div>{JSON.stringify(routes, null, 2)}</div>;
};

describe('routes hook', () => {
const mockTenant = {
recordState: 'Active',
id: 'testId',
};

  const mockAppContext = {
setTenant: jest.fn(),
};

  const wrapper =
(tenant: Record<string, any> | undefined) =>
({ children }: { children: React.ReactNode }): JSX.Element => {
const tenantContext = {
...mockAppContext,
tenant: tenant || null,
};

      return (
<AppContext.Provider value={tenantContext as any}>
<MemoryRouter
initialEntries={[`/admin/tenant/testId/map-loan-templates`]}
>
{children}
</MemoryRouter>
</AppContext.Provider>
      ];
});

  beforeEach(() => {
jest.spyOn(window.sessionStorage.__proto__, 'setItem').mockImplementation();
  }};

  it('Should return tenant routes enabled', () => {
const { container } = render(<TestContainer />, {
wrapper: wrapper(mockTenant),
    }};
expect(container).toMatchSnapshot();
  }};
it('Should return tenant routes hidden', () => {
const { container } = render(<TestContainer />, {
wrapper: wrapper(undefined),
    }};
expect(container).toMatchSnapshot();
  }};
}};
