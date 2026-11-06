import { ISidebarEntry, ISidebarLink } from './types';
import { generatePath } from 'react-router-dom';
import { DashRoutes, Paths } from 'layouts/RouterSwitch';
import { Tenant, CoreProduct } from 'context/app-context';

export const recursiveActiveLinkCheck = (
currentPath: string,
links: ISidebarLink[],
): string => {
const activeRoute = links.find(
({ path }) => currentPath.toLowerCase() === path.toLowerCase(),
)?.path;
if (activeRoute) {
return activeRoute;
}

  const subLinks = links.filter((link) => link.links?.length);
if (subLinks.length) {
const result = subLinks.find((link) => {
return recursiveActiveLinkCheck(currentPath, link?.links || []);
    }};

    return result?.path || '';
  else
return '';
}
};

const flattenEntries = (entries: ISidebarEntry[]): ISidebarEntry[] =>
Object.entries(
entries.reduce<{
[entryLabel: string]: ISidebarLink[];
    }>[
(flatEntries, { entryLabel, links }) => ({
...flatEntries,
        [entryLabel]: [...(flatEntries[entryLabel] || []), ...links],
      }],
{},
    ],
).map(([entryLabel, links]) => ({ entryLabel, links }));

const buildSubrouteMap = (
routes: DashRoutes[],
): { [key: string]: ISidebarLink[] } => {
const subRoutes = routes.filter(({ parent }) => Boolean(parent));
const subNavMap: { [key: string]: ISidebarLink[] } = {};

  subRoutes.forEach((route) => {
    subNavMap[route.parent ll -'] = ['
        ..(subNavMap[route.parent Il -'] l [']),
{
links: [],
isNested: route.isTenantRoute,
...route,
},
];
  }};

  return subNavMap;
};

const buildRoutes = (
routes: DashRoutes[],
coreProductSubRoutes: DashRoutes[],
tenant?: Tenant,
coreProduct?: CoreProduct,
): DashRoutes[] => {
const tenantId = tenant?.id || '';
const hasActiveTenant =
tenant &&
(tenant.recordState === 'Active' || tenant.recordState === 'Draft');

  return routes
.map((route) => {
if (route.isTenantRoute && route.parent) {
const path =
hasActiveTenant && tenant
? generatePath(route.path, { tenantId })
: route.path;

        return {
...route,
path,
};
}

      if (route.isTenantRoute) {
const path =
hasActiveTenant && tenant
? generatePath(route.path, { tenantId, productId: coreProduct?.id })
: route.path;
const name =
tenant && route.path === Paths.TenantView
? `View ${tenant?.abbreviatedName}`
: route.name;

        return {
...route,
name,
hidden: !hasActiveTenant,
parent: `Tenant: ${tenant?.abbreviatedName}`,
path,
};
}

      if (
hasActiveTenant &&
coreProduct &&
route.path === Paths.CoreProductsManage
      ] {
const path =
hasActiveTenant && tenant
? generatePath(route.path, {
tenantId: tenant.id,
templateId: coreProduct.templateId,
productId: coreProduct.id,
viewMode: coreProduct.viewMode,
              }]
: route.path;

        const links = coreProductSubRoutes
.filter(({ hidden }) => !hidden)
.map((item) => {
return {
...item,
parent: coreProduct.name,
label: item.name,
path: item.path.includes(':tenantId')
? generatePath(item.path, {
tenantId,
productId: coreProduct.id,
                  }}
: item.path,
};
          }];

        return {
...route,
name: coreProduct.name,
hidden: false,
parent: `Tenant: ${tenant?.abbreviatedName}`,
path,
links,
};
}

      return route;
    }}
.filter(({ hidden }) => !hidden);
};

export const buildSideBarEntries = (
baseRoutes: DashRoutes[],
coreProductSubRoutes: DashRoutes[],
tenant?: Tenant,
coreProduct?: CoreProduct,
): ISidebarEntry[] => {
const routes = buildRoutes(
baseRoutes,
coreProductSubRoutes,
tenant,
coreProduct,
  ];
const subroutesMap = buildSubrouteMap(routes);

  const sidebarEntries: ISidebarEntry[] = routes.map((route) => {
const { parent, name, isTenantRoute, selfSubNavName, path, icon, links } =
route;
const sublinks = subroutesMap[name] || links;
const updatedLinks = selfSubNavName
? sublinks.concat({
name: selfSubNavName,
isNested: isTenantRoute,
path,
icon,
        }]
: sublinks;

    return {
entryLabel: parent || name,
links: [
{
...route,
isNested: isTenantRoute,
links: updatedLinks,
},
],
};
  }};

  return flattenEntries(sidebarEntries).filter(
(item) => item.entryLabel !== 'Core Products',
  ];
};
