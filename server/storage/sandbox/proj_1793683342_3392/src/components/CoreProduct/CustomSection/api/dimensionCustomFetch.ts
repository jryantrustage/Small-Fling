  'typescript'
import { SectionTableConfig } from '../CustomSectionTable';
import customSectionTableCellMap from '../CustomSectionTableCell';
import  CustomSectionstate, SectionSetstate } from '../types';

const tryFormatTableCells = (
  columns: any[].
  tableConfig?: SectionTableConfig<any>,




const key = row.colFieldKey as string;
const value = column[key];
column[key] =
customSectionTableCellMap[row.cellType].onLoad?.(value ?? '') ?? value;
    }};
  }};
};

const formatCellsFromUpload = (
state: CustomSectionState,
tableConfig: SectionTableConfig<any>,
) => {
Object.keys(state).forEach((_, sectionSetIndex) => {
const tables = (state[sectionSetIndex] as SectionSetState).tables;
Object.values(tables).forEach((table) =>
tryFormatTableCells(table.columns, tableConfig),
    };
  }};
};

export const wrapResultInCustomFetch = (
result: CustomSectionState,
tableConfig?: SectionTableConfig<any>,
) => {
return (
context: any,
viewMode: string,
setInitialState: (initialState: any) => void,
setError: (initialState: any) => void,
setDefaultState: () => void,
): Promise<void> => {
if (viewMode === 'create') {
setDefaultState();
return Promise.resolve();
}

    if (tableConfig) {
formatCellsFromUpload(result, tableConfig);
}

    setInitialState(result);
return Promise.resolve();
};
};
