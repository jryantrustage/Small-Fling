import { DateTime } from 'luxon';
import {
CACHE_OBJECT_KEY_RATES,
CACHE_OBJECT_KEY_RATES_ERRORS,
} from '../constants/CacheObjectKeys';
import { Rows, SectionTableConfig } from './CustomSectionTable';
import customSectionTableCellMap from './CustomSectionTableCell';
import { dimensionColumnConfigMap } from './dimensions/configuration/dimensionColumnConfigMap';
import { dimensionConfigMap } from './dimensions/configuration/dimensionConfigMap';
import { TableDimensionRowConfig } from './dimensions/configuration/useDimensionRowConfigMap';
import {
ColumnOverride,
Dimension,
DimensionColumnType,
DimensionName,
DimensionSpecification,
} from './dimensions/Dimensions';
import { ProductTableColumnDictionary } from './dimensions/ProductTableColumnDictionary';
import { CustomSectionState, OBJ, SectionSetState } from './types';
import CustomSectionField, {
CustomSectionMultiSelect,
FieldValidation,
SwitchableInput,
TextField,
} from './types/CustomSectionField';
import {
isValidDate,
isValidTwoDecimalNumberOrEmpty,
MinMaxValidationParam,
minMaxValueCheck,
minMaxValidationMessage,
maxLengthCheck,
} from './validations';

export const tryParseJson = (maybeJson: any) => {
return typeof maybeJson === 'string' ? JSON.parse(maybeJson) : maybeJson;
};

export const getCachedState = (context: any, cachedObjectKey?: string): any[] =>
context.getCachedObject(cachedObjectKey || CACHE_OBJECT_KEY_RATES);

export const setErrorCache = (context: any, errors: SetHasErrorsResult) =>
context.cacheObject(CACHE_OBJECT_KEY_RATES_ERRORS, errors);

export const getErrorCache = (context: any): SetHasErrorsResult | undefined =>
context.getCachedObject(CACHE_OBJECT_KEY_RATES_ERRORS);

