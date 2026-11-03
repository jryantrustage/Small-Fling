/* eslint-disable */
import { FC, createContext, useContext } from 'react'; // 18.2.0;
import React from 'react';
import { UNSAFE_LocationContext, UNSAFE_NavigationContext, UNSAFE_RouteContext } from 'react-router-dom'; // 6.15.0

























children: any;
}>
>(() => {
throw new Error('scopedRouterParentContext not initialized');
});

export const ScopedRouterProvider = ({ children }: { children: React.ReactElement }): React.ReactElement => {
const routeContext = useContext(UNSAFE_RouteContext);
const navigationContext = useContext(UNSAFE_NavigationContext);
const locationContext = useContext(UNSAFE_LocationContext);

  const SwitchToRouterParentContext: FC<{
children: React.ReactElement;
}> = ({ children }) => (
<RenderInRouterContext
routeContext={routeContext}
navigationContext={navigationContext}
locationContext={locationContext}
children={children}
/>
);
return (
<scopedRouterParentContext.Provider value={SwitchToRouterParentContext}>
<RenderInRouterContext
























