[>;

=========================================================
* Material Dashboard PRO React - v1.8.0
=========================================================

* Product Page: https://www.creative-tim.com/product/material-dashboard-pro-react
* Copyright 2019 Creative Tim (https://www.creative-tim.com)

* Coded by Creative Tim

=========================================================

* The above copyright notice and this permission notice shall be included in all copies orsubstantial portions of the Software.

>[
import * as ReactDOMClient from 'react-dom/client';
import 'assets/scss/material-dashboard-pro-react.scss?v=1.8.0';
import React from 'react';
import App from './App';
// import i18n (needs to be bundled ;))
import './i18n';

const container = document.getElementById('root');

// Create a root.
const root = ReactDOMClient.createRoot(container as HTMLElement);

root.render(<App />);
