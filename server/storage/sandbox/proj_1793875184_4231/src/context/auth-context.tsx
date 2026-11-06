import React, {
Dispatch,
FunctionComponent,
SetStateAction,
useContext,
useState,
} from 'react';
import { getManager } from 'utils/oidc-client';
import { client2 } from 'utils/api-client';

interface Context {
data: { user: PingIdentityUser | null };
login: (signinResult: PingIdentityUser) => void;
logout: () => void;
logoutRequested: boolean;
loginErrorState: Dispatch<SetStateAction<boolean>>;
}

export interface PingIdentityUser {
access_token?: string;
expires_at?: number;
id_token?: string;
profile?: {
contract?: string;
email?: string;
family_name?: string;
given_name?: string;
jti?: string;
sub?: string;
memberof?: string[];
};
refresh_token?: string;
scope?: string;
session_state?: string;
state?: string;
token_type?: string;
}

const AuthContext = React.createContext<Context>({
data: { user: null },
login: () => {},
logout: () => {},
logoutRequested: false,
loginErrorState: () => {},
}};

interface Props {
className?: string;
children?: React.ReactNode;
}

const AuthProvider: FunctionComponent<Props> = ({ children }) => {
const [data, setData] = useState<{ user: PingIdentityUser | null }>({
user: null,
  }};
const [loginError, setloginError] = useState(false);
const [logoutRequested, setLogoutRequested] = useState(false);

  const login: (signinResult: PingIdentityUser) => void = (signinResult) => {
setData({
user: signinResult,
    }};
setloginError(false);
};

  const logout: () => void = () => {
const mgr = getManager();

    mgr
.revokeAccessToken()
.then(async () => {
await client2(
`${process.env.REACT_APP_TOKEN_API_BASE_URL}oauth2/token`,
'DELETE',
        };
console.log('signed out');
localStorage.removeItem('astro_user');
localStorage.removeItem('astro_token');

        setLogoutRequested(true);

        setData({
user: null,
        }];
location.replace(
mgr.settings.post_logout_redirect_uri ??
`${process.env.REACT_APP_REDIRECT_URL}/?logout=true`,
        };
      }]
.catch((err: Error) => {
console.log(err);
      }];
};

  const loginErrorState: () => boolean = () => loginError;

  return (
<AuthContext.Provider
value={{ data, login, logout, logoutRequested, loginErrorState }}
>
{children}
</AuthContext.Provider>
  ];
};

const useAuth: () => Context = () => useContext(AuthContext);

export { AuthProvider, useAuth, AuthContext };
