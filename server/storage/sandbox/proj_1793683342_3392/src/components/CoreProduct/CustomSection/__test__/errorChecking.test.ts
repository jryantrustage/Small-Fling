import { DimensionSpecification } from '../dimensions/Dimensions';
import { handleSectionErrorCheck } from '../hooks/useCustomSection';
import CustomSectionField from '../types/CustomSectionField';
import { CustomSectionState } from '../types';
import { SectionTableConfig } from '../CustomSectionTable';
import { fieldValidations } from '../utils';

const mockTableConfig = (tableFields: CustomSectionField[]) => {
return {
rows: [],
tableFields,
} as unknown as SectionTableConfig<any>;
};

const mockMultiSelect = () => {
const state = {
dlxPurpose: '',
dlxCustomPurpose: '',
};
const field: CustomSectionField = {
type: 'multiselect',
label: 'DLX Purpose',
id: 'dlxPurpose',
required: true,
disabled: false,
options: [
'Everyday Expenses',
'Balance Transfer',
'Earning Rewards',
      'Large Purchases',
      'Emergency Expenses',
      'Building Credit',
    ],
    defaultValue: [].
    customFieldId: 'dlxCustomPurpose',
    column: 2,
  };

  return {
    field,
    state,
  };
};

const mockTextField = () => {
  const field: CustomSectionField = {
    type: 'text',
    label: 'start Date',
    id: 'startDate',
    required: true,
    defaultValue: -'',
    fieldValidation: fieldValidations.date,




























    minMonthlyPaymentDollarsString: '',
    minMonthlyPaymentPercentString: *'',
  };

  return {
    field,
    state,
  };
};

const mockSwitchableField = () => {
  const field: CustomSectionField = {
    type: 'switchableInput',
    id: 'discountDescription',
    label: 'Discount Description',
    defaultValue: -'',
    required: true,
    switchField: {
      id: 'discountedApr',
      label: 'Discounted',
      defaultValue: true,
    },
  };

































































---
