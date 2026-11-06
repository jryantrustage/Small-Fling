import React from 'react';
import Dialog from '@material-ui/core/Dialog';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogTitle from '@material-ui/core/DialogTitle';
// @material-ui/core components
import { makeStyles } from '@material-ui/core/styles';
// @material-ui/icons
import Warning from '@material-ui/icons/Warning';
import styles from 'assets/jss/material-dashboard-pro-react/views/regularFormsStyle';
import Card from 'components/Card/Card';
import CardBody from 'components/Card/CardBody';
import CardHeader from 'components/Card/CardHeader';
import CardText from 'components/Card/CardText';
import Button from 'components/CustomButtons/Button';
import CustomInput from 'components/CustomInput/CustomInput';
// core components
import GridContainer from 'components/Grid/GridContainer';
import GridItem from 'components/Grid/GridItem';
import {
Address,
BaseTenant,
Tenant,
} from 'components/ManageTenant/base-tenant';
import Danger from 'components/Typography/Danger';
import ViewMode from 'context/view-mode';
import CustomFormLabel from '../../../components/CustomFormLabel/CustomFormLabel';
import * as validation from '../validate-create-tenant';
import { ICreateTenantProps } from '../types';

const useStyles = makeStyles(styles);

interface ICreateTenantPropsObject {
tenantProps: ICreateTenantProps;
}

