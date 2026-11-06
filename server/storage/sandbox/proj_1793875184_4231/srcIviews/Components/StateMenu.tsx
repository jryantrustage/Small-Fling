import MenuItem from '@material-ui/core/MenuItem';
import Select from '@material-ui/core/Select';
import { makeStyles } from '@material-ui/core/styles';
import styles from 'assets/jss/material-dashboard-pro-react/views/regularFormsStyle';
import { Address } from 'components/ManageTenant/base-tenant';
import React from 'react';
import * as validation from '../CreateTenant/validate-create-tenant';

const useStyles = makeStyles(styles);

interface StateMenuProps {
addType: 'physical' | 'mailing';
data: Address;
handleChange: (event: any, addressType: string) => void;
setErrorField: (k: string, v: Error) => void;
}

export default function StateMenu(props: StateMenuProps): JSX.Element {
const classes = useStyles();
const { addType, data, handleChange, setErrorField } = props;

  const states = [
['Alabama', 'AL'],
['Alaska', 'AK'],
['Arizona', 'AZ'],
['Arkansas', 'AR'],
['California', 'CA'],
['Colorado', 'CO'],
['Connecticut', 'CT'],
['Washington DC', 'DC'],
['Delaware', 'DE'],
['Florida', 'FL'],
['Georgia', 'GA'],
['Hawaii', 'HI'],
['Idaho', 'ID'],
['Illinois', 'IL'],
['Indiana', 'IN'],
['Iowa', 'IA'],
['Kansas', 'KS'],
['Kentucky', 'KY'],
['Louisiana', 'LA'],
['Maine', 'ME'],
['Maryland', 'MD'],
['Massachusetts', 'MA'],
['Michigan', 'MI'],
['Minnesota', 'MN'],
['Mississippi', 'MS'],
['Missouri', 'MO'],
['Montana', 'MT'],
['Nebraska', 'NE'],
['Nevada', 'NV'],
['New Hampshire', 'NH'],
['New Jersey', 'NJ'],
['New Mexico', 'NM'],
['New York', 'NY'],
['North Carolina', 'NC'],
['North Dakota', 'ND'],
['Ohio', 'OH'],
['Oklahoma', 'OK'],
['Oregon', 'OR'],
['Pennsylvania', 'PA'],
['Rhode Island', 'RI'],
['South Carolina', 'SC'],
['South Dakota', 'SD'],
['Tennessee', 'TN'],
['Texas', 'TX'],
['Utah', 'UT'],
['Vermont', 'VT'],
['Virginia', 'VA'],
['Washington', 'WA'],
['West Virginia', 'WV'],
['Wisconsin', 'WI'],
['Wyoming', 'WY'],
];

  const listItems = states.map((ar) => {
return (
<MenuItem
key={ar[1]}
classes={{
root: classes.selectMenuItem,
selected: classes.selectMenuItemSelected,
}}
value={ar[1]}
>
{ar[0]}
</MenuItem>
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
value={data.addState}
onChange={(
event: React.ChangeEvent<{
name?: string | undefined;
value: unknown;
}>,
): void => {
handleChange(event, `${addType}Address`);
validation.validateAddressState(
false,
addType,
event.target.value,
setErrorField,
        };
}}
id="addState"
inputProps={{
name: 'addState',
id: 'addState',
}}
>
<MenuItem
disabled
classes={{
root: classes.selectMenuItem,
}}
>
Choose State
</MenuItem>
{listItems}
</Select>
  ];
}
