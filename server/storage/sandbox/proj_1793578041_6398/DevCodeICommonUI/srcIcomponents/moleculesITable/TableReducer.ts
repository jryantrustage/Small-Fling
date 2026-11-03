typescript
import  Isort  from '. /types';

export enum Actions
changePageLength = ‘changePageLength',
filter = 'filter',
setcurrentPage = 'setcurrentPage',
sort = 'sort',
.

const TableActions =
sort: (sort: Isort) =>(t
type: Actions.sort,
sort,

filter: (filter: ( column: string; value: string ) =>(t
type: Actions.filter,
filter,

changePageLength: (pageLength: number) =>(t
type: Actions.changePageLength,
pageleng th.

setcurrentPage: (pageNumber: number) => (
type: Actions.setcurrentPage
pageNumber.
