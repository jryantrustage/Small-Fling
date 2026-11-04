import React from 'react';
import { FunctionComponent } from 'react';
import CustomSectionField from '../types/CustomSectionField';
import { ViewMode } from '../types';
import * as utils from '../utils';
import DimensionedCustomSection from '../DimensionedCustomSection';











































label: 'APR Disclaimer',
required: true,
rows: 4,
multiline: true,
defaultValue: '',
fieldValidation: utils.fieldValidations.maxLength(1000),
},
];

interface Props {
context: any;
viewMode: ViewMode;
}

const uploadValidator = (sectionSets: any[]) => {
const errors: string[] = [];

  return errors;
};

const DemoSection: FunctionComponent<Props> = ({ context, viewMode }) => {
return (
<DimensionedCustomSection
      sectionSetType={RATES_TYPE_PERSONAL_LINE_OF_CREDIT}
      sectionName={'Rates'}
      sectionSetFields={fields}
      context={context}
      viewMode={viewMode}
      uploadValidator={uploadValidator}
      maxSetNumber={3}
    [>
  };
};

export default DemoSection;
