import React, { useState, useEffect, ReactElement } from 'react';
import { useAppContext } from 'context/app-context';
import { Table, ICON_TYPES, Icon } from 'commonui';
import { SCHeader, SCActions, SCActionButton } from '../TableStyles';
import { client2 } from 'utils/api-client';
import FullPageStatus from 'components/FullPageStatus/FullPageStatus';
import GridContainer from 'components/Grid/GridContainer';
import GridItem from 'components/Grid/GridItem';
import Card from 'components/Card/Card';
import CardHeader from 'components/Card/CardHeader';
import CardText from 'components/Card/CardText';
import CardBody from 'components/Card/CardBody';
import { SCUtilityInput } from 'commonui';
import Button from 'components/CustomButtons/Button';
import { v4 as uuid } from 'uuid';

interface SmsAllowType {
Phone_Number?: string;
Formatted_Phone_Number?: string;
}

interface FormattedData extends Record<string, any> {
id: string;
}

export const SmsAllowlist = (): ReactElement => {
const [smsAllowTypes, setsmsAllowTypes] = useState<SmsAllowType[]>([]);
const [loading, setLoading] = useState(true);
const [errorResponse, setErrorResponse] = useState(null);
const [phoneNumber, setPhoneNumber] = useState('');
const [pageError, setPageError] = useState('');

  const { setPageTitle, setDisplayCreateButton } = useAppContext();

  useEffect(() => {
setDisplayCreateButton(false);
setPageTitle('Sms Allowlist');
setLoading(true);

    const smsAllowList: SmsAllowType[] = [];

    client2(
`${process.env.REACT_APP_COMMUNICATIONS_API_BASE_URL}sms-allow-list`,
'GET',
{
headers: {
'x-correlation-id': uuid(),
},
},
    ]
.then((data) => {
data.forEach((smsPhoneNumber: SmsAllowType) => {
smsPhoneNumber.Formatted_Phone_Number = formatPhoneNumber(
smsPhoneNumber.Phone_Number,
          };
smsAllowList.push(smsPhoneNumber);
        }];
setsmsAllowTypes(smsAllowList);
setLoading(false);
      }]
.catch((error) => {
console.log(error);
setErrorResponse(error);
setLoading(false);
      }];
}, []);

  function formatPhoneNumber(phoneNumberString: string | undefined) {
const cleaned = ('' + phoneNumberString).replace(/\D/g, '');
const match = cleaned.match(/^(1|)?(\d{3})(\d{3})(\d{4})$/);
if (match) {
const intlCode = match[1] ? '1 ' : '';
return [intlCode, '', match[2], '-', match[3], '-', match[4]].join('');
}
return phoneNumberString;
}

  const formatData = (): FormattedData[] =>
smsAllowTypes.map(({ Formatted_Phone_Number, Phone_Number }, index) => ({
id: `${Phone_Number}-${index}`,
Formatted_Phone_Number,
actions: (
<SCActions id={`${Phone_Number}-${index}`}>
<SCActionButton
title="Delete Phone Number"
id={`${name}_view`}
aria-label={`DeletePhoneNumber-${index}`}
color="red"
onClick={() => {
removeSmsAllowlistPhoneNumber(`${Phone_Number}`);
}}
>
<Icon size={14} name={ICON_TYPES.SMALL_RED_X} />
</SCActionButton>
</SCActions>
      ],
    }}];

  const removeSmsAllowlistPhoneNumber = async (
phoneNumber: string,
): Promise<void> => {
const uri = `${process.env.REACT_APP_COMMUNICATIONS_API_BASE_URL}sms-allow-list`;
const method = 'DELETE';
const payload = {
Phone_Number: phoneNumber,
};

    const config = {
headers: {
'x-correlation-id': uuid(),
},
body: payload,
};

    try {
await client2(uri, method, config);
location.reload();
} catch (error) {
setPageError('Error deleting phone number.');
if (error instanceof Error) {
if (JSON.parse(error?.message).ResponseMessage != undefined) {
setPageError(JSON.parse(error?.message).ResponseMessage);
console.error(JSON.parse(error?.message).ResponseMessage);
}
}
}
};

  const addSmsAllowlistPhoneNumber = async (): Promise<void> => {
const uri = `${process.env.REACT_APP_COMMUNICATIONS_API_BASE_URL}sms-allow-list`;
const method = 'POST';

    const payload = {
Phone_Number: phoneNumber,
};

    const config = {
headers: {
'x-correlation-id': uuid(),
},
body: payload,
};

    try {
await client2(uri, method, config);
location.reload();
} catch (error) {
setPageError('Error adding phone number.');
if (error instanceof Error) {
if (JSON.parse(error?.message).ResponseMessage != undefined) {
setPageError(JSON.parse(error?.message).ResponseMessage);
console.error(JSON.parse(error?.message).ResponseMessage);
}
}
}
};

  const staticColumn = {
filterable: false,
sortable: false,
};
const formattedData = formatData();
return (
    >>
<GridContainer role="sms-allowlist-container">
<GridItem xs={10}>
<Card>
<CardHeader color="cuna1" text>
<CardText color="cuna1">
<h4>Add Phone Number</h4>
</CardText>
</CardHeader>
<CardBody>
<GridContainer style={{ marginBottom: '20px' }}>
<GridItem
xs={2}
                  1g={3}
style={{ display: 'flex', alignItems: 'center' }}
>
<SCUtilityInput
name="Phone_Number"
aria-label="PhoneNumber"
onChange={(
e: React.ChangeEvent<HTMLInputElement>,
): void => {
const value = e.target.value;
setPhoneNumber(value);
}}
></SCUtilityInput>
</GridItem>
<GridItem style={{ display: 'flex', alignItems: 'center' }}>
<Button
id="create-sms-allowlist-save"
name="create-sms-allowlist-save"
color="success"
onClick={() => addSmsAllowlistPhoneNumber()}
>
Save
</Button>
<label style={{ color: 'red', marginLeft: '20px' }}>
{pageError}
</label>
</GridItem>
<GridItem
xs={2}
                  1g={3}
style={{ display: 'flex', alignItems: 'center' }}
></GridItem>
</GridContainer>
</CardBody>
</Card>
</GridItem>
</GridContainer>
<GridContainer role="smsallowlist-container">
<GridItem xs={10}>
<Card>
<CardHeader color="cuna1" text>
<CardText color="cuna1">
<h4>SMS Allowlist</h4>
</CardText>
</CardHeader>
<CardBody>
<Table
data={formattedData}
filterable
sortable
minRows={0}
pageSize={25}
columns={[
{
Header: <SCHeader> SMS Allow Phone Number </SCHeader>,
accessor: 'Formatted_Phone_Number',
filterable: true,
},
{
...staticColumn,
Header: '',
accessor: 'actions',
},
]}
showPaginationTop={false}
showPaginationBottom={true}
className="-highlight"
/>

              {(loading || errorResponse) && (
<FullPageStatus errorResponse={errorResponse} />
              }}
</CardBody>
</Card>
</GridItem>
</GridContainer>
</>
  ];
};
