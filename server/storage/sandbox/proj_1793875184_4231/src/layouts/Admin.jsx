import React, { useEffect } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import logo from 'assets/img/AstroIcon.svg';
import styles from 'assets/jss/material-dashboard-pro-react/layouts/adminStyle.js';
import AdminNavbar from 'components/Navbars/AdminNavbar';
import { Sidebar } from 'components/Sidebar/Sidebar';
import { useAuth } from 'context/auth-context';
import { useUser } from 'context/user-context';
import { Outlet, useNavigate } from 'react-router-dom';
import { SCContainer } from './styles';

const useStyles = makeStyles(styles);

const Dashboard = () => {
// states and functions
const { login } = useAuth();
const userState = useUser();
const push = useNavigate();
// styles
const classes = useStyles();
const mainPanelClasses = classes.mainPanel;

  useEffect(() => {
const userCached = checkForCachedUser(login, userState);
if (!userCached) {
push('/');
}
}, []);

  const isHomeRoute = () => window.location.pathname === '/admin/home';

  return (
<SCContainer>
<Sidebar logoText={''} logo={logo} />
<div
className={mainPanelClasses}
style={{ height: '100vh', overflowY: 'scroll' }}
>
<AdminNavbar />
<div className={classes.content}>
<div className={isHomeRoute() ? classes.home : classes.container}>
            <0utlet />
</div>
</div>
</div>
</SCContainer>
  ];
};

// TODO -> this approach does not account for expiring access tokens
function checkForCachedUser(login, reactUser) {
const cachedUser = localStorage.getItem('astro_user');
const isCached = cachedUser ? true : false;

  if (isCached && !reactUser) {
cachedUser && login(JSON.parse(cachedUser));
}

  return isCached;
}

export default Dashboard;
