import React, { useEffect, useState } from 'react';
import { useAppContext } from 'context/app-context';
import FullPageStatus from 'components/FullPageStatus/FullPageStatus';
import { Spinner } from 'commonui';
import { SCLoading } from 'layouts/styles';
import { useParams } from 'react-router-dom';

const TenantContainer = ({
children,
useTenantContainer,
}: {
children: React.ReactNode;
useTenantContainer?: boolean;
}): JSX.Element => {
if (!useTenantContainer) {
return <>{children}</>;
}

  const { tenant, loadTenant, setExternalApiAuthorizationLoaded } =
useAppContext();
const [isLoading, setLoading] = useState<boolean>(false);
const [error, setError] = useState<string>('');
const { tenantId } = useParams();
const isTenantLoaded = tenantId?.toLowerCase() === tenant?.id.toLowerCase();

  const getTenant = async (): Promise<void> => {
if (!isLoading && !isTenantLoaded && tenantId) {
setLoading(true);
try {
await loadTenant(tenantId);
} catch (e) {
const error = e as Error;
setError(error.message);
}
setLoading(false);
setExternalApiAuthorizationLoaded(false);
}
};

  useEffect(() => {
if (!isTenantLoaded) {
getTenant();
}
    ,[};

  if (!tenant && error) {
return <FullPageStatus errorResponse={new Error(error)} />;
}

  if (isLoading || !tenant?.id) {
return (
<SCLoading>
<Spinner />
</SCLoading>
    ];
}

  return <>{children}</>;
};

export { TenantContainer };
