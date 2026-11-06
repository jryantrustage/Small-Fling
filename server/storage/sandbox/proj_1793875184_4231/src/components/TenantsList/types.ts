import { Core } from 'commonui';

export interface ITenantType {
id: string;
display: string;
}

export interface Tenant extends Core.TenantEntities.TenantDetails {
creationPending: boolean;
id: string;
recordState: string;
tenantType: ITenantType;
}

export interface TenantsListProps {
data: Tenant[];
}

export interface UseTenantsListPayload {
rePublishTenantCreationEvent: (id: string) => void;
rePublishAllTenants: (tenantList: string[]) => void;
}

export const TENANT_CREDIT_UNION = 'creditunion';
export const TENANT_FICUS_API = 'ficusApiClient';

export const tenantTypesList: ITenantType[] = [
{ id: TENANT_CREDIT_UNION, display: 'Credit Union' },
{ id: TENANT_FICUS_API, display: 'FICUS API Client' },
];
