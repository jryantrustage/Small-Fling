import React from 'react';
import { FunctionComponent } from 'react';
import CustomSectionField from '../types/CustomSectionField';
import { ViewMode } from '../types';
import * as utils from '../utils';
import DimensionedCustomSection from '../DimensionedCustomSection';
import {
RATES_TYPE_NON_AUTO,
RATES_TYPE_PERSONAL_UNSECURED,
} from '../../constants/RateTypes';

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

viewMode: ViewMode;
}

const uploadValidator = (sectionSets: any[]) => {
const errors: string[] = [];

  return errors;
};

const RatesUnsecuredLoan: FunctionComponent<Props> = ({
context,
viewMode,
) = (
return (
<DimensionedCustomSection
sectionSetType={RATES_TYPE_PERSONAL_UNSECURED}
sectionName={'Rates'}
sectionSetFields={fields}
context={context}
viewMode={viewMode}
uploadValidator={uploadValidator}
maxSetNumber={2}
    [>
  };
};

export default RatesUnsecuredLoan;
