import React from 'react';
import ViewMode from 'context/view-mode';
import { BaseTenant, Tenant } from 'components/ManageTenant/base-tenant';
import { Merchant } from 'components/MerchantList/types';

export interface ICreateTenantProps {
viewMode: ViewMode;
newTenant: BaseTenant | Tenant;
setNewTenant: React.Dispatch<React.SetStateAction<BaseTenant | Tenant>>;
merchantList: Merchant[];
handleCreateNewTenant: (
saveData: Tenant | BaseTenant,
setStateAction1?: React.Dispatch<React.SetStateAction<string[]>>,
setStateAction2?: React.Dispatch<React.SetStateAction<boolean>>,
setStateAction3?: React.Dispatch<React.SetStateAction<boolean>>,
) => Promise<void>;
reformatTenantData: () => Tenant | BaseTenant;
discardChangesWarning: () => void;
validationErrors: string[];
setValidationErrors: React.Dispatch<React.SetStateAction<string[]>>;
duplicateEntryError: boolean;
setDuplicateEntryError: React.Dispatch<React.SetStateAction<boolean>>;
serviceRequestError: boolean;
setServiceRequestError: React.Dispatch<React.SetStateAction<boolean>>;
}
