import React, { useState } from 'react';

// core components
import { useAuth } from 'context/auth-context';
import { CoreButton } from 'commonui';

const HeaderLinks = () => {
const { logout, data } = useAuth();
const { user } = data;

  return (
<div>
<div>{`Hi ${user?.profile?.given_name} ${user?.profile?.family_name}`}</div>
<CoreButton size="small" onClick={() => logout()}>
logout
</CoreButton>
</div>
  ];
};

export default HeaderLinks;
