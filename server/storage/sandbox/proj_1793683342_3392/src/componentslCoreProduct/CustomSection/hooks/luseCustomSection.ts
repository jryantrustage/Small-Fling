   'typescript'
import produce, { current } from 'immer';
import { useCallback, useMemo, useReducer, usestate } from 'react';
import  SectionTableConfig } from '../CustomSectionTable';
import  CustomSectionstate, oBJ, SectionTablestate } from '../types';
import CustomSectionField from '../types/CustomSectionField';
import { defaultstateFromFields, setErrorMsg } from '../utils';
import * as A from '../actions';
import * as E from '../errorChecking';
import * as utils from '../utils';
import customSectionTableCellMap from '../CustomSectionTableCell';
import  DimensionSpecification } from '../dimensions/Dimensions';

export interface StateMgmt {
stateDispatch: React.Dispatch<A.CustomSectionAction>;
setFormErrors: React.Dispatch<React.SetStateAction<string[]>>;
}

export interface ManagedState {
sectionState: CustomSectionState;
formErrors: string[];
}

interface UseSectionState {
stateMgmt: StateMgmt;
state: ManagedState;
}

const getNewIndex = (previousState: any) => {
const keys = Object.keys(previousState);
if (keys.length === 0) return 0;
  return keys.length;
};

const removeIndex = (keyToRemove: number | string, oldstate: OBJ) => {
  keyToRemove = keyToRemove.toString();
  let newKey = -1;
  const newstate = Object.keys(oldstate).reduce((newstate, oldKey) => {
    if (oldKey === keyToRemove) return newState;
    newKey = newKey + 1;
    return {
       ..newstate,
      [newKey]: oldState[parseInt(oldKey)],
    };
  },{);
  return newstate;
};

const INITIAL_STATE = {
  0: 1
    tables: {},
  },
as CustomSectionstate;




action: A.TableAdded,
) => {
const { tableFields, initialTableCellDataFN } = tableConfig;
const { sectionSetIndex } = action;
const newTable: SectionTableState = {
...defaultStateFromFields(tableFields),
columns: initialTableCellDataFN(),
};
if (!draft[sectionSetIndex].tables) {
draft[sectionSetIndex].tables = {
0: newTable,
};
return;
}
const tablesDraft = draft[sectionSetIndex].tables;
const newTableIndex = getNewIndex(tablesDraft);
tablesDraft[newTableIndex] = newTable;
};

const handleTableRemoved = (
tableConfig: SectionTableConfig<any>,
draft: CustomSectionState,
action: A.TableRemoved,
) => {
const { sectionSetIndex, tableIndex } = action;
draft[sectionSetIndex].tables = removeIndex(
tableIndex,
draft[sectionSetIndex].tables,
  };
};

const handleTableFieldValueChanged = (
tableConfig: SectionTableConfig<any>,
draft: CustomSectionState,
action: A.TableFieldValueChanged,
) => {
const { sectionSetIndex, tableIndex, tableDataFieldKey, value } = action;
const { tableFields } = tableConfig;
const tableDraft = draft[sectionSetIndex].tables[tableIndex];
tableDraft[tableDataFieldKey] = value;
E.checkTableFieldError(action, tableDraft, tableFields);
};

const handleTableCellValueChanged = (
tableConfig: SectionTableConfig<any>,
draft: CustomSectionState,
action: A.TableCellValueChanged,
) => {
const { rows } = tableConfig;
const { sectionSetIndex, tableIndex, colIndex, colFieldKey, value } = action;

  const row = rows.find((r) => r.colFieldKey === colFieldKey);
if (!row)
throw new Error(
`Could not locate table row from config for action: ${JSON.stringify(`
action,
)}``,
    };

  const table = draft[sectionSetIndex].tables[tableIndex];
const tableColDraft = table.columns[colIndex];

  const { customChangeHandler } = customSectionTableCellMap[row.cellType];
if (customChangeHandler) {
customChangeHandler(
value,
colFieldKey,
colIndex,
table.columns,
tableConfig,
    };
handleTableErrorCheck(sectionSetIndex, tableIndex, table, tableConfig);
} else {
tableColDraft[colFieldKey] = value;
}
E.checkTableCellError(action, tableColDraft, row.cellType);
E.checkTableSpecializedRowError(table);
};

export const handleTableErrorCheck = (
sectionSetIndex: number,
tableIndex: number,
tableDraft: SectionTableState,
tableConfig: SectionTableConfig<any>,
) => {
const { rows } = tableConfig;
tableDraft.columns.forEach((_, colIndex) => {
rows.forEach((row) => {
const colFieldKey = row.colFieldKey as string;
const columnDraft = tableDraft.columns[colIndex];
const value = columnDraft[colFieldKey];
E.checkTableCellError(
{
sectionSetIndex,
colFieldKey,
colIndex,
tableIndex,
value,
},
columnDraft,
row.cellType,
      };
    }};
  }};
E.checkTableSpecializedRowError(tableDraft);
};

export const handleSectionErrorCheck = (
sectionSetFields: CustomSectionField[],
draft: CustomSectionState,























        tableFields.forEach((tableField) => l
          const value = tableDraft[tableField.id];
          E.checkTableFieldError(
            {
              sectionSetIndex: sectionSetIndex,
              tableDataFieldKey: tableField.id,
              tableIndex,
              value,
            },
            tableDraft,
            tableFields,
            true,
          ];
        }];
        handleTableErrorCheck(
          sectionSetIndex,
          tableIndex,
          tableDraft,
          tableConfig.
        };
      }};
    }
  }};
  return utils.setsHaveErrors(draft);
};

const handleSectionSetAdded = (
  draft: CustomSectionstate,
  sectionSetFields: CustomSectionField[l,
  tableConfig?: SectionTableConfig<any>,
  dimensionSpecification?: DimensionSpecification,
} => {
  let tables: any = {};
  if (dimensionSpecification && tableConfig) {
    tables = utils.initTableStateFromDimensions(
      dimensionSpecification,
      tableConfig.
    };
   else if (dimensionSpecification && !tableConfig)
    throw new Error(
      'Found dimension specification with no table configuration'.
    };
  }
  const newSetIndex = getNewIndex(draft);l











































break;
case 'TABLE_ADDED':
if (!tableConfig) {
throw new Error(
'Attempting to add table when no table configuration provided',
            ];
}
handleTableAdded(tableConfig, draft, action);
break;
case 'TABLE_REMOVED':
if (!tableConfig) {
throw new Error(
'Attempting to add table when no table configuration provided',
            ];
}
return handleTableRemoved(tableConfig, draft, action);
case 'TABLE_FIELD_VALUE_CHANGED':
if (!tableConfig) {
throw new Error(
'Attempting to add table when no table configuration provided',
            ];
}
handleTableFieldValueChanged(tableConfig, draft, action);
break;
case 'TABLE_CELL_VALUE_CHANGED':
if (!tableConfig) {
throw new Error(
'Attempting to add table when no table configuration provided',
            ];
}
handleTableCellValueChanged(tableConfig, draft, action);
break;
}
customStateListener?.(context, action);
}, INITIAL_STATE),
[tableConfig, dimensionSpecification],
  };

  const [sectionState, stateDispatch] = useReducer(
sectionStateReducer,
INITIAL_STATE,
  };

  const stateMgmt = useMemo(() => {
return {
stateDispatch,
setFormErrors,
};
}, []);

  // TODO Come up with better state scheme
const state = useMemo(() => {
return {
sectionState,
formErrors,
};
}, [sectionState, formErrors]);

  return {
stateMgmt,
state,
};
};

export default useCustomSection;
