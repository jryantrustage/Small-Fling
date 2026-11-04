import { Checkbox, FormControlLabel } from '@material-ui/core';
import { makeStyles } from '@material-ui/styles';
import styles from 'assets/jss/material-dashboard-pro-react/views/regularFormsStyle';
import CustomFormLabel from 'components/CustomFormLabel/CustomFormLabel';
import CustomInput from 'components/CustomInput/CustomInput';
import GridContainer from 'components/Grid/GridContainer';
import GridItem from 'components/Grid/GridItem';
import React from 'react';
import { Rates } from '../../Rates/types/RateTypes';
import { CustomFieldComponentParams } from '../types/FieldTypes';

const useStyles = makeStyles(styles);

export const ModelYearRangeEndInput: CustomFieldComponentParams = (
ratesDisplayOrder: number,
rates: Rates,
fieldErrorState: { [key: string]: { isInvalid: boolean; message: string } },






















<GridItem xs={6} lg={6}>
<CustomFormLabel
className={classes.labelHorizontal}
styleType="rates"
required={true}
label="Model Year Range End"
error={
fieldErrorState[
`${ratesDisplayOrder}-modelYearEnd-${tableId}-input`
] &&
fieldErrorState[
`${ratesDisplayOrder}-modelYearEnd-${tableId}-input`
].isInvalid
}
        [>
</GridItem>
<GridItem xs={4} lg={3}>
<CustomInput
id={`${ratesDisplayOrder}-modelYearEnd-${tableId}-input`}
error={
fieldErrorState[
`${ratesDisplayOrder}-modelYearEnd-${tableId}-input`
] &&
            fieldErrorState
              '${ratesDisplayOrder}-modelYearEnd-${tableId}-input'
            J.isInvalid
          }
          formControlProps={{
            fullwidth: true,
            style: {
              paddingTop: 'Opx',
              paddingBottom: 'Opx',
            },
          }}
          inputProps={{
            value:
              rateTable && rateTable.modelYearEnd ? rateTable.modelYearEnd : -'',
            disabled: !!tableId && !!rateTable && rateTable.andolder,
            type: 'text',
            onChange: (event: any) => {
              const value = event.target.value;
              if(tableId){
                updateTableFields(tableId,[['modelYearEnd', value]]);
                validateChange(event, ratesDisplayOrder, null, tableId);











































                   null,
                   tableId,
                  ];
}
}}
value="andOlder"
classes={{
checked: classes.checked,
}}
            [>
}
label="And Older"
        [>
</GridItem>
</GridContainer>
  };
};

ModelYearRangeEndInput.displayName = 'ModelYearRangeEndInput';