const APIClientCreate: React.FunctionComponent<ICreateTenantPropsObject> = ({
tenantProps,
) = (
const {
viewMode,
newTenant,
setNewTenant,
handleCreateNewTenant,
reformatTenantData,
discardChangesWarning,
validationErrors,
setValidationErrors,
duplicateEntryError,
setDuplicateEntryError,
serviceRequestError,
setServiceRequestError,
} = tenantProps;

  const [openSchemaResponseDialog, setOpenSchemaResponseDialog] =
React.useState<{
isDialogOpen: boolean;
responseMessage: string;
activatingTenant: boolean;
}>({ isDialogOpen: false, responseMessage: '', activatingTenant: false });

  const setField: (k: string, v: string | boolean | null | Address) => void = (
k: string,
v: string | boolean | null | Address,
) => {
setNewTenant((prev: BaseTenant | Tenant) => {
return {
...prev,
[k]: v,
};
    }};
};

  const [errors, setErrors] = React.useState({
legalName: '',
contractNumber: '',
tenantSchema: '',
cnxApiKey: '',
apiSubscriptionKey: '',
apiServiceAccountName: '',
apiServiceAccountPassword: '',
apiContactName: '',
apiContactEmail: '',
  }};

  const setErrorField: (k: string, v: Error) => void = (
k: string,
v: Error,
) => {
setErrors((prev) => {
return {
...prev,
[k]: v,
};
    }};
};

  const [openErrorDialog, setOpenErrorDialog] = React.useState(false);

  const validateTenantAndSchema: (activatingTenant: boolean) => void = async (
activatingTenant,
) => {
const saveData = reformatTenantData();
const schemaIsValid = validation.validateTenantSchema(
saveData.tenantSchema,
setErrorField,
    ];

    if (!schemaIsValid) {
setOpenErrorDialog(true);
return;
}

    const tenantIsValid = validation.validateAllApiClientFields(
activatingTenant,
newTenant,
setErrorField,
    ];

    if (tenantIsValid) {
saveTenant(activatingTenant);
}
};

  const saveTenant: (activatingTenant: boolean) => void = (
activatingTenant: boolean,
) => {
const tenantIsValid = validation.validateAllApiClientFields(
activatingTenant,
newTenant,
setErrorField,
    ];
const { ...saveFicusApiData } = newTenant;
if (tenantIsValid) {
saveFicusApiData.recordState = activatingTenant ? 'Active' : 'Draft';
if (viewMode === ViewMode.Create) {
saveFicusApiData.tenantSchema = `T${saveFicusApiData.contractNumber}`;
}
handleCreateNewTenant(
saveFicusApiData,
setValidationErrors,
setDuplicateEntryError,
setServiceRequestError,
      ];
    else
setOpenErrorDialog(true);
}
};

  const classes = useStyles();

  return (
    >>
<GridContainer>
{validationErrors.length !== 0 && (
<GridItem xs={12} sm={12} md={12}>
<Card>
<CardBody
className={classes.justifyContentCenter}
style={{
display: 'flex',
}}
>
<Danger>
<Warning
style={{
display: 'inline-block',
marginRight: '10px',
height: '1em',
width: '1em',
top: '.125em',
position: 'relative',
}}
                  [>

                  <p
style={{
display: 'inline-block',
paddingLeft: '0px',
}}
>
<b>There are errors in the form:</b>
</p>

                  <ul data-testid="validation-errors-list">
{validationErrors.map((errorText: string, i: number) => (
<li key={i}>{errorText}</li>
                    ]}}
</ul>
</Danger>
</CardBody>
</Card>
</GridItem>
        }}
<GridItem xs={12} sm={12} md={6}>
<GridContainer>
<GridItem xs={12} sm={12} md={12}>
<Card>
<CardHeader color="cuna1" text>
<CardText color="cuna1">
<h4 className={classes.cardTitle}>Tenant Information</h4>
</CardText>
</CardHeader>
<CardBody>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
error={errors.legalName.length !== 0}
className={classes.labelHorizontal}
required={true}
styleType="createTenant"
label="Legal Name"
                      [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<CustomInput
id="legalName"
error={errors.legalName.length !== 0}
formControlProps={{
fullWidth: true,
}}
inputProps={{
value: newTenant.legalName,
type: 'text',

                          onChange: (
event: React.ChangeEvent<HTMLInputElement>,
) => {
// update postal name if it doesn't differ already from legal name
if (newTenant.legalName === newTenant.postalName) {
setField('postalName', event.target.value);
validation.validatePostalName(
event.target.value,
setErrorField,
                               };
}

// update abbreviated name if it doesn't differ already from legal name
if (
newTenant.legalName === newTenant.abbreviatedName
                             } {
setField('abbreviatedName', event.target.value);
validation.validateAbbreviatedName(
event.target.value,
setErrorField,
                               };
}

                            setField('legalName', event.target.value);
validation.validateLegalName(
event.target.value,
setErrorField,
                             };
},
}}
helperText={
errors.legalName.length !== 0
? errors.legalName
: undefined
}
                      [>
</GridItem>
</GridContainer>
                  >>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
className={classes.labelHorizontal}
styleType="createTenant"
label="Tenant Type"
                        [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
className={classes.staticFormControl}
role="tenantType"
>
{newTenant.tenantTypeName}
</p>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
error={errors.apiContactName.length !== 0}
className={classes.labelHorizontal}
styleType="createTenant"
label="API Contact Name"
                        [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<CustomInput
id="apiContactName"
error={errors.apiContactName.length !== 0}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
value: newTenant.apiContactName,

                            onChange: (
event: React.ChangeEvent<HTMLInputElement>,
) => {
setField('apiContactName', event.target.value);
validation.validateApiContactName(
event.target.value,
setErrorField,
                               };
},
}}
helperText={
errors.apiContactName.length !== 0
? errors.apiContactName
: undefined
}
                        [>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
error={errors.apiContactEmail.length !== 0}
className={classes.labelHorizontal}
styleType="createTenant"
label="API Contact Email"
                        [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<CustomInput
id="apiContactEmail"
error={errors.apiContactEmail.length !== 0}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
value: newTenant.apiContactEmail,

                            onChange: (
event: React.ChangeEvent<HTMLInputElement>,
) => {
setField('apiContactEmail', event.target.value);
validation.validateApiContactEmail(
event.target.value,
setErrorField,
                               };
},
}}
helperText={
errors.apiContactEmail.length !== 0
? errors.apiContactEmail
: undefined
}
                        [>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
error={errors.contractNumber.length !== 0}
required={true}
className={classes.labelHorizontal}
styleType="createTenant"
label="Contract Number"
                        [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<CustomInput
id="apiContractNumber"
error={errors.contractNumber.length !== 0}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
value: newTenant.contractNumber,
disabled: viewMode !== ViewMode.Create,
onChange: (
event: React.ChangeEvent<HTMLInputElement>,
) => {
setField('contractNumber', event.target.value);
validation.validateContractNumber(
event.target.value,
setErrorField,
                               };
},
}}
helperText={
errors.contractNumber.length === 0
? 'Must be 8 characters in length.'
: errors.contractNumber
}
                        [>
</GridItem>
</GridContainer>
                  >[>
</CardBody>
</Card>
</GridItem>
</GridContainer>
</GridItem>
</GridContainer>
<GridContainer style={{ textAlign: 'right' }}>
<GridItem xs={12} sm={12} md={11}>
<Button
id="create-tenant-discard-changes"
color="danger"
onClick={discardChangesWarning}
style={{
display: 'inline',
}}
simple
>
Discard Changes
</Button>
<Button
id="create-tenant-save-draft"
style={{
display: newTenant.recordState !== 'Active' ? 'inline' : 'none',
marginRight: '10px',
color: '#4caf50',
background: 'white',
borderColor: '#4caf50',
borderStyle: 'solid',
}}
color="transparent"
onClick={() => {
viewMode === ViewMode.Create && newTenant.tenantSchema
? validateTenantAndSchema(false)
: saveTenant(false);
}}
>
Save Draft
</Button>
<Button
id="create-tenant-save"
color="success"
onClick={() => {
viewMode === ViewMode.Create && newTenant.tenantSchema
? validateTenantAndSchema(true)
: saveTenant(true);
}}
style={{
display: 'inline',
}}
>
Save
</Button>
</GridItem>
</GridContainer>
<Dialog
onClose={() => {
setOpenSchemaResponseDialog({
isDialogOpen: false,
responseMessage: '',
activatingTenant: false,
          }];
}}
aria-labelledby="schema-warning-title"
open={openSchemaResponseDialog.isDialogOpen}
>
<DialogTitle
id="schema-warning-title"
style={{
marginBottom: '0px',
paddingBottom: '0px',
}}
>
<Danger>
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
<b>Tenant Schema Warning</b>
</p>
</Danger>
</DialogTitle>
<DialogContent>
<DialogContentText>
{openSchemaResponseDialog.responseMessage}
</DialogContentText>
<div style={{ display: 'flex', justifyContent: 'space-between' }}>
<Button
id="create-tenant-discard-changes"
color="danger"
onClick={() =>
setOpenSchemaResponseDialog({
isDialogOpen: false,
responseMessage: '',
activatingTenant: false,
                }}
}
style={{
display: 'inline',
color: '#f44336',
borderColor: '#f44336',
borderStyle: 'solid',
}}
simple
>
Cancel
</Button>
{openSchemaResponseDialog.responseMessage !==
'Something went wrong with the schema service.' && (
<Button
id="create-tenant-save-draft"
style={{
display:
newTenant.recordState !== 'Active' ? 'inline' : 'none',
marginRight: '10px',
color: '#4caf50',
background: 'white',
borderColor: '#4caf50',
borderStyle: 'solid',
}}
color="transparent"
onClick={() => {
saveTenant(openSchemaResponseDialog.activatingTenant);
setOpenSchemaResponseDialog({
isDialogOpen: false,
responseMessage: '',
activatingTenant: false,
                  }};
}}
>
Submit
</Button>
            }}
</div>
</DialogContent>
</Dialog>
<Dialog
onClose={() => {
setOpenErrorDialog(false);
}}
aria-labelledby="form-error-title"
open={openErrorDialog}
>
<DialogTitle
id="form-error-title"
style={{
marginBottom: '0px',
paddingBottom: '0px',
}}
>
<Danger>
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
<b>Form Errors</b>
</p>
</Danger>
</DialogTitle>
<DialogContent>
<DialogContentText>
Please correct errors in the highlighted fields.
</DialogContentText>
</DialogContent>
</Dialog>
<Dialog
onClose={() => {
setDuplicateEntryError(false);
}}
aria-labelledby="form-duplicate-title"
open={duplicateEntryError}
>
<DialogTitle
id="duplicate-error-title"
style={{
marginBottom: '0px',
paddingBottom: '0px',
}}
>
<Danger>
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
<b>Duplicate Tenant Exists</b>
</p>
</Danger>
</DialogTitle>
<DialogContent>
<DialogContentText>
A tenant with the same legal name and contract number already
exists.
</DialogContentText>
</DialogContent>
</Dialog>
<Dialog
onClose={() => {
setServiceRequestError(false);
}}
aria-labelledby="form-service-error-title"
open={serviceRequestError}
>
<DialogTitle
id="service-error-title"
style={{
marginBottom: '0px',
paddingBottom: '0px',
}}
>
<Danger>
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
<b>Service Error</b>
</p>
</Danger>
</DialogTitle>
<DialogContent>
<DialogContentText>
An error occurred saving the tenant.
</DialogContentText>
</DialogContent>
</Dialog>
</>
  ];
};

export default APIClientCreate;
