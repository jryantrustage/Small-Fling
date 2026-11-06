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
import { Tenant } from 'components/ManageTenant/base-tenant';

const useStyles = makeStyles(styles);

export default function ViewApiClient(): JSX.Element {
const classes = useStyles();
const { tenant: tenantData } = useAppContext();

  const tenant = tenantData as Tenant;
return (
<GridContainer>
<GridItem xs={12} sm={12} md={12}></GridItem>
<GridItem xs={12} sm={6}>
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
label="Tenant Type"
                    [>
</GridItem>
<GridItem xs={12} sm={8}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
className={classes.staticFormControl}
role="tenantType"
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
label="Contact Name"
                    [>
</GridItem>
<GridItem xs={12} sm={8}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
className={classes.staticFormControl}
role="ContactName"
>
{tenant.apiContactName}
</p>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={4} style={{ textAlign: 'right' }}>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewTenant"
label="Contact Email"
                    [>
</GridItem>
<GridItem xs={12} sm={8}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
className={classes.staticFormControl}
role="ContactName"
>
{tenant.apiContactEmail}
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
</CardBody>
</Card>
</GridItem>
</GridContainer>
</GridItem>
</GridContainer>
  ];
}
