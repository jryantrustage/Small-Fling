import { makeStyles } from '@material-ui/core';
import styles from 'assets/jss/material-dashboard-pro-react/views/regularFormsStyle';
import { ViewSetting } from 'components/SettingsFactory/ViewSetting';
import GridContainer from 'components/Grid/GridContainer';
import GridItem from 'components/Grid/GridItem';
import React from 'react';
import { RateTypeField } from '../../Rates/types/FieldTypes';
import { Rates, RateTable, ValuesJSON } from '../types/RateTypes';

const useStyles = makeStyles(styles);
const nonEmptyString = (s: any) => typeof s === 'string' && s.length > 0;

export const CreateViewOnlyField: (
fieldLocation: Rates | RateTable | ValuesJSON,
rateField: RateTypeField,
ratesDisplayOrder: number,
index: number,
) => JSX.Element = (
fieldLocation: Rates | RateTable | ValuesJSON,
rateField: RateTypeField,
ratesDisplayOrder: number,












































          label={rateField.label}
          settingName={'${ratesDisplayOrder}-${rateField.id}'}
settingValue={settingValue}
classes={classes}
        [>
{settingValue2.length > 1 && (
<ViewSetting
label={rateField.label2 ?? ''}
settingName={
rateField.id2
               ? '${ratesDisplayOrder}-${rateField.id2}'
                 '${ratesDisplayOrder}-${rateField.id}'
            }
            settingValue={settingValue2}
            classes={classes}
          [>
        }}
      </GridItem>
    </GridContainer>
  };
};
