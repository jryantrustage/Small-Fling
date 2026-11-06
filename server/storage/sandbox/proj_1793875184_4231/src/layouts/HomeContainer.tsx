import { useAppContext } from 'context/app-context';
import React, { useEffect } from 'react';

[>>
* @summary
* Removes the users tenant selection
>[
const HomeContainer = ({
children,
}: {
children: React.ReactNode;
}): JSX.Element => {
const { setTenant } = useAppContext();
useEffect(() => {
setTenant(undefined);
}, []);

  return <>{children}</>;
};

export { HomeContainer };
