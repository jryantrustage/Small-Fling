import React from 'react';
import { Tenant } from 'core/entities/tenant';
import { TenantContext as TenantContextShared } from 'commonui-shared';

/**
* Tenant Context with a shared instance between federated modules
*/
export const TenantContext: React.Context<Tenant> = TenantContextShared;
export type { Tenant };