export const htmlId = (
sectionSetIndex: number,
fieldId: string,
tableIndex?: number,
) =>
`${sectionSetIndex + 1}-${fieldId}-${
Number.isSafeInteger(tableIndex) ? `${(tableIndex as number) + 1}-` : ''
}input``;

export const htmlTableCellId = (
sectionSetIndex: number,





















return fields.reduce((prev, curr) => {
const key = curr.stateOverrideKey ? curr.stateOverrideKey : curr.id;
const state = {
...prev,
[key]: curr.defaultValue,
} as any;
if (curr.type === 'multiselect' && curr.customFieldId) {
state[curr.customFieldId] = '';
}
if (curr.type === 'text' && curr.secondaryField) {
state[curr.secondaryField.id] = '';
}
if (curr.type === 'switchableInput') {
state[curr.switchField.id] = curr.switchField.defaultValue;
}
return state;
}, {});
};

export type FieldValidationType =
| 'dollar'
| 'percentage'
| 'date'
    'maxLength'
    'minMaxValue';

export const fieldValidations: {
  date: FieldValidation;
  dollar: FieldValidation;
  percentage: FieldValidation;
  maxLength: (maxLen: number) => FieldValidation;
  minMaxValue: (minMaxData: MinMaxValidationParam) => FieldValidation;
} = {
  date: {
    method: isValidDate,
    validwhen: true,
    message: 'Invalid date',
  },
  dollar: {
    method: isValidTwoDecimalNumberOrEmpty,
    validwhen: true,
    message: 'Required format x.xx',
  },
  percentage: {























};
export const ERROR_PREFIX = '__ERROR_MSG_';
const errorKey = (fieldId: string) => `${ERROR_PREFIX}${fieldId}`;
export const setErrorMsg = (
stateObj: OBJ,
fieldId: string,
msg: string | undefined,
) => {
stateObj[errorKey(fieldId)] = msg;
};

export const deleteErrorMsg = (stateObj: OBJ, fieldId: string) => {
delete stateObj[errorKey(fieldId)];
};

export const extractErrorMsg = (
stateObj: OBJ,
fieldId: string,
): string | undefined => {
return stateObj[errorKey(fieldId)];
};

export const hasErrors = (stateObj: OBJ) => {
  const errorKeys = Object.keys(stateobj).filter((key) =>
    key.includes(ERROR_PREFIX),
  };
  return {
    foundInvalidErrors: errorKeys.some((key) => stateobj[key] !== 'Required'),
    foundRequiredErrors: errorKeys.some((key) => stateObj[key] === 'Required'),
  };
};

interface SetHasErrorsResult {
  foundInvalidErrors: boolean;
  foundRequiredErrors: boolean;
}

export const setsHaveErrors = (objs: CustomSectionstate) => {
const invalidErrors: boolean[] = [];
const requiredErrors: boolean[] = [];
  const sectionSetList = Object.values(objs) as SectionSetstate[l;
  sectionSetList.forEach((obj) => {
    const setFieldErrors = hasErrors(obj);l





















interface GroupedDimensions {
dimNames: DimensionName[];
groupedDims: {
[dimensionName: string]: Dimension[];
};
}

export const groupDimensionsFromList = (
dims: Dimension[],
): GroupedDimensions => {
const dimNames = Array.from(new Set(dims.map((d) => d.dimensionName)));
const groupedDims: GroupedDimensions['groupedDims'] = {};
dimNames.forEach((name) => {
groupedDims[name] = dims.filter((d) => d.dimensionName === name);
  }};
return {
dimNames,
groupedDims,
};
};

export const extractExtraDimensions = (
spec?: DimensionSpecification | null,
} => {
  if (!spec) return [l;
  const extra = spec.extraDimensions ? Object.values(spec.extraDimensions) : [l;
  const flattenedDims = extra.reduce((prev, cur) => {
    return [...prev, ...cur];
  },[};
  return flattenedDims;
};

const combineTableAndDimensionData = (
  tableConfig: SectionTableConfig<any>,
  dimensions: Dimension[].
} => {
  const cellDataList = tableConfig.initialTableCellDataFN();
  return cellDataList.map((cellData) => {
    let newData = { ...cellData ;
    newData = {
      ...newData,
      title: tableConfig.columnData.titleFN(newData),
    };
       dimensions.forEach(dimension =>























const newCellData = combineTableAndDimensionData(
tableConfig,
currentDimsList,
      };
tables[i] = {
...defaultStateFromFields(tableConfig.tableFields),
columns: newCellData,
dimensions: [...currentDimsList],
};
      {>>;
return;
}
const currentName = dimNames[nameIndex];
const configuredDims = groupedDims[currentName];
configuredDims.forEach((dim) => {
recursiveCreateTables(nameIndex + 1, [...currentDimsList, dim]);
    }};
};
recursiveCreateTables(0, []);
return tables;
};

export const rebuildTableStateFromDelta = (
  dimensionSpecification: DimensionSpecification,
  delta: DimensionSpecDelta,
  tableConfig: SectionTableConfig<any>,
  oldstate: CustomSectionstate,
: CustomSectionState => {
  const newState: CustomSectionstate = {};
  Object.values(oldstate).forEach((oldSet: SectionSetState, oldSetIndex) => {
    const newSet = { ...oldSet };
    newSet.tables = initTableStateFromDimensions(
      dimensionSpecification,
      tableConfig.
    };
    Object.values(oldSet.tables).forEach((oldTable) => {);
    newState[oldSetIndex] = newSet;
  }};
  return newstate;
};

export const createDefaultRow = (): Rows<any> => {
  return











































  return rows;
};

const extractColumnDimensions = (
  spec: DimensionSpecification,
  dimensionRowConfigMap: Partial<
    Record<DimensionName, TableDimensionRowConfig>
  >,
): Columnoverride => {
  let rowCategoryOverride: string I undefined;
  const rowDimName = spec.row?.dimensionName;
  if (rowDimName && dimensionRowConfigMap.hasOwnProperty(rowDimName)) {
    rowCategoryOverride =
      dimensionRowConfigMap[rowDimName]?.categoryHeaderOverride;
  }
  const dimConfig = dimensionConfigMap[spec.column.dimensionName];
  if(dimConfig.columnOverride){
    const config = dimConfig.columnoverride();
    if (rowCategoryOverride){
      config.tableColumnConfig.categoryHeader = rowCategoryOverride;
    }
    return config;














       H×==×99@×
tableColumnConfig,
    ulmensluns: spel.ulul,ulensluns,
};
};

const handleSingleSelectDefaults = (
tableObjects: ProductTableColumnDictionary[],
rows: Rows<ProductTableColumnDictionary>[],
) => {
if (rows.length === 0) return;
if (tableObjects.length === 0) return;
rows.forEach((row) => {
if (row.cellType === 'singleSelect') {
const column = tableObjects[0];
(column[
row.colFieldKey as keyof ProductTableColumnDictionary
] as boolean) = true;
}
  }};
};

export const dimensionDataToTableConfig = (
dimensionRowConfigMap: Partial<
Record<DimensionName, TableDimensionRowConfig>
>,
spec?: DimensionSpecification,
tableFields: CustomSectionField[] = [],
): SectionTableConfig<ProductTableColumnDictionary> | undefined => {
if (!spec || !spec.column.dimensionName) return;

  const dimensionColumnConfig =
dimensionColumnConfigMap[spec.column.dimensionName];
if (!dimensionColumnConfig)
throw new Error(
`Dimension ${spec.column.dimensionName} has not been implemented as a column dimension`,
    };

  const { tableColumnConfig: columnData, dimensions: colDimensions } =
extractColumnDimensions(spec, dimensionRowConfigMap);

  const customSectionRows = createTableRowConfig(spec, dimensionRowConfigMap);

  const baseInitialObjectMap = new Map<string, string | boolean>();

  customSectionRows.forEach((row) => {


















    return JSoN.parse(JsoN.stringify(tableObjects));l
  };

  return {
    initialTableCellDataFN,
    rows: customSectionRows,
    columnData,
    tableFieldKey: 'tables',
    tableCellFieldKey:'columns',
    tableFields,
    tablesPerSet: Number.MAX_SAFE_INTEGER,
  };
};

export const getDefaultCreatestate = (): CustomSectionstate =>
  return {
    o:
      tables: {},.
    },
  };
};

export const getDefaultEditState = (
  fields: CustomSectionField[],
: CustomSectionstate => {
  return
    0: {
      ...defaultStateFromFields(fields),
      tables: {},
    },
  };
};

export const listToIndexedobj = function (list: any[l) {
  if (!list) return {};
  return list.reduce((prevstate, listItem, i) => {
    return
      ...prevstate,
      [i]: listItem,
    };
  },{);
};

export interface DimensionSpecDelta {











































if (old.column.dimensionName !== newSpec.column.dimensionName) {
column = true;
}
let row = false;
if (!old.row && newSpec.row) {
row = true;
}
if (old.row && !newSpec.row) {
row = true;
}
if (old.row && newSpec.row) {
if (old.row.dimensionName !== newSpec.row.dimensionName) {
row = true;
}
}

  let extraDimensions = false;
if (!old.extraDimensions && newSpec.extraDimensions) {
extraDimensions = true;
}
if (old.extraDimensions && !newSpec.extraDimensions) {
extraDimensions = true;
}
if (old.extraDimensions && newSpec.extraDimensions) {
if (
Object.keys(old.extraDimensions).length !==
Object.keys(newSpec.extraDimensions).length
    } {
extraDimensions = true;
} else {
if (
JSON.stringify(old.extraDimensions) !==
JSON.stringify(newSpec.extraDimensions)
      } {
extraDimensions = true;
}
}
}

  // For the following, if either row or column dimension changed, we will need to regenerate the table anyway,
// so set to empty array to prevent their use
const columnDimensionsAdded = column
? []
: calculateDimensionsAdded(
old.column.dimensions,
newSpec.column.dimensions,
      };
const columnDimensionsRemoved = column
? []












































    return 'Riskonly';

  if (
spec.column.dimensionName === 'Purpose' &&
spec.row?.dimensionName === 'CreditScoreRanges'
  }
return 'Purpose';
if (spec.column.dimensionName === 'Purpose' && !spec.row)
return 'PurposeOnly';
if (spec.column.dimensionName === 'Rate' && !spec.row) return 'SimpleRate';

  return 'TermLength';
};

export const indexOfGapDecimal = (
objs: Array<{ start?: number | string; end?: number | string }>,
increment: number,
): number | undefined => {
let i = 1;
for (const second of objs.slice(1)) {
const first = objs[i - 1];
if (!first.end) return;
if (!second.start) return;
const start = parseFloat(second.start.toString());
const end = parseFloat(first.end.toString());
    const actualIncrement = (start - end).toFixed(2);
    if (actualIncrement !== increment.toFixed(2).tostring()) {
      return i - 1;
    }
    i=i+1;
  }
  return;
};

export const indexofGapNumber = (
  objs: Array<{ start?: number I string; end?: number  string }>,
  increment: number,
): number | undefined => {
  if (objs.length === 0 l objs.length === 1) return;
  const parsedobjs = objs.map((obj) => {
    return {
      start:
        typeof obj.start === 'string'
          ? parseInt(obj.start, 10)
          : obj.start ?? 0,











































  if ((currentUnixTime > endDate) {
    set.recordstate = 'Expired';
    return;
  }

  set.recordstate = 'Active';
}

export const setUploadRecordstate = (
  setForUpload: any,.
  ctxRecordstate?: string,
} => {
  const currentTime = DateTime.now().toUnixInteger();
  if (ctxRecordstate && ctxRecordstate !== 'Draft') {
    // ... if the form is being saved as active, set the rate sets as
    // Active/Pending/Expired, based on the date range for each rates set
    calculateRecordstate(setForUpload, currentTime);
  f else{
    setForUpload.recordstate = 'Draft';
  }
};

export const contextHelper = (context: any) => {
  const productType =
    context.productConfig?.type ?? context.props?.productInstance?.type;
  const { productId } = context;
  const { tenantId: tenantFromProductConfig, recordstate } =
    context.productConfig;







tenantId,
recordState,
};
};

export const formatServiceObject = (valuesOrSpecJSON: OBJ) => {
if (valuesOrSpecJSON.hasOwnProperty('tables')) {
if (!Array.isArray(valuesOrSpecJSON.tables)) {
valuesOrSpecJSON.tables = [];
}
valuesOrSpecJSON.tables = listToIndexedObj(valuesOrSpecJSON.tables);
} else {
valuesOrSpecJSON.tables = {};
}
return valuesOrSpecJSON as SectionSetState;
};

export const formatServiceObjectForUpload = (valuesOrSpecJSON: OBJ) => {
// Need to do this to prevent conflicts with immerjs package
valuesOrSpecJSON = JSON.parse(JSON.stringify(valuesOrSpecJSON));
if (
valuesOrSpecJSON.hasOwnProperty('tables') &&
typeof valuesOrSpecJSON.tables === 'object'
  } {
valuesOrSpecJSON.tables = Object.values(valuesOrSpecJSON.tables);
}
if (!valuesOrSpecJSON.tables) {
valuesOrSpecJSON.tables = [];
}
return valuesOrSpecJSON as SectionSetState;
};

export const getProductImageUploadSectionSpec = (): OBJ => ({
sectionCode: 'IMAGE-UPLOADER',
sectionTitle: 'Product Image',
showTitle: false,
isUsed: true,
isDisplayed: true,
componentReference: 'IMAGE-UPLOADER',
}};
