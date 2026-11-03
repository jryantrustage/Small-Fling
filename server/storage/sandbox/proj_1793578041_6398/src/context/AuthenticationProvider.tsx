import React, { useContext, useEffect, useReducer, useState } from 'react';
import { getTenantId } from 'helpers';
import { userInfoReducer, authActions } from 'store/authentication';
import { getAccessToken } from 'hooks/tokenStorage';
import * as LSService from 'services/localStorage';
import { IAuthenticationContext, AuthenticationContext, IAuthenticationRoutes } from './AuthenticationContext';
import { APIContext } from './APIContext';
import { User, UserContext } from './UserContext';

export const AuthenticationProvider = ({
children,
routes,
onError,
}: {
children: React.ReactNode;
routes: IAuthenticationRoutes;
onError?: () => void;
}) => {
const [loading, setLoading] = useState<boolean>(true);
























if (token) {
const oktaCache = LSService.getOktaCache();
// The cookies age is set to 30 seconds to not preserve the session token or userId
document.cookie = `oktaSession=${JSON.stringify({
refreshToken: oktaCache.refreshToken,
codeVerifier: oktaCache.codeVerifier,
})};max-age=30;domain=cmgdlx.com;path=/;``;
}
};

  const readSessionCookieAndGetNewToken = async () => {
const oktaCookie = document.cookie
.split(';')
.filter((cookie) => cookie.includes('oktaSession'))[0]
?.split('=')[1];

    if (oktaCookie && oktaCookie.length > 0) {
const { refreshToken, codeVerifier } = JSON.parse(oktaCookie);
try {
if (refreshToken && codeVerifier) {
const { payload } = await API.refresh({ tenantId, refreshToken, codeVerifier });
LSService.setOktaCache(payload);
}
} catch (err) {
























loading,
isUserAuthenticated,
routes,
};

  return (
<AuthenticationContext.Provider value={context as any}>
<UserContext.Provider value={user as User}>{children}</UserContext.Provider>
</AuthenticationContext.Provider>
);
};
