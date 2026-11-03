typescript
export interface IFAQItem
question: string:
answer: string;
id?: string:
.

export interface IFAQsection
title: string:
items: IFAQItem[]:
.

export interface IFAQProps extends IFAQsection
id? : string:
className? : string
.
