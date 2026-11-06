import React from 'react';
import { Navigate } from 'react-router-dom';
import { Paths } from 'layouts/RouterSwitch';

const SystemRedirect = () => <Navigate replace to={Paths.SystemDocuments} />;

export default SystemRedirect;
