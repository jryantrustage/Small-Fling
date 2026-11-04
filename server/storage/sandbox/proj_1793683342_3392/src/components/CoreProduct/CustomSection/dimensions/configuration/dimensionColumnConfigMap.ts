import { SectionTableConfig } from '../../CustomSectionTable';
import { Dimension, DimensionName } from '../Dimensions';
import { ProductTableColumnDictionary } from '../ProductTableColumnDictionary';

export interface TableDimensionColConfig {
type: DimensionName;
translateDimensionToDictionary: (
dim: Dimension,
) => Partial<ProductTableColumnDictionary>;
titleValueValidation?: (value: string) => string | undefined;
saveValidation?: (values: string[]) => string | undefined;
colConfigFN: () => SectionTableConfig<ProductTableColumnDictionary>['columnData'];
includeDefaultRow?: boolean;
}

export const dimensionColumnConfigMap: Partial<
Record<DimensionName, TableDimensionColConfig>
> = {
Rate: {
type: 'Rate',
translateDimensionToDictionary: (dim) => {
return {
valueUnits: 'percentage',
};
},
colConfigFN: () => {
return {
categoryHeader: 'Term Length',
titleFN: (_) => `Rate`,
};
},
},
TermLength: {
type: 'TermLength',
includeDefaultRow: true,
translateDimensionToDictionary: (dim) => {
if (!dim.constant)
throw new Error(
`dimension.contant was not set to termLength. Dimension: ${JSON.stringify(
dim,
)}`,
        };
return {
termLength: parseInt(dim.constant, 10),
termUnits: 'months',
};
},
colConfigFN: () => {
return {

titleFN: (data) => `${data.termLength} Months`,
};
},
},
Purpose: {
type: 'Purpose',
includeDefaultRow: false,
translateDimensionToDictionary: (dim) => {
return {
purpose: dim.constant,
};
},
colConfigFN: () => {
return {
categoryHeader: 'Purpose',
titleFN: (data) => `${data.purpose}`,
};
},
},
LTV: {
type: 'LTV',
translateDimensionToDictionary: (dim) => {
return {
valueUnits: 'percentage',
ltvLow: dim.start,
ltvHigh: dim.end,
};
},
colConfigFN: () => {
return {
categoryHeader: 'Loan to Value (LTV)',
titleFN: (data) => `${data.ltvLow}% - ${data.ltvHigh}%`,
};
},
},
LoanAmount: {
type: 'LoanAmount',
translateDimensionToDictionary: (dim) => {
return {
loanAmountLow: dim.start,
loanAmountHigh: dim.end,
};
},
colConfigFN: () => {
return {

titleFN: (data) => `$${data.loanAmountLow} - $${data.loanAmountHigh}`,
};
},
},
ModelYear: {
type: 'ModelYear',
translateDimensionToDictionary: (dim) => {
return {
modelYearLow: dim.start,
modelYearHigh: dim.end,
};
},
colConfigFN: () => {
return {
categoryHeader: 'Model Year',
titleFN: (data) =>
`${data.modelYearLow}${data.andOlder ? ' and older' : ''} - ${
data.modelYearHigh
}${data.andNewer ? ' and newer' : ''}``,
};
},
},
;
