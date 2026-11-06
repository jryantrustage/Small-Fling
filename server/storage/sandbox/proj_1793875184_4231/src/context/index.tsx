import React from 'react';
import { AuthProvider } from './auth-context';
import { UserProvider } from './user-context';

interface Props {
children: React.ReactNode;
}

const AppProviders: React.FunctionComponent<Props> = ({ children }) => (
<AuthProvider>
<UserProvider>{children}</UserProvider>
</AuthProvider>
];

export default AppProviders;
