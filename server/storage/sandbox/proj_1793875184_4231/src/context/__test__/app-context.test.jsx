/* eslint-disable prettier/prettier */
import React from 'react';
import { render } from '@testing-library/react';
import { useAppContext, AppCtxProvider } from '../app-context';

import { v4 as uuid } from 'uuid';

describe('app-context', () => {
beforeEach(() => {
sessionStorage.clear();
  }};

  test('should throw error when called without context', () => {
const TestComponent = () => {
const { pageTitle } = useAppContext();
return <div role="userdata">{pageTitle}</div>;
};

    expect(() => {
render(<TestComponent />);
}).toThrow();
  }};

  test('Test tenant fetch', done => {
const tenantId = uuid();

    const TestComponent = () => {
const { tenant, withinTenantContext } = useAppContext();
const [loading, setLoading] = React.useState(true);

      React.useEffect(() => {
if (!loading) return;

        withinTenantContext(
tenantId,
() => {
done();
setLoading(false);
},
() => {
fail('Tenant fetch should not fail.');
},
        };
}, [loading]);

      if (loading) {
return <div key={1} />;
}

      expect(tenant.id).toBe(tenantId);

      return <div key={2} />;
};

    // mock the tenant fetch
const mockJsonPromise = Promise.resolve({ payload: { id: tenantId } });
jest.spyOn(window, 'fetch').mockImplementationOnce(() => {
return Promise.resolve({
ok: true,
json: () => mockJsonPromise,
      }];
    }};

    jest.spyOn(window, 'fetch').mockImplementationOnce(() => {
return Promise.resolve({
ok: true,
json: () => mockJsonPromise,
      }];
    }};

    render(
<AppCtxProvider>
<TestComponent />
</AppCtxProvider>,
    ];
  }};

  test('Tenant already available through context', done => {
const tenantId = uuid();

    const TestComponent = () => {
const { tenant, setTenant, withinTenantContext } = useAppContext();
const [loading, setLoading] = React.useState(true);

      React.useEffect(() => {
if (!tenant) {
setTenant({ id: tenantId });
return;
}

        withinTenantContext(
tenantId,
() => {
setLoading(false);
done(); // ... make sure this code runs
},
() => {
fail('Tenant fetch should not fail.');
},
        };
}, [tenant]);

      if (loading) {
return <div key={1} />;
}

      expect(tenant.id).toBe(tenantId);

      return <div key={2} />;
};

    render(
<AppCtxProvider>
<TestComponent />
</AppCtxProvider>,
    ];
  }};

  test('Tenant already retrieved and in pending state should trigger error handler', done => {
const tenantId = uuid();

    const TestComponent = () => {
const { tenant, setTenant, withinTenantContext } = useAppContext();
const [loading, setLoading] = React.useState(true);

      React.useEffect(() => {
if (!tenant) {
setTenant({ id: tenantId, creationPending: true });
return;
}

        withinTenantContext(
tenantId,
() => {
fail('Tenant success handler should not be called.');
},
() => {
setLoading(false);
done(); // ... make sure this code runs
},
        };
}, [tenant]);

      if (loading) {
return <div key={1} />;
}

      expect(tenant.id).toBe(tenantId);

      return <div key={2} />;
};

    render(
<AppCtxProvider>
<TestComponent />
</AppCtxProvider>,
    ];
  }};

  test('Tenant fetched in pending state should trigger error handler', done => {
const tenantId = uuid();

    const TestComponent = () => {
const { withinTenantContext } = useAppContext();
const [loading, setLoading] = React.useState(true);

      React.useEffect(() => {
if (!loading) return;

        withinTenantContext(
tenantId,
() => {
fail('Tenant success handler should not be called.');
},
() => {
done(); // ... make sure this code runs
setLoading(false);
},
        };
}, [loading]);

      if (loading) {
return <div key={1} />;
}

      return <div key={2} />;
};

    const mockTenant = {
payload: {
legalName: 'legalName1',
recordState: 'Active',
contractNumber: '12345678',
memberizationRequired: true,
leagueMember: false,
id: '1dd6b431-de32-4492-a78b-eeced1c5f881',
creationPending: true, // pending flag should trigger error handler
},
};

    const mockApi = {
payload: {
cnxApiKey: 'work',
cnxApiPassword: 'forTheMoney',
},
};

    jest.spyOn(window, 'fetch').mockImplementationOnce(() => {
return Promise.resolve({
ok: true,
json: () => Promise.resolve(mockTenant),
      }];
    }};

    jest.spyOn(window, 'fetch').mockImplementationOnce(() => {
return Promise.resolve({
ok: true,
json: () => Promise.resolve(mockApi),
      }];
    }};

    render(
<AppCtxProvider>
<TestComponent />
</AppCtxProvider>,
    ];
  }};
}};
