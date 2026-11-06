import React, { useEffect } from 'react';
import styled from 'styled-components';
import FullPageStatus from 'components/FullPageStatus/FullPageStatus';
import { AppCtxProvider } from 'context/app-context';
import { useAuth } from 'context/auth-context';

import {
ThemeWrapper,
NotificationProvider,
InjectModalContainer,
ModalProvider,
APIContext,
} from 'commonui';
import { RouterSwitch } from 'layouts/RouterSwitch';
import { useUser } from './context/user-context';
import 'assets/scss/material-dashboard-pro-react.scss?v=1.8.0';
import { withLDProvider } from 'launchdarkly-react-client-sdk';
import AppProviders from './context';
import { getTenantProductsByCategory } from './API';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';

const themeOverrides = {
G1: '#05A493',
};

[>>
* Reset fonts to match material ui
* CommonUI ThemeWrapper will override with GTAmerica
>[
const FontReset = styled.div``
font-family: 'Roboto', 'Helvetica', 'Arial', sans-serif;
`;

const App = (): JSX.Element => {
const { login } = useAuth();
const userState = useUser();

  useEffect(() => {
const cachedUser = localStorage.getItem('astro_user');
const isCached = cachedUser ? true : false;

    if (isCached && !userState) {
cachedUser && login(JSON.parse(cachedUser));
}
}, []);

  const Root = () => (
<React.Suspense fallback={<FullPageStatus />}>
<APIContext.Provider value={{ getTenantProductsByCategory } as any}>
<AppProviders>
<AppCtxProvider>
<NotificationProvider>
<ThemeWrapper
themeOverrides={themeOverrides}
themeLoading={false}
>
<FontReset>



















//define a constant anonymous user to prevent wasting launchdarkly MAUs
user: {
key: 'ASTROUI',
},
})(App);

export default AppLDP;
