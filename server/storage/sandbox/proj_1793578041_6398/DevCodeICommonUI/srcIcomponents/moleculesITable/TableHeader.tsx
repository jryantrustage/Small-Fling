typescript
import React from 'react';

import ( IcoN_TYPES, Icon } from 'components/atoms/Icon';
import ( IHeaderProps, Tablespacing  from './types';
import ( scTHead, sCHeadercolumn } from '. /styles';
import ( useTypedTranslation  from 'i18n'
import ( TableFilter } from './TableFilter';


* @summary
* A table header. The root element is thead.
* @param columns
* A list of header data. The accessor is the identity of the column.
* columnsortable and columnFilterable can be used to disable functionality for the column.
* Header can be a string or React element.

* @param filterable
* If true, will render a text input below the column header that will trigger the onFilter

* @param sort
* An object describing the current column and direction of sorting

* @param sortable
* If true, will wrap the header contents in a button that will trigger the onsort

const TableHeader = (t
.columns.
filters,
filterable = false,
sort,
sortable = false.
onclearFilter
onFilter,
onsort,
stickyHeader = false,
tablespacing = Tablespacing.sTANDARD,
: IHeaderProps): Jsx.Element =>
const ( t } = useTypedTranslation():
return
<scCTHead stickyHeader={stickyHeader)>
<tr>
fcolumns.map

Header,
accessor,
maxwi dth
sortable: columnsortable = true
filterable: columnFilterable = true,
defaul twidth = undefined,
) = (
const ariasort = () =>
if (!sort.column) return undefined
return sort.direction =-= 'asc' ? 'ascending' : 'descending';

const headercolumnAriaLabel = typeof Header === 'string' ? Header : accessor;
return (
scHeadercolumn
aria-sort=(ariasort()
mawidth= (maxwidthy
key= accessory
tablespacing{tablespacing
defaultwidthForResizable=(defaultwidth>
(sortable && columnsortable ? (
<but ton
aria-label={t('TABLE_HEADER_SORT_BUTTON_ARIA_LABEL', ( accessor })
type but ton'
onclick=fonsort(accessor))
<div>
(Headery
(sort?.column = accessor &&(
Icon
name=t
sort.direction === ‘asc' ? ICON_TYPES.SORTING_ARROWS_UP : ICON_TYPES.SORTING_ARROWS_DOWN
.
s ize={16)

```
/div
/but ton>

div>(Header</div>

(filterable && columnFilterable &&(
<TableFilter
label={t('TABLE_HEADER_FILTER_INPUT_ARIAL_LABEL', ( headerColumnAriaLabel ))
accessor accessory
key accessory
onFilter=fonFilter
onclearFilter=fonclearFilter)
filtervalue={filters[accessor] Il y


/scHeadercolumn>

.

</ tr>
/ sCTHead>


export t TableHeader f:

```
<I -- CODESCAN_ FILE_END -->
