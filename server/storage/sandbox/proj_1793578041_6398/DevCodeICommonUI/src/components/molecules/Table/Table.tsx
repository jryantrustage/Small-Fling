typescript
import React,  useEffect, usestate  from 'react';

import { sCBottomPaginationwrapper, sCTopPaginationwrapper, sCTableWrapper  from './styles';
import ( ITableProps, Tablespacing ) from './types';
import ( useTable ) from './useTable';
import ( Pagination ) from './Pagination';
import ( TableHeader ) from './TableHeader';
import ( TableEmptystate ) from './TableEmptystate';
import ( SimplePagination ) from './SimplePagination';


* @summary
* A table with pagination, sorting, and filtering
* @todo
* i18n keys
* @param filterable
* Will render the text input filter below the column header
* @param sortable
* will enable sorting behavior for column headers

const Table = (t
id,
className
columns = [
data = [
additionalData = [,
filterable = false
showPaginationBottom = true,
pages ize = 25,
showPaginationTop = false,
sortable,
stickyHeader = false,
getTrGroupprops,
defaul tsort,
emptystateComponent,
tablespacing = Tablespacing.sTANDARD,
pageDataloader
totalDatasize,
updateQueryParams,
initialQueryParams,
simplepagination,
stickyPagination.
separatePaginationFromTable,
customsort,
onsortclick,
: ITableProps): Jsx.Element =>
const usesDynamicPageLoad = ! ! pageDataLoader;
const [disablePagination, setDisablePagination] = usestate(false);
const
filters.
order,
sort.l
sortedData,
onsort,
onclearFilter,
onFilter,
numPages.
pageleng th.
setcurrentPage.
currentPage
changePageLength,
loadingPagination,
= useTable(
columns,
data,
defaul tsort,
pagesize,
totalDatasize,
updateQueryParams,
initialQueryParams,
customsort,
onsortclick,


useEffect(() =>
if (!loadingPagination ＆& currentPage > numPages)
setcurrentPage(o);
.
, [numPages);

const setPageDynamic = (page: number) =>
setDisablePagination(true):
pageDataLoader? .(pageLength, page)
.then(() => setcurrentPage(page)
.finally() => setDisablePagination(false)):
```
const changePageLengthDynamic = (newPageLength: number) => (
setDisablePagination(true):
pageDataLoader? .(newPageLength, currentPage)
.then(() => changePageLength(newPageLength))
.finally(() => setDisablePagination(false);


const buildPagination = () =>
if (IshowPaginationTop ＆& IshowPaginationBottom) return null:
if (s implePagination)
return (
<s implePagination
id= idy
currentPage=(currentPage
numPages= numPagesy
setcurrentPage={usesDynamicPageLoad ? setPageDynamic : setcurrentPage)
disabled= disablePagination


return (
Pagination
id= idy
currentPage= currentPage
numPages=(numPages)
setcurrentPage={usesDynamicPageLoad ? setPageDynamic : setCurrentPage)
pageLength= (pageLengthy
changePageLength={usesDynamicPageLoad ? changePageLengthDynamic : changePageLength)
disabled={disablePagination
showAl1Rowsoption={ lusesDynamicPageLoady
issticky={stickyPagination

```