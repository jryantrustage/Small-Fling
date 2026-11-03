typescript
import React from 'react';

export const clickonEnter = (e: React.KeyboardEvent<HTMLElement>) => (
if (e.key.toLocaleLowerCase() === 'enter' && e.currentTarget) e.currentTarget.click():