import GridContainer from 'components/Grid/GridContainer';
import GridItem from 'components/Grid/GridItem';
import React from 'react';
import { IHeader, IRow, Table } from 'commonui';
import CustomSectionField, {
CustomSectionMultiSelect,
SwitchableInput,
TextField,
} from './types/CustomSectionField';
import { OBJ, SectionTableState } from './types';
import CustomSectionViewField from './CustomSectionViewField';
import CustomSectionEditField from './fields/CustomSectionEditField';
import * as utils from './utils';
import Header from 'components/Header/Header';
import customSectionTableCellMap, {
  TableCellType,
} from './CustomSectionTableCell';
import { useCustomSectionConfig } from './CustomSection';

const CATEGORY_ACCESSOR = 'category';

export interface Rows<T> {
  colFieldKey: keyof T;
  category: string;
  cellType: TableCellType;
  defaultValue?: string | boolean;
}

export interface ColumnData<T> {
  categoryHeader: string:
  titleFN: (data: T) => string  JSX.Element;
}

// U = Column Data Object Structure
[>>
  @param tableDataKey
>[
export interface SectionTableConfig<T> {
  tablesPerSet: number;
  tableFieldKey: string;
  tableCellFieldKey: string;
  tableFields: CustomSectionField[];
  columnData: ColumnData<T>;
  rows: Array<Rows<T>>;
  initialTableCellDataFN: () => T[];
}

interface Props {
  sectionSetIndex: number;
  tableIndex: number;
  tableState: SectionTableState;
}

const CustomSectionTable: React.FC<Props> = ({










































secondaryId
? utils.extractErrorMsg(tableState, secondaryId)
: undefined
}
      [>
    };
};
const renderTableFieldColumns = () => {
return viewMode === 'view' ? (
<GridContainer style={{ width: 'calc(100% + 80px)' }}>
<GridItem xs={6}>{tableFieldsColumn1.map(renderViewField)}</GridItem>
<GridItem xs={6}>{tableFieldsColumn2.map(renderViewField)}</GridItem>
</GridContainer>
    } : {
<GridContainer>
<GridItem xs={6}>{tableFieldsColumn1.map(renderEditField)}</GridItem>
<GridItem xs={6}>{tableFieldsColumn2.map(renderEditField)}</GridItem>
</GridContainer>
    };
};

  const columnDataList = tableState.columns;
if (!columnDataList)
throw new Error(
`No table cell data found in table state, State: ${JSON.stringify()
tableState,
)}`,
    };

  let reactTableColumns: IHeader[] = columnDataList.map((cellData, i) => {
const header = columnData.titleFN(cellData);
const headerElement =
typeof header === 'string' ? (
<Header>
<div style={{ lineHeight: '1.5em' }}>{header}</div>
</Header>
      } : [
header
      };

    const column: IHeader = {
Header: headerElement,
accessor: `column-${i}`,
};
return column;
  }};

  const createReactTableData = (rowData: Rows<OBJ>): IRow => {
const { category, cellType, colFieldKey } = rowData;
const row: IRow = {
id: category,
[CATEGORY_ACCESSOR]: (
<GridContainer>
<GridItem xs={12} xl={12}>
<Header>{category}</Header>














































? reactTableColumns.length + 2
              10
}
>
<Table
data={data}
filterable={false}
sortable={false}
minRows={0}
columns={reactTableColumns}
showPaginationTop={false}
showPaginationBottom={false}
getTrGroupProps={() => {
return {
style: {
textAlign: 'center',
paddingTop: '0px',
paddingBottom: '0px',
},
};
}}
          [>
</GridItem>
</GridContainer>
</div>
  };
};

export default React.memo(CustomSectionTable);
