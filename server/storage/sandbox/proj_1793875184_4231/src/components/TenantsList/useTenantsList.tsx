import { useContext, useEffect } from 'react';
import { NotificationContext, Core, NotificationDisplay } from 'commonui';
import { client2 } from 'utils/api-client';
import { useAppContext } from 'context/app-context';
import { UseTenantsListPayload } from './types';

const useTenantsList = (): UseTenantsListPayload => {
const { addNotification, clearAllNotifications } =
useContext(NotificationContext);
const { setPageTitle, setDisplayCreateButton } = useAppContext();

  const setNote = (message: string): void => {
addNotification({
message,
type: Core.NotificationType.SUCCESS,
display: NotificationDisplay.GLOBAL,
dismissable: true,
    }};
setTimeout(clearAllNotifications, 3000);
};

  const rePublishTenantCreationEvent = (id: string): void => {
client2(
`${process.env.REACT_APP_TENANT_API_BASE_URL}tenants/${id}/republish`,
'POST',
    ]
.then(() => {
setNote(`Tenant creation republished!`);
      }]
.catch((error) => {
console.log(error);
      }];
};

  const rePublishAllTenants = (tenantList: string[]) => {
Promise.all(
tenantList.map(async (id) => {
await client2(
`${process.env.REACT_APP_TENANT_API_BASE_URL}tenants/${id}/republish`,
'POST',
        };
      }],
    ]
.then(() => {
setNote(`All Tenant creations have been republished!`);
      }]
.catch((error) => {
console.log(error);
      }];
};

  useEffect(() => {
setPageTitle('Tenants');
// configure the create button action
setDisplayCreateButton(true);
}, []);

  return {
rePublishTenantCreationEvent,
rePublishAllTenants,
};
};

export { useTenantsList };
