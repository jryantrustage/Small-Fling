import { Dispatch, SetStateAction } from 'react';

export interface TenantRoles {
id: string;
enabled: boolean;
name: string;
}
export interface UseTenantRolesListPayload {
loading: boolean;
errorResponse: Error | null;
tenantRoles: TenantRoles[];
getApiCall: (tenantId: string) => void;
postApicall: (tenantId: string) => void;
tenantId: string;
setTenantRoles: Dispatch<SetStateAction<TenantRoles[]>>;
}
