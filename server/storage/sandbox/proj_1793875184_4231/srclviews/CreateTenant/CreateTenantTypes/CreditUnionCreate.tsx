import React from 'react';
import Dialog from '@material-ui/core/Dialog';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogTitle from '@material-ui/core/DialogTitle';
import FormControl from '@material-ui/core/FormControl';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import FormHelperText from '@material-ui/core/FormHelperText';
import MenuItem from '@material-ui/core/MenuItem';
import Radio from '@material-ui/core/Radio';
import Select from '@material-ui/core/Select';
// @material-ui/core components
import { makeStyles } from '@material-ui/core/styles';
import Switch from '@material-ui/core/Switch';
// @material-ui/icons
import FiberManualRecord from '@material-ui/icons/FiberManualRecord';
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
MembershipPreset,
} from 'components/ManageTenant/base-tenant';
import Danger from 'components/Typography/Danger';
import { useAppContext } from 'context/app-context';
import ViewMode from 'context/view-mode';
import { generalFetch } from 'utils/api-client';
import AddressCard from 'views/Components/AddressCard';
import TenantType from 'views/CreateTenant/TenantType';
import CustomFormLabel from '../../../components/CustomFormLabel/CustomFormLabel';
import * as validation from '../validate-create-tenant';
import { ICreateTenantProps } from '../types';
import { DisplayMode } from 'commonui';
import { SCDynamicSegment, SCTenantIntegrationWrapper } from '../styles';
import { TenantIntegrations } from './TenantIntegrations';
import { RecordState } from 'components/LoanAppForm/types';

const useStyles = makeStyles(styles);

interface ICreateTenantPropsObject {
tenantProps: ICreateTenantProps;
}

