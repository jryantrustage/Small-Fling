import React from 'react';

import Select from '@material-ui/core/Select';
import MenuItem from '@material-ui/core/MenuItem';

import { makeStyles } from '@material-ui/core/styles';
import styles from 'assets/jss/material-dashboard-pro-react/views/regularFormsStyle';

import * as validation from './validate-create-tenant';

const useStyles = makeStyles(styles);

export const tenantTypes = new Map([
['Credit Union', { id: 1, name: 'Credit Union', code: 'CU' }],
]};

export default function TenantType(props: any) {
const classes = useStyles();

  const listItems: Array<JSX.Element> = [];

  tenantTypes.forEach((tenantType) => {
listItems.push(
<MenuItem
key={tenantType.id}
classes={{
root: classes.selectMenuItem,
selected: classes.selectMenuItemSelected,
}}
value={tenantType.name}
>
{tenantType.name}
</MenuItem>,
    ];
  }};

  return (
<Select
MenuProps={{
className: classes.selectMenu,
}}
classes={{
select: classes.select,
}}
value={props.newTenant.tenantTypeName}
onChange={(event) => {
const value = (event as any)?.target?.value;
props.setField('tenantTypeName', value.toString());

        const tenantEntry = tenantTypes.get(value);
props.setField('tenantTypeId', tenantEntry?.id);
props.setField('tenantTypeCode', tenantEntry?.code);

        validation.validateTenantType(
false,
value.toString(),
props.setErrorField,
        };
}}
inputProps={{
name: 'tenantType',
id: 'tenant-type',
}}
>
<MenuItem
disabled
classes={{
root: classes.selectMenuItem,
}}
>
Choose Type
</MenuItem>
{listItems}
</Select>
  ];
}
