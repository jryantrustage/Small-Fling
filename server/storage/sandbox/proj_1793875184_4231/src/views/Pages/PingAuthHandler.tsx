import { useAuth } from 'context/auth-context';
import { useUser } from 'context/user-context';
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getManager } from '../../utils/oidc-client';

export const PingAuthHandler = (): JSX.Element => {
const { login, logout } = useAuth();
const userState = useUser();
const push = useNavigate();

  useEffect(() => {
if (!userState) {
const mgr = getManager();
mgr
.signinCallback()
.then((result) => {
const memberOfGroups = result?.profile?.memberof?.toString() || '';

          const allowedGroups =
process.env.REACT_APP_MEMBER_GROUPS?.split(',') || [];
if (allowedGroups.length == 0) {
console.log(
'AstroUI must have configured REACT_APP_MEMBER_GROUPS setting',
            };
return;
}

          const isMember = allowedGroups.some((group) =>
memberOfGroups.toString().includes(group),
          };

          if (!isMember) {
console.log('user not a member of allowed AstroUI groups');
logout();
return;
}

          localStorage.setItem('astro_user', JSON.stringify(result));
if (result.access_token) {
localStorage.setItem('astro_token', result.access_token);
}
login(result);
console.log('push admin home');
push('/admin/home');
        }]
.catch((err) => {
console.log('error with authentication');
console.log(err);
        }];
}
}, []);

  return <div></div>;
};
