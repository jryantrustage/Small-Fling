import FullPageStatus from 'components/FullPageStatus/FullPageStatus';
import GridItem from 'components/Grid/GridItem';
import GridContainer from 'components/Grid/GridContainer';
import { client2 } from 'utils/api-client';
import SnackbarContent from 'components/Snackbar/SnackbarContent';
import { useAppContext } from 'context/app-context';
import React, { useEffect, useState } from 'react';
import ViewApiClient from './ViewTenantTypes/ViewApiClient';
import ViewCreditUnionTenant from './ViewTenantTypes/ViewCreditUnionTenant';
import { Tenant } from 'components/ManageTenant/base-tenant';
import { TenantTypeCodes } from '../../types';
import { getAuthorizationAPIRequest } from 'API';
import { useParams } from 'react-router-dom';

export default function ViewTenant(): JSX.Element {
const tenantId = useParams().tenantId;

  const {
tenant: originalTenant,
setPageTitle,
setDisplayCreateButton,
loadTenant,
hasExternalApiAuthorizationLoaded,
setExternalApiAuthorizationLoaded,
isAuthorizedToSubmitToLOS,
setIsAuthorizedToSubmitToLOS,
} = useAppContext();

  const tenant = originalTenant as Tenant;
const [isFicusApiClient, setIsFicusApiClient] = useState(false);
const [merchantName, setMerchantName] = useState('');
const [checkForUpdate, setCheckForUpdate] = useState<boolean | null>(false);
const [errorResponse, setErrorResponse] = useState(null);
const loadExitApiAuth = async () => {
const result = await getAuthorizationAPIRequest(tenant.contractNumber);
tenant.isAuthorizeToSubmitToLOS = result;
setIsAuthorizedToSubmitToLOS(result);
setExternalApiAuthorizationLoaded(true);
};

  useEffect(() => {
const titleList = new Map();
titleList.set(tenant.legalName, `/admin/tenant/${tenantId}/view`);
setPageTitle(titleList);
setDisplayCreateButton(false); // remove navbar create button
}, []);

  // Call the service and get the tenant.
useEffect(() => {
let timeoutId: number;
if (tenant.creationPending) {
timeoutId = window.setTimeout(() => setCheckForUpdate(true), 10000);
}

    return () => {
if (timeoutId) {
clearTimeout(timeoutId);
}
};
}, [tenant.creationPending]);

  // effect hook to see if tenant pending status has changed
useEffect(() => {
if (!checkForUpdate) return;
if (!tenantId) return;
let timeoutId: number;

    loadTenant(tenantId)
.then((tenant) => {
if (tenant && tenant.creationPending) {
setCheckForUpdate(null);
timeoutId = window.setTimeout(() => setCheckForUpdate(true), 10000);
}
      }]
.catch((error) => {
setCheckForUpdate(null);
setErrorResponse(error);
timeoutId = window.setTimeout(() => setCheckForUpdate(true), 10000);
      }];

    return () => {
if (timeoutId) {
clearTimeout(timeoutId);
}
};
}, [checkForUpdate]);

  useEffect(() => {
if (tenant.tenantTypeCode === TenantTypeCodes.APIClient) {
setIsFicusApiClient(true);
}
if (tenant.defaultMerchantId) {
client2(
`${process.env.REACT_APP_MERCHANT_API_BASE_URL}/merchants/${tenant.defaultMerchantId}`,
).then((data) => {
setMerchantName(data.payload.legalName || 'None');
      }];
    else
setMerchantName('None');
}
}, [tenant]);

  if (!hasExternalApiAuthorizationLoaded) {
loadExitApiAuth();
} else {
tenant.isAuthorizeToSubmitToLOS = isAuthorizedToSubmitToLOS;
}

  if (errorResponse && !tenant) {
return <FullPageStatus errorResponse={errorResponse} />;
}

  return (
<div>
{tenant.creationPending && (
<GridContainer>
<GridItem xs={12} sm={12} md={12}>
<SnackbarContent
message="This tenant is still in the process of being created, and cannot be edited."
close={false}
color="warning"
closeNotification={() => {}}
/>
</GridItem>
</GridContainer>
      ]}
{!isFicusApiClient && (
<ViewCreditUnionTenant merchantName={merchantName} />
      ]}
{isFicusApiClient && <ViewApiClient />}
</div>
  ];
}
