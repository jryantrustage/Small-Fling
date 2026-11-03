typescript
import React from 'react';
import ( IcoN_TYPEs, Icon ) from 'components/atoms';
import { scSimplePagination, SCPageNumberwrapper, scChevronButton, ScSimplePaginationwrapper } from './styles';
import ( IsimplePagination ) from '. /types';
import { SimplePaginationNumberButton } from './SimplePaginationNumberButton';

* @summary
* A pagination toolbar
* that includes: Previous/Next chevron buttons, clickable page number bread crumb.

const SimplePagination =({ currentPage, setcurrentPage, numPages, id, disabled }: ISimplePagination) => {
const buildsimplePaginationBreadcrumb = () => (
const numPagesArray = Array(numPages)
.fill(undefined)
. map((, i) => i);
const leftArray = numPagesArray.slice(currentPage, currentPage + 3);
const rightArray = numPagesArray.slice(numPages - 3);

if (currentPage < numPages - 6 && numPages > 6) (
return (
<sCPageNumberwrapper
(leftArray.map((num) =>(
<simplePaginationNumberButton
key={'simple-pagination-page-number-button-$ {num)'}
num= (num)
handleclick={() => setcurrentPage(num)
isselected=(num === currentPage)


<span>. . ./span
(rightArray.map(num) => (
<simplePaginationNumberButton
key={'simple-pagination-page-number-button-$ (num)'
num= (num)
handleclick={() => setcurrentPage(num)
isselected=(num === currentPage)


/ scPageNumberwrapper>

.
return (
<sPageNumberwrapper>
(numPagesArray.slice(numPages - 6 > 0 ? numPages - 6 : 0).map(num) => (
<simplePaginationNumberButton
key={'simple-pagination-page-number-button-$ (num)'}
num= ( numy
handleclick=() => setcurrentPage(num)
isselected={num === currentPage


/scPageNumberwrapper>
```