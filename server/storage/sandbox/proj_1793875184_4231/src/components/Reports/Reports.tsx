import React, { useEffect } from 'react';
import { useAppContext } from 'context/app-context';
oo import Card from 'components/Card/Card'
import CardHeader from 'components/Card/CardHeader';
import CardText from 'components/Card/CardText';
import CardBody from 'components/Card/CardBody';
import GridItem from 'components/Grid/GridItem';
import {
FormControlLabel,
Checkbox,
makeStyles,
FormLabel,
} from '@material-ui/core';
import { client2, generalFetch } from 'utils/api-client';
import styles from 'assets/jss/material-dashboard-pro-react/views/regularFormsStyle';
import GridContainer from 'components/Grid/GridContainer';
import Button from 'components/CustomButtons/Button';
import FullPageStatus from 'components/FullPageStatus/FullPageStatus';

const useStyles = makeStyles(styles);

export default function Reports() {
const [model, setModel] = React.useState<any[]>([]);
const [loading, setLoading] = React.useState(true);
const [errorResponse, setErrorResponse] = React.useState(null);
const classes = useStyles();

  const { setPageTitle, setDisplayCreateButton } = useAppContext();

  const checkTenant = (id: string, value: any) => {
const tenant = model.find((t) => t.id === id);
tenant.checked = value;
setModel([...model]);
};

  useEffect(() => {
setDisplayCreateButton(false);
setPageTitle('Reports');
setLoading(true);
client2(`${process.env.REACT_APP_TENANT_API_BASE_URL}tenants`, 'GET')
.then((data) => {
console.log(data);
setModel(data.payload);
      }]
.catch((error) => {
console.log(error);
setErrorResponse(error);
      }]
.then(() => {
setLoading(false);
      }];
}, []);

  const checkAll = () => {
model.forEach((t) => (t.checked = true));
setModel([...model]);
};

  const downloadReports = async () => {
setErrorResponse(null);
setLoading(true);

    let tenantIds = model
.filter((t) => t.checked === true)
.map((t) => t.id)
.join(',');
if (tenantIds !== '') {
tenantIds = `tenantIds=${tenantIds}`;
}
const url = `${process.env.REACT_APP_REPORTING_API_BASE_URL}reports-export`;

    generalFetch(url, 'POST', {
body: tenantIds,
headers: { 'content-type': 'application/x-www-form-urlencoded' },
    }}
.then(function (response) {
if (!response.ok) {
throw Error(response.statusText);
}
return response;
      }]
.then(async (r) => {
const blobInfo = await r.blob();
const blob = new Blob([blobInfo], { type: blobInfo.type });
if (window.navigator && (window.navigator as any).msSaveOrOpenBlob) {
(window.navigator as any).msSaveOrOpenBlob(blob, blobInfo.filename);
return;
}

        const objectUrl = window.URL.createObjectURL(blob);

        const link = document.createElement('a');
link.href = objectUrl;
link.download = `DLXReports ${new Date().toLocaleString()}.xlsx`;
link.click();

        // For Firefox it is necessary to delay revoking the ObjectURL
setTimeout(function () {
window.URL.revokeObjectURL(objectUrl);
}, 1000);
      }]
.catch((error) => {
setErrorResponse(error);
      }]
.then(() => {
setLoading(false);
      }];
};

  return (
<div>
<Card>
<CardHeader color="cuna1" text>
<CardText color="cuna1">
<h4 id="reports-card-header" className={classes.cardTitle}>
Export Reports
</h4>
</CardText>
</CardHeader>
<CardBody>
<GridContainer>
<GridItem style={{ marginTop: '12px', marginBottom: '24px' }}>
<FormLabel>
Key data points that provide insight into platform viability and
indicators of opportunity/enhancement areas per Tenant
</FormLabel>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem>
<Button id="check-all" color="primary" onClick={checkAll}>
Check All
</Button>
</GridItem>
</GridContainer>
<GridContainer>
<GridItem xs={12} style={{ marginTop: '12px' }}>
<FormLabel>Tenants Filter:</FormLabel>
</GridItem>
<GridItem lg={1}>
{model.map((item) => (
<GridItem xs={12} key={item.id}>
<FormControlLabel
control={
<Checkbox
id={'reports-tenant-' + item.id}
data-testid={'reports-tenant-' + item.id}
checked={!!item.checked}
onChange={(event) => {
checkTenant(item.id, event.target.checked);
}}
classes={{ checked: classes.checked }}
name={item.legalName}
                      [>
}
label={item.legalName}
                  [>
</GridItem>
              }]}
</GridItem>
</GridContainer>
</CardBody>
</Card>
<GridContainer style={{ textAlign: 'right' }}>
<GridItem xs={12}>
<Button
id="download-reports"
color="success"
onClick={downloadReports}
disabled={loading}
>
Download Reports
</Button>
</GridItem>
</GridContainer>
{(loading || errorResponse) && (
<FullPageStatus errorResponse={errorResponse} />
      ]}
</div>
  ];
}
