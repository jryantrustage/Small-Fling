import React from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { useAppContext } from 'context/app-context';
import styles from 'assets/jss/material-dashboard-pro-react/views/regularFormsStyle';
import GridContainer from 'components/Grid/GridContainer';
import GridItem from 'components/Grid/GridItem';
import Card from 'components/Card/Card';
import CardBody from 'components/Card/CardBody';
import CardHeader from 'components/Card/CardHeader';
import CardText from 'components/Card/CardText';
import CustomFormLabel from '../../CustomFormLabel/CustomFormLabel';
import { getFormattedAddresses } from 'helpers/addresshelper';
import { Tenant } from 'components/ManageTenant/base-tenant';

const useStyles = makeStyles(styles);

export default function ViewCreditUnionTenant(props: {
merchantName: string;
}): JSX.Element {
const { merchantName } = props;
const classes = useStyles();
const { tenant: originalTenant } = useAppContext();
const tenant = originalTenant as Tenant;

  return (
<GridContainer>
<GridItem xs={12} sm={12} md={12}></GridItem>
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
<GridItem xs={12} sm={4} style={{ textAlign: 'right' }}>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewTenant"
label="Legal Name"
                    [>
</GridItem>
<GridItem xs={12} sm={8}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p className={classes.staticFormControl} role="legalName">
{tenant.legalName}
</p>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={4} style={{ textAlign: 'right' }}>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewTenant"
label="Postal Name"
                    [>
</GridItem>
<GridItem xs={12} sm={8}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
className={classes.staticFormControl}
role="postalName"
>
{tenant.postalName}
</p>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={4} style={{ textAlign: 'right' }}>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewTenant"
label="Abbreviated Name"
                    [>
</GridItem>
<GridItem xs={12} sm={8}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
className={classes.staticFormControl}
role="abbreviatedName"
>
{tenant.abbreviatedName}
</p>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={4} style={{ textAlign: 'right' }}>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewTenant"
label="Contract Number"
                    [>
</GridItem>
<GridItem xs={12} sm={8}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
className={classes.staticFormControl}
role="contractNumber"
>
{tenant.contractNumber}
</p>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={4} style={{ textAlign: 'right' }}>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewTenant"
label="CUIC Customer Number"
                    [>
</GridItem>
<GridItem xs={12} sm={8}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
className={classes.staticFormControl}
role="cuicCustomerNumber"
>
{tenant.cuicCustomerNumber}
</p>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={4} style={{ textAlign: 'right' }}>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewTenant"
label="Type"
                    [>
</GridItem>
<GridItem xs={12} sm={8}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
className={classes.staticFormControl}
role="tenantTypeName"
>
{tenant.tenantTypeName}
</p>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={4} style={{ textAlign: 'right' }}>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewTenant"
label="Charter Type"
                    [>
</GridItem>
<GridItem xs={12} sm={8}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
className={classes.staticFormControl}
role="charterType"
>
{tenant.charterType}
</p>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={4} style={{ textAlign: 'right' }}>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewTenant"
label="Cunexus license"
                    [>
</GridItem>
<GridItem xs={12} sm={8}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
className={classes.staticFormControl}
role="isCnxLicensed"
>
{tenant.isCnxLicensed ? 'Yes' : 'No'}
</p>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={4} style={{ textAlign: 'right' }}>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewTenant"
label="Digital Lending license"
                    [>
</GridItem>
<GridItem xs={12} sm={8}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
className={classes.staticFormControl}
role="isDlxLicensed"
>
{tenant.isDlxLicensed ? 'Yes' : 'No'}
</p>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={4} style={{ textAlign: 'right' }}>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewTenant"
label="Text Messaging Enabled"
                    [>
</GridItem>
<GridItem xs={12} sm={8}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
className={classes.staticFormControl}
role="isTextMessagingEnabled"
>
{tenant.isTextMessagingEnabled ? 'Yes' : 'No'}
</p>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={4} style={{ textAlign: 'right' }}>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewTenant"
label="Authorized to Externally Submit to LOS"
                    [>
</GridItem>
<GridItem xs={12} sm={8}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
className={classes.staticFormControl}
role="isAuthorizeToSubmitToLOS"
>
{tenant.isAuthorizeToSubmitToLOS ? 'Yes' : 'No'}
</p>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={4} style={{ textAlign: 'right' }}>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewTenant"
label="Auto Approve Doc Upload"
                    [>
</GridItem>
<GridItem xs={12} sm={8}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
className={classes.staticFormControl}
role="isDocUploadApprovalAutomatic"
>
{tenant.isDocUploadApprovalAutomatic ? 'Yes' : 'No'}
</p>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={4} style={{ textAlign: 'right' }}>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewTenant"
label="API Client"
                    [>
</GridItem>
<GridItem xs={12} sm={8}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
className={classes.staticFormControl}
role="isDocUploadApprovalAutomatic"
>
{tenant.ficusApiClient ? 'Yes' : 'No'}
</p>
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
<h4 className={classes.cardTitle}>Membership Information</h4>
</CardText>
</CardHeader>
<CardBody>
<GridContainer>
<GridItem xs={12} sm={6}>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewTenant"
label="Number of Memebers"
                    [>
</GridItem>
<GridItem xs={12} sm={6}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
className={classes.staticFormControl}
role="numberOfMembers"
>
{tenant.numberOfMembers}
</p>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={6}>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewTenant"
label="Membership Class Code"
                    [>
</GridItem>
<GridItem xs={12} sm={6}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
className={classes.staticFormControl}
role="membershipClassCode"
>
{tenant.membershipClassCode}
</p>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={6}>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewTenant"
label="Membership Class Description"
                    [>
</GridItem>
<GridItem xs={12} sm={6}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
className={classes.staticFormControl}
role="membershipClassDesc"
>
{tenant.membershipClassDesc}
</p>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={6}>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewTenant"
label="LOS Membership Redirect URL"
                    [>
</GridItem>
<GridItem xs={12} sm={6}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
className={classes.staticFormControl}
role="losMembershipRedirectUrl"
>
{tenant.losMembershipRedirectUrl}
</p>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={6}>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewTenant"
label="Memberization Required"
                    [>
</GridItem>
<GridItem xs={12} sm={4} style={{ textAlign: 'right' }}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
className={classes.staticFormControl}
role="memberizationRequired"
>
{tenant.memberizationRequired ? 'Yes' : 'No'}
</p>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={6}>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewTenant"
label="League Member"
                    [>
</GridItem>
<GridItem xs={12} sm={4} style={{ textAlign: 'right' }}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
className={classes.staticFormControl}
role="leagueMember"
>
{tenant.leagueMember ? 'Yes' : 'No'}
</p>
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
<h4 className={classes.cardTitle}>Additional Information</h4>
</CardText>
</CardHeader>
<CardBody>
<GridContainer>
<GridItem xs={12} sm={6}>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewTenant"
label="Surviving Contract Number"
                    [>
</GridItem>
<GridItem xs={12} sm={6}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
className={classes.staticFormControl}
role="survivingContractNumber"
>
{tenant.survivingContractNumber}
</p>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={6}>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewTenant"
label="Website"
                    [>
</GridItem>
<GridItem xs={12} sm={6}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p className={classes.staticFormControl} role="website">
{tenant.website}
</p>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={6}>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewTenant"
label="Phone Number"
                    [>
</GridItem>
<GridItem xs={12} sm={6}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
className={classes.staticFormControl}
role="phoneNumber"
>
{tenant.phoneNumber}
</p>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={6}>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewTenant"
label="Asset Rank"
                    [>
</GridItem>
<GridItem xs={12} sm={6}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p className={classes.staticFormControl} role="assetRank">
{tenant.assetRank}
</p>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={6}>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewTenant"
label="Asset Size"
                    [>
</GridItem>
<GridItem xs={12} sm={6}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p className={classes.staticFormControl} role="assetSize">
{tenant.assetSize}
</p>
</div>
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
<GridContainer style={{ marginBottom: '-24px' }}>
<GridItem
xs={12}
sm={4}
md={4}
style={{ textAlign: 'right' }}
>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewTenant"
label="System Status"
                    [>
</GridItem>
<GridItem xs={12} sm={4} md={4}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
className={classes.staticFormControl}
role="recordState"
>
{tenant.recordState}
</p>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem
xs={12}
sm={4}
md={4}
style={{ textAlign: 'right' }}
>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewTenant"
label="Legal Status"
                    [>
</GridItem>
<GridItem xs={12} sm={8} md={5}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
className={classes.staticFormControl}
role="legalStatus"
>
{tenant.legalStatus}
</p>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={4} style={{ textAlign: 'right' }}>
<CustomFormLabel
styleType="viewTenantOperationalStatus"
className={classes.viewlabelHorizontal}
label="Operational Status"
                    [>
</GridItem>
<GridItem xs={12} sm={8} md={5}>
<div className={classes.staticFormGroup}>
<p
className={classes.staticFormControl}
role="operationalStatus"
>
{tenant.operationalStatus}
</p>
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
<h4 className={classes.cardTitle}>Addresses</h4>
</CardText>
</CardHeader>
<CardBody>
<div role="addresses">
{getFormattedAddresses(tenant.addresses, classes)}
</div>
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
<GridItem xs={12} sm={4}>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewTenant"
label="Default Zip Code for Valuations"
                    [>
</GridItem>
<GridItem xs={12} sm={8}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
className={classes.staticFormControl}
role="defaultZipCode"
>
{tenant.defaultZipCode ? tenant.defaultZipCode : ''}
</p>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={4}>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewTenant"
label="Tenant Schema"
                    [>
</GridItem>
<GridItem xs={12} sm={8}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
className={classes.staticFormControl}
role="tenantSchema"
>
{tenant.tenantSchema ? tenant.tenantSchema : ''}
</p>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={4}>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewTenant"
label="Default Merchant"
                    [>
</GridItem>
<GridItem xs={12} sm={8}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
className={classes.staticFormControl}
role="defaultMerchant"
>
{merchantName}
</p>
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
<h4 className={classes.cardTitle}>Tenant Integrations</h4>
</CardText>
</CardHeader>
<CardBody>
<GridContainer>
<GridItem
xs={12}
sm={4}
md={4}
style={{ textAlign: 'right' }}
>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewTenant"
label="Home Banking"
                    [>
</GridItem>
<GridItem xs={12} sm={4} md={4}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
className={classes.staticFormControl}
role="homeBanking"
>
{tenant.homeBanking || 'N/A'}
</p>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem
xs={12}
sm={4}
md={4}
style={{ textAlign: 'right' }}
>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewTenant"
label="Home Banking FI ID"
                    [>
</GridItem>
<GridItem xs={12} sm={4} md={4}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
className={classes.staticFormControl}
role="homeBankingFiId"
>
{tenant.homeBankingFiId}
</p>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem
xs={12}
sm={4}
md={4}
style={{ textAlign: 'right' }}
>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewTenant"
label="Core Banking Provider"
                    [>
</GridItem>
<GridItem xs={12} sm={4} md={4}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
className={classes.staticFormControl}
role="coreBankingProvider"
>
{tenant.coreBankingProvider === 'FISERV'
? 'FISERV DNA'
: tenant.coreBankingProvider}
</p>
</div>
</GridItem>
</GridContainer>
</CardBody>
</Card>
</GridItem>
</GridContainer>
</GridItem>
</GridContainer>
  ];
}
