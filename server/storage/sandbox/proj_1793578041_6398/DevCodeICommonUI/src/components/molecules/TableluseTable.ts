typescript
import React, ( useReducer, useRef ) from 'react';
import ( chunk, orderBy, tostring ) from 'lodash';
import { ITableProps, IUseTablePayload, IRow, IHeader, ISort } from './types';
import { TableActions, TableReducer, ITablestate } from './TableReducer';

const serializecolumn =
(mappedcolumns: Record<string, IHeader>, column: string) =>
(row: IRow): string | number =>
const serialize = mappedcolumns[column]?.serialize;
if (serialize)
return serialize(row);
.
const columnvalue = row[column];
return typeof columnvalue === 'number' ? columnvalue : tostring(columnvalue);


const fuzzyRegex = (filtervalue: string) =>
new Regexp(
［..filterValue.toLowerCase().split('')].reduce((fuzzy, char) => ‘$(fuzzy}.*$(char}', ',*''),
```