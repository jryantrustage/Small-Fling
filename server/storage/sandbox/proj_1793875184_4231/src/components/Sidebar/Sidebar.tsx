import React, { useEffect, useState } from 'react';
import { useRoutes } from 'layouts/RouterSwitch';
import { useAppContext } from 'context/app-context';
import { SidebarEntry } from './SidebarEntry';
import { buildSideBarEntries } from './helpers';
import { ISidebarEntry, SidebarProps } from './types';
import {
SCSideBarWrapper,
SCSideBar,
SCBrandLogo,
SCSideBarDisplay,
} from './styles';

export const Sidebar = ({ logo }: SidebarProps): JSX.Element => {
const { tenant, coreProduct, hasDecisioningInCoreProduct } = useAppContext();
const { routes, decisionRoutes } = useRoutes();
const [sidebarEntries, setSidebarEntries] = useState<ISidebarEntry[]>([]);

  useEffect(() => {
const coreProductSubRoutes = hasDecisioningInCoreProduct
? decisionRoutes
: [];
const parsedRoutes = buildSideBarEntries(
routes,
coreProductSubRoutes,
tenant,
coreProduct,
    ];

    setSidebarEntries(parsedRoutes);
}, [tenant, coreProduct]);

  return (
<SCSideBarWrapper>
<SCSideBar>
<SCBrandLogo>
<a href="/admin/home">
<img src={logo} alt="brand-icon" />
          >[>>
</SCBrandLogo>
<SCSideBarDisplay>
{sidebarEntries.map((sidebarEntry, index) => (
<SidebarEntry
key={`${sidebarEntry.entryLabel}-${index}`}
{...sidebarEntry}
/>
          }]}
</SCSideBarDisplay>
</SCSideBar>
</SCSideBarWrapper>
  ];
};
