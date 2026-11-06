import { makeStyles } from '@material-ui/core/styles';
import styles from 'assets/jss/material-dashboard-pro-react/views/regularFormsStyle';
import Card from 'components/Card/Card';
import CardBody from 'components/Card/CardBody';
import CardHeader from 'components/Card/CardHeader';
import CardText from 'components/Card/CardText';
import FullPageStatus from 'components/FullPageStatus/FullPageStatus';
import GridContainer from 'components/Grid/GridContainer';
import GridItem from 'components/Grid/GridItem';
import { useAppContext } from 'context/app-context';
import { getFormattedAddresses } from 'helpers/addresshelper';
import { DateTime } from 'luxon';
import React from 'react';
import { client2 } from 'utils/api-client';
import { isEmptyString } from '../../helpers/validations';
import CustomFormLabel from '../CustomFormLabel/CustomFormLabel';
import { useParams } from 'react-router-dom';

const useStyles = makeStyles(styles);

const fixDateString = async (dateString, setter) => {
const formattedDate = (await isEmptyString.isValid(dateString))
    ?--
: DateTime.fromISO(dateString).toFormat('MM/dd/yyyy');

  setter(formattedDate);
};

const fixMerchantType = (type) => {
switch (type) {
case 1:
return 'Credit Union';
case 2:
return 'Auto Dealer';
default:
return type;
}
};

export default function ViewMerchant() {
const params = useParams();
const merchantId = params.merchantId;
const { tenant, setDisplayCreateButton, setPageTitle } = useAppContext();
const [data, setData] = React.useState();
const [loading, setLoading] = React.useState(true);
const [errorResponse, setErrorResponse] = React.useState(null);
const classes = useStyles();

  const [formattedStartDate, setFormattedStartDate] = React.useState(null);
const [formattedEndDate, setFormattedEndDate] = React.useState(null);
const titleList = new Map();

  React.useEffect(() => {
setLoading(true);
//Remove this and make actual service call...
//const [merchant] = new FakeMerchants().findMerchant(merchantId)
//setData(merchant)
//setLoading(false);
client2(
`${process.env.REACT_APP_MERCHANT_API_BASE_URL}/merchants/${merchantId}`,
    ]
.then((data) => {
console.log(data);
const merchantName = data.payload.legalName;
if (tenant)
titleList.set(
`${tenant?.legalName} > `,
`/admin/tenant/${tenant?.id}/view`,
          };
titleList.set(`Merchants > `, `/admin/tenant/${tenant?.id}/merchant`);
titleList.set(
merchantName,
`/admin/tenant/${tenant?.id}/merchant/${merchantId}/view`,
        };
setPageTitle(titleList);
setData(data.payload);
setLoading(false);

        if (data.payload.startDate) {
fixDateString(data.payload.startDate, setFormattedStartDate);
}

        if (data.payload.endDate) {
fixDateString(data.payload.endDate, setFormattedEndDate);
}
      }]
.catch((error) => {
setLoading(false);
setErrorResponse(error);
      }];
}, []);

  setDisplayCreateButton(false);

  if (loading || errorResponse || !data) {
return <FullPageStatus errorResponse={errorResponse} />;
}

  return (
<GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={6}>
<GridContainer>
<GridItem xs={12} sm={12} md={12}>
<Card>
<CardHeader color="cuna1" text>
<CardText color="cuna1">
<h4 className={classes.cardTitle}>Merchant Information</h4>
</CardText>
</CardHeader>
<CardBody style={{ marginTop: '-40px' }}>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewMerchant"
label="Legal Name"
                      [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
id="merchant-legal-name"
className={classes.staticFormControl}
>
{data.legalName}
</p>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewMerchant"
label="Postal Name"
                      [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<div
id="postalName_div"
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
id="merchant-postal-name"
className={classes.staticFormControl}
>
{data.postalName ? data.postalName : data.legalName}
</p>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewMerchant"
label="Branch Number"
                      [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<div
id="branchNumber_div"
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
id="merchant-branch-number"
className={classes.staticFormControl}
>
{data.branchNumber
? data.branchNumber
: data.branchNumber}
</p>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewMerchant"
label="Phone Number"
                      [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
id="merchant-phone-number"
className={classes.staticFormControl}
>
{data.phoneNumber}
</p>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewMerchant"
label="CUIC Customer Number"
                      [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
id="merchant-cuic-cust-number"
className={classes.staticFormControl}
>
{data.cuicCustomerNumber}
</p>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewMerchant"
label="Type"
                      [>
</GridItem>
<GridItem xs={12} sm={10} md={6}>
<div
id="merchantType_div"
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
id="merchant-type"
className={classes.staticFormControl}
>
{fixMerchantType(data.merchantTypeId)}
</p>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewMerchant"
label="Start Date"
                      [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
id="merchant-start-date"
className={classes.staticFormControl}
>
{formattedStartDate ? formattedStartDate : ''}
</p>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={2} md={4}>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewMerchant"
label="End Date"
                      [>
</GridItem>
<GridItem xs={12} sm={10} md={7}>
<div
id="endDate_div"
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
id="merchant-end-date"
className={classes.staticFormControl}
>
{formattedEndDate ? formattedEndDate : ''}
</p>
</div>
</GridItem>
</GridContainer>
</CardBody>
</Card>
</GridItem>
</GridContainer>
</GridItem>
<GridItem xs={12} sm={2} md={6}>
<GridContainer>
<GridItem xs={12} sm={12} md={12}>
<Card>
<CardHeader color="cuna1" text>
<CardText color="cuna1">
<h4 className={classes.cardTitle}>Status</h4>
</CardText>
</CardHeader>
<CardBody style={{ marginTop: '-40px' }}>
<GridContainer>
<GridItem xs={12} sm={4} md={4}>
<CustomFormLabel
className={classes.viewlabelHorizontal}
styleType="viewMerchant"
label="System Status"
                      [>
</GridItem>
<GridItem xs={12} sm={4} md={4}>
<div
style={{ paddingTop: '24px' }}
className={classes.staticFormGroup}
>
<p
id="merchant-record-state"
className={classes.staticFormControl}
>
{data.recordState}
</p>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={4} md={4}>
<CustomFormLabel
styleType="viewMerchantStatus"
className={classes.viewlabelHorizontal}
label="Legal Status"
                      [>
</GridItem>
<GridItem xs={12} sm={8} md={5}>
<div className={classes.staticFormGroup}>
<p
id="merchant-legal-status"
className={classes.staticFormControl}
>
{data.legalStatus}
</p>
</div>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} sm={4} md={4}>
<CustomFormLabel
styleType="viewMerchantStatus"
className={classes.viewlabelHorizontal}
label="Operational Status"
                      [>
</GridItem>
<GridItem xs={12} sm={8} md={5}>
<div
id="operationalStatus_div"
className={classes.staticFormGroup}
>
<p
id="merchant-operational-status"
className={classes.staticFormControl}
>
{data.operationalStatus}
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
<CardBody style={{ marginTop: '-20px' }}>
<div>{getFormattedAddresses(data.addresses, classes)}</div>
</CardBody>
</Card>
</GridItem>
</GridContainer>
</GridItem>
</GridContainer>
</GridContainer>
  ];
}
