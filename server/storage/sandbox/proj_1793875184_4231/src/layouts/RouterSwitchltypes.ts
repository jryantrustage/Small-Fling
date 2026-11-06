import { ISidebarLink } from 'components/Sidebar/types';
import React from 'react';

[>>
* @param isTenantRoute When a tenant is selected, this route will be visible in the sidebar
* @param isHomeRoute When a home route is hit, the tenant will be removed from the context
>[
export interface DashRoutes {
path: string;
name: string;
icon?: string;
component: React.ComponentType<any>;
hidden: boolean;
isHomeRoute?: boolean;
isTenantRoute?: boolean;
useTenantContainer?: boolean;
parent?: string;
selfSubNavName?: string;
links?: ISidebarLink[];
props?: Record<string, any>;
}
