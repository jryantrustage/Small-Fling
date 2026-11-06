import React from 'react';
import { Paths } from 'layouts/RouterSwitch';
import { useNavigate, generatePath } from 'react-router-dom';
import { tenantTypesList } from './types';
import { useDynamicModal } from 'components/DynamicModal';

const group: any = {
groupCode: 'TenantType',
groupTitle: '',
hidden: false,
required: true,
dataFields: [
{
fieldCode: 'tenantType',
fieldType: 'single-select',
fieldLabel: 'Select Tenant Type',
blockField: true,
options: [
...tenantTypesList.map(({ id, display }) => ({
label: display,
value: id,
        }]},
],
},
],
};

const useTenantTypeModal = (showModal: boolean) => {
const canContinue = (data: any) => {
return !!data?.tenantType;
};
const navigate = useNavigate();
const onContinueBtnClick = (state: any) => {
navigate(
generatePath(Paths.TenantCreate, {
tenantType: state?.data?.tenantType,
      }],
    ];
};
useDynamicModal({
title: 'Create Tenant',
showModal,
fieldGroups: [group],
canContinue,
continueBtnText: 'Create Tenant',
onContinueBtnClick,
  }};
};

export { useTenantTypeModal };
