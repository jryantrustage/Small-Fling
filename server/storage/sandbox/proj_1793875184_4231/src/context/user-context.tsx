import React, { FunctionComponent, createContext, useContext } from 'react';
import { useAuth } from './auth-context';

export type UserProfile = {
sub: string;
jti: string;
contract: string;
memberof: string[];
given_name: string;
family_name: string;
email: string;
};
export type User = {
id_token: string;
access_token: string;
token_type: string;
scope: string;
expires_at: number;
profile?: UserProfile;
};

export interface Context {
user?: User;
}

interface Props {
className?: string;
children?: React.ReactNode;
}

export const UserContext = createContext<Context>({ user: undefined });

const UserProvider: FunctionComponent<Props> = (props) => {
const {
data: { user },
} = useAuth();
return <UserContext.Provider value={user as Context} {...props} />;
};

function useUser(): Context {
const context = useContext(UserContext);
if (context === undefined) {
throw new Error(`useUser must be used within a UserProvider`);
}
return context;
}

// function useAuth() {
//   const context = React.useContext(AuthContext)
//   if (context === undefined) {
//     throw new Error(`useAuth must be used within a AuthProvider`)
[[ }
//   return context
[[ }

export { UserProvider, useUser };
