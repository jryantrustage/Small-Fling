typescript
import React, ( usestate, useEffect, usecontext, SyntheticEvent, KeyboardEvent ) from 'react';
import ( ColorModecontext ) from 'styles/modes';
import ( sCTabList, scTab ) from './styles';
import ( ITabsProps  from './types';

export const isNode = (node: HTMLElement): boolean => node && 'getAttribute' in node;

export const isRadioButtonNode = (node: HTMLElement): boolean => isNode(node) && node.getAttribute('role') === 'radio';

const getIndexByLabel = (value: string, labels: ( label: string; value: string [l): number => {
const index = labels.findIndex(1) => l.value === value) Il o;
return index > -1 ? index : o;