const CreditUnionCreate: React.FunctionComponent<ICreateTenantPropsObject> = ({
tenantProps,
) = (
const {
viewMode,
newTenant,
setNewTenant,
merchantList,
handleCreateNewTenant,
reformatTenantData,
discardChangesWarning,
    validationErrors,
    setValidationErrors,
    duplicateEntryError,
    setDuplicateEntryError,
    serviceRequestError,
    setServiceRequestError,
= tenantProps;
const { tenant } = useAppContext();
  const [openSchemaResponseDialog, setopenSchemaResponseDialog] =
    React.usestate<l
      isDialogOpen: boolean;
      responseMessage: string:
      activatingTenant: boolean;
    }>({ isDialogopen: false, responseMessage: -', activatingTenant: false '});

  const setField: (k: string, v: string | boolean | null | Address) => void = (
    k: string.
    v: string | boolean  null I Address,
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
postalName: '',
abbreviatedName: '',
contractNumber: '',
cuicCustomerNumber: '',
tenantTypeId: '',
numberOfMembers: '',
membershipClassCode: '',
membershipClassDesc: '',
survivingContractNumber: '',
website: '',
phoneNumber: '',
assetRank: '',
assetSize: '',
systemStatus: '',
legalStatus: '',
operationalStatus: '',
homeBanking: '',
homeBankingFiId: '',
physicalAddressLine1: '',
physicalAddressLine2: '',
physicalAddressLine3: '',
physicalAddressCity: '',
physicalAddressCounty: '',
physicalAddressState: '',
physicalAddressZip: '',
physicalAddressCountry: '',
mailingAddressLine1: '',
mailingAddressLine2: '',
mailingAddressLine3: '',
mailingAddressCity: '',
mailingAddressCounty: '',
mailingAddressState: '',
mailingAddressZip: '',
mailingAddressCountry: '',
defaultZipCode: '',
losMembershipRedirectUrl: '',
losMembershipRedirectUrlRefId: '',
tenantSchema: '',
defaultMerchantId: '',
apiContactName: '',
apiContactEmail: '',
homeBankingStorefrontUrl: '',
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

  const handleAddressChange = (event: any, addressType: string): void => {
const { id, value, name } = event.target;
const key = id ? id : name;

    const newAddress = {
...newTenant[addressType],
[key]: value,
};

    setField(addressType, newAddress);
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

    const tenantIsValid = validation.validateAllFields(
activatingTenant,
newTenant,
setErrorField,
    ];

    if (tenantIsValid) {
const tenantSchemaResponse = await generalFetch(
`${process.env.REACT_APP_TENANT_API_BASE_URL}schema/${saveData.tenantSchema}`,
'GET',
      ];
if (tenantSchemaResponse && tenantSchemaResponse.ok) {
switch (tenantSchemaResponse.status.toString()) {
case '200':
setOpenSchemaResponseDialog({
isDialogOpen: true,
responseMessage:
'The declared schema is already in use. Are you sure you want to declare a schema for this tenant that is already in use?',
activatingTenant,
            }];
break;

          case '204':
saveTenant(activatingTenant);
break;

          default:
setOpenSchemaResponseDialog({
isDialogOpen: true,
responseMessage: 'Something went wrong with the schema service.',
activatingTenant,
            }];
}
}
}
};

  const isStatusDraft = newTenant?.recordState === RecordState.Draft;

  const saveTenant: (activatingTenant: boolean) => void = (
activatingTenant: boolean,
) => {
const tenantIsValid = validation.validateAllFields(
activatingTenant,
newTenant,
setErrorField,
    ];
const saveData = reformatTenantData();
if (tenantIsValid) {
if (activatingTenant && isStatusDraft) {
saveData.recordState = 'Active';
}
handleCreateNewTenant(
saveData,
setValidationErrors,
setDuplicateEntryError,
setServiceRequestError,
      ];
} else {
setOpenErrorDialog(true);
}
};
const tenantStates = isStatusDraft
? [RecordState.Draft, RecordState.New]
: [RecordState.Active, RecordState.Inactive];

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
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
error={errors.postalName.length !== 0}
className={classes.labelHorizontal}
styleType="createTenant"
label="Postal Name"
                      [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<CustomInput
id="postalName"
error={errors.postalName.length !== 0}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
value: newTenant.postalName,

                          onChange: (
event: React.ChangeEvent<HTMLInputElement>,
) => {
setField('postalName', event.target.value);
validation.validatePostalName(
event.target.value,
setErrorField,
                             };
},
}}
helperText={
errors.postalName.length !== 0
? errors.postalName
: undefined
}
                      [>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
error={errors.abbreviatedName.length !== 0}
className={classes.labelHorizontal}
styleType="createTenant"
label="Abbreviated Name"
                      [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<CustomInput
id="abbreviatedName"
error={errors.abbreviatedName.length !== 0}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
value: newTenant.abbreviatedName,

                          onChange: (
event: React.ChangeEvent<HTMLInputElement>,
) => {
setField('abbreviatedName', event.target.value);
validation.validateAbbreviatedName(
event.target.value,
setErrorField,
                             };
},
}}
helperText={
errors.abbreviatedName.length !== 0
? errors.abbreviatedName
                             ; ``
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
id="contractNumber"
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
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
error={errors.cuicCustomerNumber.length !== 0}
className={classes.labelHorizontal}
required={true}
styleType="createTenant"
label="CUIC Customer Number"
                      [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<CustomInput
error={errors.cuicCustomerNumber.length !== 0}
id="cuicCustNumber"
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
value: newTenant.cuicCustomerNumber,
disabled: newTenant.recordState === 'Active',
onChange: (
event: React.ChangeEvent<HTMLInputElement>,
) => {
setField('cuicCustomerNumber', event.target.value);
validation.validateCuicCustomerNumber(
false,
event.target.value,
setErrorField,
                             };
},
}}
helperText={
errors.cuicCustomerNumber.length === 0
? undefined
: errors.cuicCustomerNumber
}
                      [>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
error={errors.tenantTypeId.length !== 0}
className={
classes.labelHorizontal +
                           ` ` >
classes.labelHorizontalRadioCheckbox
}
required={true}
styleType="createTenant"
label="Type"
                      [>
</GridItem>
<GridItem xs={12} sm={10} md={6}>
<FormControl
disabled={newTenant.recordState === 'Active'}
error={errors.tenantTypeId.length !== 0}
fullWidth={true}
className={classes.selectFormControl}
style={{ paddingTop: '12px' }}
>
<TenantType
newTenant={newTenant}
setField={setField}
setErrorField={setErrorField}
                        [>
</FormControl>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
className={
classes.labelHorizontal +
                           ` ` >
classes.labelHorizontalRadioCheckbox
}
styleType="createTenant"
label="Charter Type"
                      [>
</GridItem>
<GridItem xs={12} sm={4}>
<div
className={
classes.checkboxAndRadio +
                           ` ` >
classes.checkboxAndRadioHorizontal
}
>
<FormControlLabel
value={newTenant.charterType}
control={
<Radio
checked={newTenant.charterType === 'State'}
onChange={(
event: React.ChangeEvent<HTMLInputElement>,
) => setField('charterType', event.target.value)}
value="State"
name="radio button enabled"
aria-label="A"
icon={
<FiberManualRecord
className={classes.radioUnchecked}
/>
}
checkedIcon={
<FiberManualRecord
className={classes.radioChecked}
/>
}
classes={{
checked: classes.radio,
root: classes.radioRoot,
}}
                            [>
}
classes={{
label: classes.label,
root: classes.labelRoot,
}}
label="State"
                        [>
</div>
<div
className={
classes.checkboxAndRadio +
                           ` ` >
classes.checkboxAndRadioHorizontal
}
>
<FormControlLabel
value={newTenant.charterType}
control={
<Radio
checked={newTenant.charterType === 'Federal'}
onChange={(
event: React.ChangeEvent<HTMLInputElement>,
) => setField('charterType', event.target.value)}
value="Federal"
name="radio button enabled"
aria-label="B"
icon={
<FiberManualRecord
className={classes.radioUnchecked}
/>
}
checkedIcon={
<FiberManualRecord
className={classes.radioChecked}
/>
}
classes={{
checked: classes.radio,
root: classes.radioRoot,
}}
                            [>
}
classes={{
label: classes.label,
root: classes.labelRoot,
}}
label="Federal"
                        [>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
className={
classes.labelHorizontal +
                           ` ` >
classes.labelHorizontalRadioCheckbox
}
styleType="createTenant"
label="Cunexus license"
                      [>
</GridItem>
<GridItem xs={12} sm={4}>
<div
className={
classes.checkboxAndRadio +
                           ` ` >
classes.checkboxAndRadioHorizontal
}
>
<FormControlLabel
label={null}
value={newTenant.isCnxLicensed}
disabled={false}
control={
<Switch
checked={newTenant.isCnxLicensed}
onChange={(
event: React.ChangeEvent<HTMLInputElement>,
) =>
setField('isCnxLicensed', event.target.checked)
}
value="isCnxLicensed"
classes={{
switchBase: classes.switchBase,
checked: classes.switchChecked,
thumb: classes.switchIcon,
track: classes.switchBar,
}}
                            [>
}
                        [>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
className={
classes.labelHorizontal +
                           ` ` >
classes.labelHorizontalRadioCheckbox
}
styleType="createTenant"
label="Digital Lending license"
                      [>
</GridItem>
<GridItem xs={12} sm={4}>
<div
className={
classes.checkboxAndRadio +
                           ` ` >
classes.checkboxAndRadioHorizontal
}
>
<FormControlLabel
label={null}
value={newTenant.isDlxLicensed}
disabled={false}
control={
<Switch
checked={newTenant.isDlxLicensed}
onChange={(
event: React.ChangeEvent<HTMLInputElement>,
) =>
setField('isDlxLicensed', event.target.checked)
}
value="isDlxLicensed"
classes={{
switchBase: classes.switchBase,
checked: classes.switchChecked,
thumb: classes.switchIcon,
track: classes.switchBar,
}}
                            [>
}
                        [>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
className={
classes.labelHorizontal +
                           ` ` >
classes.labelHorizontalRadioCheckbox
}
styleType="createTenant"
label="Text Messaging Enabled"
                      [>
</GridItem>
<GridItem xs={12} sm={4}>
<div
className={
classes.checkboxAndRadio +
                           ` ` >
classes.checkboxAndRadioHorizontal
}
>
<FormControlLabel
label={null}
value={newTenant.isTextMessagingEnabled}
disabled={false}
control={
<Switch
title="Existing loan applications will continue to get text messages. Only new loan applications will be affected by updating this setting. Additionally.the tenant will need additional setup in Twilio to be able to send text messages. This togglealone does not enable text messaging for the tenant."
checked={newTenant.isTextMessagingEnabled}
onChange={(
event: React.ChangeEvent<HTMLInputElement>,
) =>
setField(
'isTextMessagingEnabled',
event.target.checked,
                                 }
}
value="isTextMessagingEnabled"
classes={{
switchBase: classes.switchBase,
checked: classes.switchChecked,
thumb: classes.switchIcon,
track: classes.switchBar,
}}
                            [>
}
                        [>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
className={
classes.labelHorizontal +
                           ` ` >
classes.labelHorizontalRadioCheckbox
}
styleType="createTenant"
label="Authorized to Externally Submit to LOS"
                      [>
</GridItem>
<GridItem xs={12} sm={4}>
<div
className={
classes.checkboxAndRadio +
                           ` ` >
classes.checkboxAndRadioHorizontal
}
>
<FormControlLabel
label={null}
value={newTenant.isAuthorizeToSubmitToLOS}
disabled={false}
control={
<Switch
title="This toggle authorize (or not authorize) this Credit Union to submit applications to Los."
checked={newTenant.isAuthorizeToSubmitToLOS}
onChange={(
event: React.ChangeEvent<HTMLInputElement>,
) =>
setField(
'isAuthorizeToSubmitToLOS',
event.target.checked,
                                 }
}
value="isAuthorizeToSubmitToLOS"
classes={{
switchBase: classes.switchBase,
checked: classes.switchChecked,
thumb: classes.switchIcon,
track: classes.switchBar,
}}
                            [>
}
                        [>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
className={
classes.labelHorizontal +
                           ` ` >
classes.labelHorizontalRadioCheckbox
}
styleType="createTenant"
label="Auto Approve Doc Upload"
                      [>
</GridItem>
<GridItem xs={12} sm={4}>
<div
className={
classes.checkboxAndRadio +
                           ` ` >
classes.checkboxAndRadioHorizontal
}
>
<FormControlLabel
label={null}
value={newTenant.isDocUploadApprovalAutomatic}
disabled={false}
control={
<Switch
checked={newTenant.isDocUploadApprovalAutomatic}
onChange={(
event: React.ChangeEvent<HTMLInputElement>,
) =>
setField(
'isDocUploadApprovalAutomatic',
event.target.checked,
                                 }
}
value="isDocUploadApprovalAutomatic"
classes={{
switchBase: classes.switchBase,
checked: classes.switchChecked,
thumb: classes.switchIcon,
track: classes.switchBar,
}}
                            [>
}
                        [>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
className={
classes.labelHorizontal +
                           ` ` >
classes.labelHorizontalRadioCheckbox
}
styleType="createTenant"
label="API Client Enabled"
                      [>
</GridItem>
<GridItem xs={12} sm={4}>
<div
className={
classes.checkboxAndRadio +
                           ` ` >
classes.checkboxAndRadioHorizontal
}
>
<FormControlLabel
label={null}
value={newTenant.ficusApiClient}
disabled={false}
control={
<Switch
checked={newTenant.ficusApiClient}
onChange={(
event: React.ChangeEvent<HTMLInputElement>,
) =>
setField('ficusApiClient', event.target.checked)
}
value="ficusApiClient"
classes={{
switchBase: classes.switchBase,
checked: classes.switchChecked,
thumb: classes.switchIcon,
track: classes.switchBar,
}}
                            [>
}
                        [>
</div>
</GridItem>
</GridContainer>
</CardBody>
</Card>
</GridItem>
<GridItem xs={12} sm={12} md={12}>
<Card>
<CardHeader color="cuna1" text>
<CardText color="cuna1">
<h4 className={classes.cardTitle}>
Membership Information
</h4>
</CardText>
</CardHeader>
<CardBody>
<GridContainer>
<GridItem xs={12} sm={2} md={5}>
<CustomFormLabel
className={classes.labelHorizontal}
error={errors.numberOfMembers.length !== 0}
styleType="createTenant"
label="Number of Members"
                      [>
</GridItem>
<GridItem xs={12} sm={10} md={6}>
<CustomInput
id="numMembers"
error={errors.numberOfMembers.length !== 0}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
value: newTenant.numberOfMembers,

                          onChange: (
event: React.ChangeEvent<HTMLInputElement>,
) => {
setField('numberOfMembers', event.target.value);
validation.validateNumberOfMembers(
event.target.value,
setErrorField,
                             };
},
}}
helperText={
errors.numberOfMembers.length !== 0
? errors.numberOfMembers
: undefined
}
                      [>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={5}>
<CustomFormLabel
className={classes.labelHorizontal}
error={errors.membershipClassCode.length !== 0}
styleType="createTenant"
label="Membership Class Code"
                      [>
</GridItem>
<GridItem xs={12} sm={10} md={6}>
<CustomInput
id="memClassCd"
error={errors.membershipClassCode.length !== 0}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
value: newTenant.membershipClassCode,

                          onChange: (
event: React.ChangeEvent<HTMLInputElement>,
) => {
setField('membershipClassCode', event.target.value);
validation.validateMembershipClassCode(
event.target.value,
setErrorField,
                             };
},
}}
helperText={
errors.membershipClassCode.length !== 0
? errors.membershipClassCode
: undefined
}
                      [>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={5}>
<CustomFormLabel
error={errors.membershipClassDesc.length !== 0}
className={classes.labelHorizontal}
styleType="createTenant"
label="Membership Class Description"
                      [>
</GridItem>
<GridItem xs={12} sm={10} md={6}>
<CustomInput
id="memClassDesc"
error={errors.membershipClassDesc.length !== 0}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
value: newTenant.membershipClassDesc,

                          onChange: (
event: React.ChangeEvent<HTMLInputElement>,
) => {
setField('membershipClassDesc', event.target.value);
validation.validateMembershipClassDescription(
event.target.value,
setErrorField,
                             };
},
}}
helperText={
errors.membershipClassDesc.length !== 0
? errors.membershipClassDesc
: undefined
}
                      [>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={5}>
<CustomFormLabel
className={
classes.labelHorizontal +
                           ` ` >
classes.labelHorizontalRadioCheckbox
}
styleType="createTenant"
label="LOS Membership Redirect URL"
                      [>
</GridItem>
<GridItem xs={12} sm={4}>
<div
className={
classes.checkboxAndRadio +
                           ` ` >
classes.checkboxAndRadioHorizontal
}
>
<FormControlLabel
value={newTenant.losMembershipRedirectUrlPreset}
control={
<Radio
checked={
newTenant.losMembershipRedirectUrlPreset ===
MembershipPreset.NONE
}
onChange={(
event: React.ChangeEvent<HTMLInputElement>,
) => {
setField(
'losMembershipRedirectUrlPreset',
event.target.value,
                                 };
setField('memberizationRequired', false);
setField(
'losMembershipRedirectUrlRefId',
'N/A',
                                 };
validation.validateLosMembershipRedirectUrlRefId(
'N/A',
setErrorField,
                                 };
}}
value={MembershipPreset.NONE}
name="radio button enabled"
aria-label="None"
icon={
<FiberManualRecord
className={classes.radioUnchecked}
/>
}
checkedIcon={
<FiberManualRecord
className={classes.radioChecked}
/>
}
classes={{
checked: classes.radio,
root: classes.radioRoot,
}}
                            [>
}
classes={{
label: classes.label,
root: classes.labelRoot,
}}
label="None"
                        [>
</div>
<div
className={
classes.checkboxAndRadio +
                           ` ` >
classes.checkboxAndRadioHorizontal
}
>
<FormControlLabel
value={newTenant.losMembershipRedirectUrlPreset}
control={
<Radio
checked={
newTenant.losMembershipRedirectUrlPreset ===
MembershipPreset.TEST
}
onChange={(
event: React.ChangeEvent<HTMLInputElement>,
) => {
setField(
'losMembershipRedirectUrlPreset',
event.target.value,
                                 };
if (
newTenant.losMembershipRedirectUrlRefId ===
'N/A'
                                 }
setField('losMembershipRedirectUrlRefId', '');
}}
value={MembershipPreset.TEST}
name="radio button enabled"
aria-label="Test"
icon={
<FiberManualRecord
className={classes.radioUnchecked}
/>
}
checkedIcon={
<FiberManualRecord
className={classes.radioChecked}
/>
}
classes={{
checked: classes.radio,
root: classes.radioRoot,
}}
                            [>
}
classes={{
label: classes.label,
root: classes.labelRoot,
}}
label="Test"
                        [>
</div>
<div
className={
classes.checkboxAndRadio +
                           ` ` >
classes.checkboxAndRadioHorizontal
}
>
<FormControlLabel
value={newTenant.losMembershipRedirectUrlPreset}
control={
<Radio
checked={
newTenant.losMembershipRedirectUrlPreset ===
MembershipPreset.PROD
}
onChange={(
event: React.ChangeEvent<HTMLInputElement>,
) => {
setField(
'losMembershipRedirectUrlPreset',
event.target.value,
                                 };
if (
newTenant.losMembershipRedirectUrlRefId ===
'N/A'
                                 }
setField('losMembershipRedirectUrlRefId', '');
}}
value={MembershipPreset.PROD}
name="radio button enabled"
aria-label="Prod"
icon={
<FiberManualRecord
className={classes.radioUnchecked}
/>
}
checkedIcon={
<FiberManualRecord
className={classes.radioChecked}
/>
}
classes={{
checked: classes.radio,
root: classes.radioRoot,
}}
                            [>
}
classes={{
label: classes.label,
root: classes.labelRoot,
}}
label="Prod"
                        [>
</div>
</GridItem>
</GridContainer>

                  <GridContainer>
<GridItem xs={12} sm={2} md={5}>
<CustomFormLabel
error={
errors.losMembershipRedirectUrlRefId.length !== 0
}
className={classes.labelHorizontal}
styleType="createTenant"
label="Redirect URL Reference Id"
required={
newTenant.losMembershipRedirectUrlPreset !==
MembershipPreset.NONE
}
                      [>
</GridItem>
<GridItem xs={12} sm={10} md={6}>
<CustomInput
id="losMembershipRedirectUrlRefId"
error={
errors.losMembershipRedirectUrlRefId.length !== 0
}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
value: newTenant.losMembershipRedirectUrlRefId,
disabled:
newTenant.losMembershipRedirectUrlPreset ===
MembershipPreset.NONE,
onChange: (
event: React.ChangeEvent<HTMLInputElement>,
) => {
setField(
'losMembershipRedirectUrlRefId',
event.target.value,
                             };
validation.validateLosMembershipRedirectUrlRefId(
event.target.value,
setErrorField,
                             };
},
}}
helperText={
errors.losMembershipRedirectUrlRefId.length !== 0
? errors.losMembershipRedirectUrlRefId
: undefined
}
                      [>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={5}>
<CustomFormLabel
className={
classes.labelHorizontal +
                           ` ` >
classes.labelHorizontalRadioCheckbox
}
styleType="createTenant"
label="Memberization Required"
                      [>
</GridItem>
<GridItem xs={12} sm={4}>
<div
className={
classes.checkboxAndRadio +
                           ` ` >
classes.checkboxAndRadioHorizontal
}
>
<FormControlLabel
label={null}
value={newTenant.memberizationRequired}
disabled={
newTenant.losMembershipRedirectUrlPreset ===
MembershipPreset.NONE
}
control={
<Switch
checked={newTenant.memberizationRequired}
onChange={(
event: React.ChangeEvent<HTMLInputElement>,
) =>
setField(
'memberizationRequired',
event.target.checked,
                                 }
}
value="memberizationRequired"
classes={{
switchBase: classes.switchBase,
checked: classes.switchChecked,
thumb: classes.switchIcon,
track: classes.switchBar,
}}
                            [>
}
                        [>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={5}>
<CustomFormLabel
className={
classes.labelHorizontal +
                           ` ` >
classes.labelHorizontalRadioCheckbox
}
styleType="createTenant"
label="League Member"
                      [>
</GridItem>
<GridItem xs={12} sm={4}>
<div
className={
classes.checkboxAndRadio +
                           ` ` >
classes.checkboxAndRadioHorizontal
}
>
<FormControlLabel
value={newTenant.leagueMember ? 'a' : 'b'}
control={
<Radio
checked={!newTenant.leagueMember}
onChange={() => setField('leagueMember', false)}
value="a"
name="radio button enabled"
aria-label="A"
icon={
<FiberManualRecord
className={classes.radioUnchecked}
/>
}
checkedIcon={
<FiberManualRecord
className={classes.radioChecked}
/>
}
classes={{
checked: classes.radio,
root: classes.radioRoot,
}}
                            [>
}
classes={{
label: classes.label,
root: classes.labelRoot,
}}
label="No"
                        [>
</div>
<div
className={
classes.checkboxAndRadio +
                           ` ` >
classes.checkboxAndRadioHorizontal
}
>
<FormControlLabel
value={newTenant.leagueMember ? 'a' : 'b'}
control={
<Radio
checked={newTenant.leagueMember}
onChange={() => setField('leagueMember', true)}
value="b"
name="radio button enabled"
aria-label="B"
icon={
<FiberManualRecord
className={classes.radioUnchecked}
/>
}
checkedIcon={
<FiberManualRecord
className={classes.radioChecked}
/>
}
classes={{
checked: classes.radio,
root: classes.radioRoot,
}}
                            [>
}
classes={{
label: classes.label,
root: classes.labelRoot,
}}
label="Yes"
                        [>
</div>
</GridItem>
</GridContainer>
</CardBody>
</Card>
</GridItem>
<GridItem xs={12} sm={12} md={12}>
<Card>
<CardHeader color="cuna1" text>
<CardText color="cuna1">
<h4 className={classes.cardTitle}>
Additional Information
</h4>
</CardText>
</CardHeader>
<CardBody>
<GridContainer>
<GridItem xs={12} sm={2} md={5}>
<CustomFormLabel
error={errors.survivingContractNumber.length !== 0}
className={classes.labelHorizontal}
styleType="createTenant"
label="Surviving Contract Number"
                      [>
</GridItem>
<GridItem xs={12} sm={10} md={6}>
<CustomInput
id="survContractNum"
error={errors.survivingContractNumber.length !== 0}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
value: newTenant.survivingContractNumber,
disabled: newTenant.recordState === 'Active',
onChange: (
event: React.ChangeEvent<HTMLInputElement>,
) => {
setField(
'survivingContractNumber',
event.target.value,
                             };
validation.validateSurvivingContractNumber(
event.target.value,
setErrorField,
                             };
},
}}
helperText={
errors.survivingContractNumber.length !== 0
? errors.survivingContractNumber
: undefined
}
                      [>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={5}>
<CustomFormLabel
error={errors.website.length != 0}
className={classes.labelHorizontal}
styleType="createTenant"
label="Website"
                      [>
</GridItem>
<GridItem xs={12} sm={10} md={6}>
<CustomInput
id="website"
error={errors.website.length !== 0}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
value: newTenant.website,
onChange: (
event: React.ChangeEvent<HTMLInputElement>,
) => {
setField('website', event.target.value);
validation.validateWebsite(
event.target.value,
setErrorField,
                             };
},
}}
helperText={
errors.website.length !== 0
? errors.website
: undefined
}
                      [>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={5}>
<CustomFormLabel
error={errors.phoneNumber.length !== 0}
className={classes.labelHorizontal}
styleType="createTenant"
label="Phone Number"
                      [>
</GridItem>
<GridItem xs={12} sm={10} md={6}>
<CustomInput
id="phoneNumber"
error={errors.phoneNumber.length !== 0}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
value: newTenant.phoneNumber,
onChange: (
event: React.ChangeEvent<HTMLInputElement>,
) => {
setField('phoneNumber', event.target.value);
validation.validatePhoneNumber(
event.target.value,
setErrorField,
                             };
},
}}
helperText={
errors.phoneNumber.length !== 0
? errors.phoneNumber
: undefined
}
                      [>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={5}>
<CustomFormLabel
error={errors.assetRank.length !== 0}
className={classes.labelHorizontal}
styleType="createTenant"
label="Asset Rank"
                      [>
</GridItem>
<GridItem xs={12} sm={10} md={6}>
<CustomInput
id="assetRank"
error={errors.assetRank.length !== 0}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
value: newTenant.assetRank,
onChange: (
event: React.ChangeEvent<HTMLInputElement>,
) => {
setField('assetRank', event.target.value);
validation.validateAssetRank(
event.target.value,
setErrorField,
                             };
},
}}
helperText={
errors.assetRank.length !== 0
? errors.assetRank
: undefined
}
                      [>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={5}>
<CustomFormLabel
error={errors.assetSize.length !== 0}
className={classes.labelHorizontal}
styleType="createTenant"
label="Asset Size"
                      [>
</GridItem>
<GridItem xs={12} sm={10} md={6}>
<CustomInput
id="assetSize"
error={errors.assetSize.length !== 0}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
value: newTenant.assetSize,
onChange: (
event: React.ChangeEvent<HTMLInputElement>,
) => {
setField('assetSize', event.target.value);
validation.validateAssetSize(
event.target.value,
setErrorField,
                             };
},
}}
helperText={
errors.assetSize.length !== 0
? errors.assetSize
: undefined
}
                      [>
</GridItem>
</GridContainer>
</CardBody>
</Card>
</GridItem>
</GridContainer>
</GridItem>
<GridItem xs={12} sm={12} md={6}>
<GridContainer>
<GridItem xs={12} sm={12} md={12}>
<Card>
<CardHeader color="cuna1" text>
<CardText color="cuna1">
<h4 className={classes.cardTitle}>Status</h4>
</CardText>
</CardHeader>
<CardBody>
<GridContainer>
<GridItem xs={12} sm={4} md={4}>
<CustomFormLabel
error={errors.systemStatus.length !== 0}
className={classes.labelHorizontal}
required={true}
styleType="createTenant"
label="System Status"
                      [>
</GridItem>
<GridItem xs={12} sm={8} md={5}>
<FormControl
component={'div'}
error={errors.systemStatus.length !== 0}
style={{ paddingTop: '24px' }}
fullWidth={true}
className={classes.selectFormControl}
>
<Select
disabled={isStatusDraft}
MenuProps={{
className: classes.selectMenu,
}}
classes={{
select: classes.select,
}}
value={
viewMode === ViewMode.Edit
? newTenant.recordState
: 'New'
}
onChange={(event: any) => {
setField('recordState', event.target.value);
validation.validateSystemStatus(
false,
event.target.value,
setErrorField,
                             };
}}
inputProps={{
name: 'systemStatus',
id: 'system-status',
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
{tenantStates.map((m) => (
<MenuItem
key={m}
classes={{
root: classes.selectMenuItem,
selected: classes.selectMenuItemSelected,
}}
value={m}
>
                              {>}
</MenuItem>
                          }]}
</Select>
</FormControl>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={4} md={4}>
<CustomFormLabel
error={errors.legalStatus.length !== 0}
className={classes.labelHorizontal}
required={true}
styleType="createTenant"
label="Legal Status"
                      [>
</GridItem>
<GridItem xs={12} sm={8} md={5}>
<FormControl
component={'div'}
// value={newTenant.legalStatus}
error={errors.legalStatus.length !== 0}
style={{ paddingTop: '24px' }}
fullWidth={true}
className={classes.selectFormControl}
>
<Select
MenuProps={{
className: classes.selectMenu,
}}
classes={{
select: classes.select,
}}
value={newTenant.legalStatus}
onChange={(event: any) => {
setField('legalStatus', event.target.value);
validation.validateLegalStatus(
false,
event.target.value,
setErrorField,
                             };
}}
inputProps={{
name: 'legalStatus',
id: 'legal-status',
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
{[
'Active',
'Merged',
'Liquidated',
'Inactive',
'In Process of Merging',
'In Process of Liquidating',
'Conservatorship',
'Purchase',
'Assumption',
].map((m) => (
<MenuItem
key={m}
classes={{
root: classes.selectMenuItem,
selected: classes.selectMenuItemSelected,
}}
value={m}
>
                              {>}
</MenuItem>
                          }]}
</Select>
</FormControl>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={4} md={4}>
<CustomFormLabel
error={errors.operationalStatus.length !== 0}
className={classes.labelHorizontal}
required={true}
styleType="createTenant"
label="Operational Status"
                      [>
</GridItem>
<GridItem xs={12} sm={8} md={5}>
<FormControl
component={'div'}
// value={newTenant.operationalStatus}
error={errors.operationalStatus.length !== 0}
style={{ paddingTop: '24px' }}
fullWidth={true}
className={classes.selectFormControl}
>
<Select
MenuProps={{
className: classes.selectMenu,
}}
classes={{
select: classes.select,
}}
value={newTenant.operationalStatus}
onChange={(event: any) => {
setField('operationalStatus', event.target.value);
validation.validateOperationalStatus(
false,
event.target.value,
setErrorField,
                             };
}}
inputProps={{
name: 'operationalStatus',
id: 'operational-status',
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
{[
'Open For Business',
'Transitioning out of Business',
'Open for Business with Special Handling',
'Closed for Business',
].map((m) => (
<MenuItem
key={m}
classes={{
root: classes.selectMenuItem,
selected: classes.selectMenuItemSelected,
}}
value={m}
>
                              {>}
</MenuItem>
                          }]}
</Select>
</FormControl>
</GridItem>
</GridContainer>
</CardBody>
</Card>
</GridItem>
<GridItem xs={12} sm={12} md={12}>
<Card>
<CardHeader color="cuna1" text>
<CardText color="cuna1">
<h4 className={classes.cardTitle}>Addresses</h4>
</CardText>
</CardHeader>
<CardBody>
{/* <GridContainer justify="flex-end"> */}
<GridContainer>
<GridItem xs={12} sm={12} md={11}>
<div className={classes.block}>
<FormControlLabel
value={newTenant.isMailingSameAddress}
control={
<Switch
checked={newTenant.isMailingSameAddress}
onChange={(
event: React.ChangeEvent<HTMLInputElement>,
) =>
setField(
'isMailingSameAddress',
event.target.checked,
}
}
value="isMailingSameAddress"
classes={{
switchBase: classes.switchBase,
checked: classes.switchChecked,
thumb: classes.switchIcon,
track: classes.switchBar,
}}
                            [>
}
classes={{
label: classes.label,
}}
label="Same Address for Physical and Mailing"
                        [>
</div>
</GridItem>
</GridContainer>
<AddressCard
viewOnly={false}
handleChange={handleAddressChange}
data={newTenant.physicalAddress}
errors={errors}
setErrorField={setErrorField}
addType="physical"
                  [>
{newTenant.isMailingSameAddress === false ? (
<AddressCard
viewOnly={false}
handleChange={handleAddressChange}
data={newTenant.mailingAddress}
errors={errors}
setErrorField={setErrorField}
addType="mailing"
                    [>
) : null}
</CardBody>
</Card>

              <Card>
<CardHeader color="cuna1" text>
<CardText color="cuna1">
<h4 className={classes.cardTitle}>Defaults</h4>
</CardText>
</CardHeader>
<CardBody>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
error={errors.defaultZipCode.length !== 0}
className={classes.labelHorizontal}
required={true}
styleType="createTenant"
label="Default Zip Code for Valuations"
                      [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<CustomInput
id="defaultZipCode"
error={errors.defaultZipCode.length !== 0}
formControlProps={{
fullWidth: true,
}}
inputProps={{
value: newTenant.defaultZipCode
? newTenant.defaultZipCode
                             ; `` ,
type: 'text',
onChange: (
event: React.ChangeEvent<HTMLInputElement>,
) => {
setField('defaultZipCode', event.target.value);
validation.validateDefaultZipCode(
event.target.value,
setErrorField,
                             };
},
}}
helperText={
errors.defaultZipCode.length !== 0
? errors.defaultZipCode
: undefined
}
                      [>
</GridItem>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
error={errors.tenantSchema.length !== 0}
className={classes.labelHorizontal}
styleType="createTenant"
label="Tenant Schema"
                      [>
</GridItem>
<GridItem xs={12} sm={10} md={6}>
<CustomInput
id="tenantSchema"
error={errors.tenantSchema.length !== 0}
formControlProps={{
fullWidth: true,
}}
inputProps={{
type: 'text',
value: newTenant.tenantSchema,
disabled: tenant && !!tenant.tenantSchema,
onChange: (
event: React.ChangeEvent<HTMLInputElement>,
) => {
setField('tenantSchema', event.target.value);
validation.validateTenantSchema(
event.target.value,
setErrorField,
                             };
},
}}
helperText={
errors.tenantSchema.length !== 0
? errors.tenantSchema
: undefined
}
                      [>
</GridItem>
<GridItem xs={12} sm={4} md={4}>
<CustomFormLabel
error={errors.defaultMerchantId.length !== 0}
className={classes.labelHorizontal}
styleType="createTenant"
label="Default Merchant"
                      [>
</GridItem>
<GridItem xs={12} sm={8} md={5}>
<FormControl
error={errors.defaultMerchantId.length !== 0}
style={{ paddingTop: '24px' }}
fullWidth={true}
className={classes.selectFormControl}
>
<Select
MenuProps={{
className: classes.selectMenu,
}}
classes={{
select: classes.select,
}}
value={newTenant.defaultMerchantId || 0}
onChange={(event) => {
const val =
event.target.value !== 0
? (event.target.value as string)
: null;
setField('defaultMerchantId', val);
}}
inputProps={{
name: 'defaultMerchantId',
id: 'default-merchant-id',
}}
defaultValue={
tenant?.defaultMerchantId === null
? 'null'
: tenant?.defaultMerchantId
}
>
<MenuItem
disabled
classes={{
root: classes.selectMenuItem,
}}
>
Choose Default Merchant
</MenuItem>
<MenuItem
key={'merchantNull'}
classes={{
root: classes.selectMenuItem,
selected: classes.selectMenuItemSelected,
}}
value={0}
>
None
</MenuItem>
{merchantList.map((m) => (
<MenuItem
key={m.id}
classes={{
root: classes.selectMenuItem,
selected: classes.selectMenuItemSelected,
}}
value={m.id}
>
{m.legalName}
</MenuItem>
                          }]}
</Select>
{!!errors.defaultMerchantId.length && (
<FormHelperText
error={errors.defaultMerchantId.length !== 0}
>
{errors.defaultMerchantId}
</FormHelperText>
                        ]}
</FormControl>
</GridItem>
</GridContainer>
</CardBody>
</Card>

<Card>
<CardHeader color="cuna1" text>
<CardText> color="cuna1">
<h4 className={classes.cardTitle}>Tenant Integrations</h4>
</CardText>
</CardHeader>
</CardBody>
<SCTenantIntegrationWrapper>
<SCDynamicSegment>
                      fieldGroups={TenantIntegrations}
                      handleNavigation={()=> {}}
                      readonly={false}
                      contextData={{}}
                      formData={{ ...newTenant }}
                      mode={DisplayMode.LIGHT}
formLayoutColumns={3}
validationErrors={errors}
validateAllFields={false}
style={{}}
onError={() => {}}
handleInputChange={setField}
                    [>
</SCTenantIntegrationWrapper>
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
display: isStatusDraft ? 'inline' : 'none',
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

export default CreditUnionCreate;
