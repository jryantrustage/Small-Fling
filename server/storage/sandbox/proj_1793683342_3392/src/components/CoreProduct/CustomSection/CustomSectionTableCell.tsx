/* eslint-disable react/display-name */
import React from 'react';
import GridItem from 'components/Grid/GridItem';

























    sectionSetIndex: number;l
    tableIndex: number;
    cellParams: TableCellParams;
    value: any;
    currentColumn: SectionSetTableColumn;
    formatUnsetValues?: boolean;
    errorMsg?: string;
    postDisplaySymbol?: string;
  }) => JSX.Element;
  defaultValue: () => string | boolean;
  onLoad?: (cellValue: any) => string;
  onUpload?: (cellValue: any) => any;
  isValid?: (value: any, currentColumn: SectionSetTableColumn) => boolean;
  customChangeHandler?:(
    value: any,
    colFieldKey: string,
    colIndex: number,
    table: SectionTableState['columns'].
    tableConfig: SectionTableConfig<any>,
  )=> any;
}

export interface TableCellMap {
  notApplicableCheckbox: TableCellData;
  checkbox: TableCellData;
  number: TableCellData;
  percentage: TableCellData;
  singleSelect: TableCellData;
  percentageOrNA: TableCellData;
}

export type TableCellType = keyof TableCellMap;
const VALID_NOT_APPLICABLE_CELL_TYPES: TableCellType[] = ['percentageOrNA'J;

const TableCellInput: TableCellData['render'」 = function ({
  htmlId,
  viewMode,
  sectionSetIndex,
  tableIndex,
  cellParams,
  value,
  formatUnsetValues,
  errorMsg.







































           width: '75%',
          },
        }}
        inputProps={{
          disabled,
          disableUnderline: true,
          classes: extstyleclass,
          value: String(value),
          type: 'text'.
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
           onChange(e.target.value);
          },
        }}
      [>
      {postDisplaySymbol &&(
        <p style={{ display: 'inline-block' }}> {postDisplaySymbol}</p>
      }}
    </div>
  };
};

const TableCellCheckbox: TableCellData['render'] = ({
  htmlId,
viewMode,
sectionSetIndex,
tableIndex,
cellParams,
value,
currentColumn,
errorMsg,
}) => {
const { onChange } = useFieldOnChange(
sectionSetIndex,
cellParams.colFieldKey,
tableIndex,
cellParams,
  };
const styleClasses = useStyles();
const tableCellStyle = {
radioBtnClasses: {
checked: styleClasses.radio,
root: styleClasses.radioRoot,
},
};
const style = !!errorMsg







return (
<div>
<GridItem lg={12} style={style}>
<Radio
id={htmlId}
key={htmlId}
onClick={() => onChange(!value)}
checked={value ?? false}
disabled={disabled}
classes={tableCellStyle.radioBtnClasses}
        [>
</GridItem>
</div>
  };
};

const TableCellNACheckbox: TableCellData['render'] = ({
htmlId,
viewMode,
sectionSetIndex,
tableIndex,
cellParams,
value,
errorMsg,
) = (
const { onChange } = useFieldOnChange(
sectionSetIndex,
cellParams.colFieldKey,
tableIndex,
cellParams,
  };
  const styleclasses = usestyles();
  const tableCellstyle = {
    radioBtnclasses: {
      checked: styleclasses.radio,
      root: styleclasses.radioRoot,
      backgroundColor: !!errorMsg ? '#ffcdd2' : '',
    },
    checkboxBtnclasses: {
      checked: styleClasses.checked,
      root: styleclasses.checkRoot,
      backgroundColor: !!errorMsg ? '#ffcdd2' : -'',
},
  };
  const disabled = viewMode === 'view';
  return(
    <div>
<GridItem lg={12}>
<Checkbox
id={htmlId}
key={htmlId}
checked={value ?? false}
onChange={() => onChange(!value)}
disabled={disabled}
classes={tableCellStyle.checkboxBtnClasses}
        [>
</GridItem>
</div>
  };
};

const customSectionTableCellMap: TableCellMap = {
notApplicableCheckbox: {
render: (props) => <TableCellNACheckbox {...props} />,
defaultValue: () => false,
customChangeHandler: (
notApplicable,
colFieldKey,
colIndex,
table,
tableConfig,
) => {
const column = table[colIndex];
column[colFieldKey] = notApplicable;
const keysToUpdateNA = tableConfig.rows
.filter((row) => VALID_NOT_APPLICABLE_CELL_TYPES.includes(row.cellType))
.map((row) => row.colFieldKey as string);
keysToUpdateNA.forEach((key) => {
column[key] = notApplicable ? NOT_APPLICABLE : '';
      }};
if (column.hasOwnProperty(IS_DEFAULT_COLUMN_FIELD_KEY)) {
column[IS_DEFAULT_COLUMN_FIELD_KEY] = false;
}
},
},
checkbox: {
render: (props) => <TableCellCheckbox {...props} />,
defaultValue: () => false,
},
singleSelect: {
render: (props) => <TableCellCheckbox {...props} />,
customChangeHandler: (value, colFieldKey, colIndex, table) => {
if (!value) return;
table.forEach((col, i) => {
col[colFieldKey] = i === colIndex; // Set selected checkbox to true, all others to false
      }};
},
defaultValue: () => false,
},
percentage: {
render: (props) => <TableCellInput {...props} postDisplaySymbol={'%'} />,
defaultValue: () => '',
isValid: decimalUtils.checkIsValidFloat,
onUpload: (v) => parseFloat(v),
onLoad: (v) => v.toString(),
},
number: {
render: (props) => <TableCellInput {...props} />,
isValid: (value) => !Number.isNaN(value),
defaultValue: () => '',
onUpload: (v) => parseFloat(v),
onLoad: (v) => v.toString(),
  },
  percentageOrNA: {
    render:(props)=>(
      <TableCellInput
        {...props?
        postDisplaySymbol={'%'}
        formatUnsetValues={true}
      />
    },
    defaultValue:()=> ',
    isValid:(value, column) => {
      const unsetValue: boolean =
        !value |l
(typeof value === 'string' &&
regexUtils.isNotApplicableString(value as string));

      if (unsetValue) {
return true;
}

      return decimalUtils.checkIsValidFloat(value) || value === NOT_APPLICABLE;
},
onUpload: (v) => {
const unsetValue: boolean =
!v ||
(typeof v === 'string' &&
regexUtils.isNotApplicableString(v as string));
if (unsetValue) {
return 'N/A';
}
return parseFloat(v);
},
onLoad: (v) => v.toString(),
},
};
export default customSectionTableCellMap;
