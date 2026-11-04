import React from 'react';
import { FunctionComponent } from 'react';
import CustomSectionField from '../types/CustomSectionField';
import { ViewMode } from '../types';
import * as utils from '../utils';
import DimensionedCustomSection from '../DimensionedCustomSection';
import { RATES_TYPE_NON_AUTO } from './../../constants/RateTypes';

const fields: CustomSectionField[] = [
{
type: 'textarea',
id: 'aprDisclaimer',
label: 'APR Disclaimer',
required: true,
rows: 4,
multiline: true,
defaultValue: '',
fieldValidation: utils.fieldValidations.maxLength(1000),
},
{
type: 'text',
label: 'Source',
id: 'source',
required: false,
disabled: true,
defaultValue: 'Manually Entered',
column: 2,
},
];

interface Props {
context: any;
viewMode: ViewMode;
}

const uploadValidator = (sectionSets: any[]) => {
  const errors: stringl] = [];

  return errors;
};

const RatesRecreationalVehicle: FunctionComponent<Props> = ({
context,
viewMode,
) = (
return (
<DimensionedCustomSection
sectionSetType={RATES_TYPE_NON_AUTO}
sectionName={'Rates'}
sectionSetFields={fields}

viewMode={viewMode}
uploadValidator={uploadValidator}
maxSetNumber={2}
    [>
  };
};

export default RatesRecreationalVehicle;
