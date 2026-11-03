typescript
import React from 'react';

export interface ITabsProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'content'> {
content: ITabsData[l:
id?: string:
className?: string
showDropdown? : boolean
deactivateFilter?: boolean
selectedTaboverride?: string:
onsetselectedTab?: (value?: string) => void;
.

export interface ITabHeaderProps
id?: string:
key: string:
title: string:
isselected?: boolean;
onclick: () => void;
.

export interface ITabsData
key: string:
title: string:
data: React. ReactNode
.
