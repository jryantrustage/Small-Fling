import { DimensionConfig, DimensionName } from '../Dimensions';

export const dimensionConfigMap: Record<DimensionName, DimensionConfig> = {
FixedAmount: {
dimensionName: 'FixedAmount',
displayName: 'Single Amount',
labelFN: ({ constant }) => `$${constant}`,
initDimension: () => {

dimensionName: 'FixedAmount',
valueUnits: 'number',
constant: '',
};
},
translateDimensionToDictionary: (dim) => {
return {
fixedAmount: dim.constant,
};
},
excludeAsColumnDimension: true,
},
Rate: {
dimensionName: 'Rate',
displayName: 'Single Rate',
labelFN: ({ constant }) => `${constant}%`,
initDimension: () => {
return {
dimensionName: 'Rate',
valueUnits: 'constant',
constant: '',
};
},








categoryHeader: 'Rate',
titleFN: () => 'Rate',
},
dimensions: [
{
dimensionName: 'Rate',
valueUnits: 'percentage',
constant: '',
},
],
};
},
},
ModelYear: {
dimensionName: 'ModelYear',
displayName: 'Model Year',
labelFN: (dim) => {
if (dim.andLower && dim.end) {
return `Age ${dim.end} and Older`;
}
if (dim.andHigher && dim.start) {
return `Age ${dim.start} and Newer`;
}
      return 'Age ${dim.start} - ${dim.end}';
    },
    initDimension:()=>{
      return {
        dimensionName: 'ModelYear',
        valueUnits: 'year',
        start: -'',
        end: -,
        andLower: false,
        andHigher: false,
        endInclusive: true,
      };
    },
    translateDimensionToDictionary: (dim) => {
      return {
        modelYearLow: dim.start,
        modelYearHigh: dim.end,
        andolder: dim.andLower,
        andNewer: dim.andHigher,
      };
    },
    excludeAsColumnDimension: true,












































      dimensionName: 'TermLength',
      valueUnits: 'constant',
      constant: -',
    }},
    translateDimensionToDictionary: ((dim) => {
      if (!dim.constant)
        throw new Error('Did not receive term length: ${JsoN.stringify(dim)) ');
      return {
        termLength: parseInt(dim.constant, 1o),
        termUnits: 'months',
      };
    },
  },
  Purpose: {
    dimensionName: 'Purpose',
    displayName: 'Purpose',
    labelFN:({ constant }) => '${constant}',
    initDimension:()=>({
      dimensionName: 'Purpose',
      valueUnits: 'constant',
      constant: ,
    }},
translateDimensionToDictionary: (dim) => {
return {
purpose: dim.constant,
};
},
},
CreditScoreRanges: {
dimensionName: 'CreditScoreRanges',
displayName: 'Credit Score Ranges',
labelFN: () => `Credit Score Ranges`,
excludeAsExtraDimension: true,
initDimension: () => ({
dimensionName: 'CreditScoreRanges',
valueUnits: 'percentage',
    }},
translateDimensionToDictionary: () => {
return {};
},
},
};
