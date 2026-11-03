typescript
import React from 'react';

import  replace + from 'lodash';
import ( Markdown ) from 'components/molecules/Markdown';
import IconDown, ( ReactCcomponent as IconDownComponent ) from '. /svg/downArrow.svg';
import  IFAQProps  from '. /types';
import { SContainer, SCTitle, SCFAQItem, SCFAQButtonQuestion, SCFAQAnswer } from './styles';


* FAQ
* @summary
* Vertical list of expandable question-answer items
* Expanding a question will show the answer.
* To customize styling for the title, faq item, or question use these classes:
* .faq-item, .faq-title, .faq-button-question
* @param id
* optional id for component
* @param title
* Header text above list of question-answer items
* @param item
* Array of IFAQItem: ( question: string: answer: string id: string }

const FAQ = (( id, title, items, className }: IFAQProps): Jsx.Element =>
return
<sccontainer id={idy className={className>
<scTitle className='faq-title'>(titlej</scTitle>
(items .map((faqItem) =>
const faqItemId = faqItem.id Il replace(replace(faqItem.question, · ', '-'), '?', '"):"

<sCFAQItem
key={ faqitemIdy
iconurl={IconDown)
id='accordion-$ faqitemIdy'
title={faqItem.question
className=- faq- item''
buttoncomponent=t
sCFAQButtonQuestion
className='faq-button-question'
id='question-$ (faqitemIdy'
aria-label={faqItem.question)>
<IconDowncomponent /
(faqitem.question)
/sCFAQButtonQuestion
.
content=
<sCFAQAnswer id={'answer-${faqItemId)'} aria-label={faqItem.answer)>

<Markdown text={faqItem.answer) />
/sCFAQAnswer>
.



</sccontainer>