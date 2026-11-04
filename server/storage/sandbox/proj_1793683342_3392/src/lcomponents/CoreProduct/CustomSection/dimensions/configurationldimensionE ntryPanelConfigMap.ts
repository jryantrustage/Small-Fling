*'typescript'
import { indexOfGapDecimal, indexOfGapNumber } from '../../utils';
import * as v from '../../validations';
import  Dimension, DimensionName } from '../Dimensions';

const REQUIRED_MSG = 'Please fill out all fields before continuing';
const DUPLICATE_MSG = (v: string) => 'Please remove duplicate value '${v}'';
const VALID_NUM_MSG = 'Must be a valid number or decimal';

export interface FieldValidationResult {
  [dimensionKey: string]: string | undefined;
}

type ExcludeValue = 'row' | 'column' | 'extra';

interface EntryPanelConfig {
  entryPanelFieldValidation: (dim: Dimension) => FieldValidationResult;
  entryPanelSaveValidation: (dims: Dimension[J) => string I null;













































      start = dim.andLower ? undefined : start;

      return {
        start,
        end,
      };
    },
    entryPanelSaveValidation: (dims) => {
      if (dims.find((d) => d.andLower && d.andHigher)) {
        return 'Cannot check both "And older" and "And Newer" on the same line';
      }
      if (dims.find((d) => d.andLower) && dims[o].andLower === false) {
        return 'only first model year can be checked "And older"';
      }
      if(
        dims.find((d) => d.andHigher) &&
        dims[dims.length - 1].andHigher === false
      } {
        return 'Only last model year can be checked "And Newer"';
      }

      const errorMsg = performRangeChecks(dims, 'Model Year', true, 1);
      if (errorMsg !== null) return errorMsg;l



















constant: v.isValidFloat(dim.constant) ? undefined : VALID_NUM_MSG,
};
},
entryPanelSaveValidation: (dims) => {
      return performRangeChecks(dims, 'Loan Amount');
},
},
TermLength: {
entryPanelFieldValidation: (dim) => {
return {
constant: v.isNumericOnly.isValidSync(dim.constant)
? undefined
: 'Must be a valid number',
};
},
entryPanelSaveValidation: (dims) => {
const r = findDuplicates(dims, 'constant');
if (r) {
return DUPLICATE_MSG(r);
}
return null;
},
},
Purpose: {
entryPanelFieldValidation: (dim) => {
return {
constant: !v.isEmptyString.isValidSync(dim.constant)
? undefined
: 'Required',
      };
    },
    entryPanelSaveValidation:(dims)=>{
      const r = findDuplicates(dims, 'constant');
      if(r)
        return DUPLICATE_MSG(r);
      }
      return null;
    },
    preconfiguredConstants: [
      'Balance Transfer',
      'Cash Advance',
      'Intro Purchase',
      'Purchase',
    ],
  },
};

export const isEntryPanelDisabled = (
  dimName: DimensionName,l









































    // If end is inclusive (like for model year 2000-2010, 2011-2020 etc) look for gaps. If it is not inclusive
    // Then make sure the current range end is equal to the next range end (ex. 1000.00-2000.00, 2000.00-3000.00, etc)
    if (endInclusive){
      const nextDim = dims[i + 1];
      if (!nextDim) continue;
      const nextstart =
        !nextDim.start || nextDim.start ===  ? Infinity : +nextDim.start;
      if (currentEnd > nextstart) {
        return 'Line ${i + 1}: ${title} end ${'
dim.end
} is greater than next ${title} start value ${nextDim.start}``;
}
if (currentEnd === nextStart) {
return `Line ${i + 1}: ${title} end ${
dim.end
} must be less than the next ${title} start value ${nextDim.start}``;
}
const gapIndex = indexOfGapDecimal(dims, gapIncrement);
if (gapIndex !== undefined) {
        return 'Line ${gapIndex + 1}: Gap between ${title} end value $
          dims[gapIndex].end
        and next ${title} start value ${dims[gapIndex + 1].start}';
      }
} else {
const previousDim = dims[i - 1];
if (!previousDim) continue;
const previousEnd =
        !previousDim.end ll previousDim.end === --
? Infinity
: +previousDim.end;
if (currentStart !== previousEnd) {
return `Line ${`
          { > ;
}: ${title} end ranges are exclusive, meaning the start of a range must equal the end of the previous range to prevent gaps``;
}
}
}

  return null;
};
