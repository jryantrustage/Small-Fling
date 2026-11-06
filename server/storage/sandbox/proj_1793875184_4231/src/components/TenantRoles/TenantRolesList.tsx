import React, { useState, ReactElement } from 'react';
import FullPageStatus from 'components/FullPageStatus/FullPageStatus';
import { Table, Icon, ICON_TYPES, Checkbox } from 'commonui';
import { SCActions, SCActionButtonLink } from '../TableStyles';
import GridContainer from 'components/Grid/GridContainer';
import GridItem from 'components/Grid/GridItem';
import Card from 'components/Card/Card';
import CardHeader from 'components/Card/CardHeader';
import CardText from 'components/Card/CardText';
import CardBody from 'components/Card/CardBody';
import { makeStyles } from '@material-ui/core';
import SweetAlert from 'react-bootstrap-sweetalert';
import sweetAlertStyle from 'assets/jss/material-dashboard-pro-react/views/sweetAlertStyle';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogTitle from '@material-ui/core/DialogTitle';
import Warning from '@material-ui/icons/Warning';
import { TenantRoles } from './types';
import { SCButton, SCActionsContainer, SCCancelButton } from './styles';
import { useTenantRolesList } from './useTenantRolesList';
import { Paths } from 'layouts/RouterSwitch';
import { useNavigate } from 'react-router-dom';

interface FormattedData extends Record<string, any> {
id: string;
}
const useSweetAlertStyles = makeStyles(sweetAlertStyle);
export const TenantRolesList = (): ReactElement => {
const {
loading,
errorResponse,
tenantRoles,
postApicall,
tenantId,
setTenantRoles,
} = useTenantRolesList();

  const [openConfirmationDialog, setOpenConfirmationDialog] = useState(false);
const [alert, setAlert] = useState(false);
const push = useNavigate();
const sweetAlertClasses = useSweetAlertStyles();

  const enableTenantRole = (id: string, value: boolean): void => {
const role = tenantRoles.find((t) => t.id === id);
if (role) {
role.enabled = value;
}
setTenantRoles([...tenantRoles]);
};
const formatdata = (tenantRoleEntries: TenantRoles[]): FormattedData[] =>
tenantRoleEntries.map(({ id, enabled, name }) => ({
id,
select: (
<Checkbox
id={'tenant-role-check-' + id}
role={'tenant-role-check-' + id}
checked={!!enabled}
onChange={(event) => {
enableTenantRole(id, event.target.checked);
}}
name={name}
        [>
      ],
name,
actions: (
<SCActions id={id}>
<SCActionButtonLink
title="View Roles"
id={`${id}_view`}
aria-label="view"
color="blue"
to={`/admin/systemroles/${id}/view`}
>
<Icon size={20} name={ICON_TYPES.CIRCLE_RIGHT_ARROW} />
</SCActionButtonLink>
</SCActions>
      ],
    }}];

  const saveClicked = (): void => {
postApicall(tenantId);
};

  const discardChangesWarning = (): void => {
setAlert(true);
};

  const discardChanges = (): any => {
setAlert(false);
push(Paths.Tenant);
};

  if (loading || errorResponse) {
return <FullPageStatus errorResponse={errorResponse} />;
}

  return (
    >>
{alert && (
<SweetAlert
// warning
style={{ display: 'block', marginTop: '-100px' }}
title=""
onConfirm={() => discardChanges()}
onCancel={() => setAlert(false)}
confirmBtnCssClass={
sweetAlertClasses.button + ' ' + sweetAlertClasses.success
}
cancelBtnCssClass={
sweetAlertClasses.button + ' ' + sweetAlertClasses.danger
}
confirmBtnText="Yes, Discard!"
cancelBtnText="Cancel"
showCancel
>
<h3>Your changes will be lost!</h3>
</SweetAlert>
      ]}
<GridContainer role="tenant-roles-container">
<GridItem xs={12}>
<Card>
<CardHeader color="cuna1" text>
<CardText color="cuna1">
<h4>Associate User Roles</h4>
</CardText>
</CardHeader>
<CardBody>
<Table
data={formatdata(
tenantRoles.sort((a, b) => a.name.localeCompare(b.name)),
                }}
filterable={true}
sortable={true}
minRows={0}
pageSize={25}
columns={[
{
Header: 'Associated',
accessor: 'select',
maxWidth: '150px',
sortable: false,
filterable: false,
},
{
Header: 'Role Name',
accessor: 'name',
sortable: true,
filterable: true,
},
{
Header: 'Actions',
accessor: 'actions',
maxWidth: '100px',
sortable: false,
filterable: false,
},
]}
className="-highlight"
showPaginationTop={false}
showPaginationBottom={true}
/>
</CardBody>
</Card>
</GridItem>
<Dialog
id="form-confirmation-dialog"
role="form-confirmation-dialog"
onClose={() => {
setOpenConfirmationDialog(false);
}}
open={openConfirmationDialog}
>
<DialogTitle
id="form-confirmation-title"
style={{
marginBottom: '0px',
paddingBottom: '0px',
}}
>
<Warning
style={{
display: 'inline-block',
marginRight: '10px',
height: '1em',
width: '1em',
top: '.125em',
position: 'relative',
}}
/>
<p
style={{
display: 'inline-block',
fontSize: '20px',
}}
>
<b>Note:</b>
</p>
</DialogTitle>
<DialogContent>
<DialogContentText>
Your changes will be effective immediately. Are you sure you want
to continue?
</DialogContentText>
<DialogActions>
<SCActionsContainer>
<SCCancelButton
isSecondary
id="confirmationDialogNo"
onClick={() => {
setOpenConfirmationDialog(false);
}}
>
No
</SCCancelButton>
<SCButton
id="confirmationDialogYes"
onClick={() => {
saveClicked();
setOpenConfirmationDialog(false);
}}
>
Yes
</SCButton>
</SCActionsContainer>
</DialogActions>
</DialogContent>
</Dialog>
</GridContainer>
<GridContainer style={{ textAlign: 'right', justifyContent: 'end' }}>
<GridItem xs={12}>
<SCActionsContainer>
<SCCancelButton
isSecondary
id="role-discard-changes"
onClick={discardChangesWarning}
>
Discard Changes
</SCCancelButton>
<SCButton
id="roles-save"
onClick={() => {
setOpenConfirmationDialog(true);
}}
>
Save
</SCButton>
</SCActionsContainer>
</GridItem>
</GridContainer>
</>
  ];
};
