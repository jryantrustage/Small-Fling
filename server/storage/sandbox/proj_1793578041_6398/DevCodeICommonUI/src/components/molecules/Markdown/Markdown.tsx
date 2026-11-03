typescript
import React, ( useMemo  from 'react';
import t marked  from 'marked'
import dompurify from 'dompurify';

import ( IMarkdownprops  from './types';
import ( scDiv  from './styles';


* A component that renders sanitized markdown string into jsx

const Markdown = ({ text = ‘', ..rest }: IMarkdownProps): Jsx.Element => (
const markup = useMemo(() =>
const textcontent = Array.isArray(text) ? text.join('\nin') : text;

// Sanitizing and removing the trailing white space:
const rawMarkup = (marked(dompurify.sanitize(textcontent)) as string).trim():

/ / open external links in a new tab
return rawMarkup.replace(/href/gi, 'target="_blank" rel="noreferrer noopener" href');
, [text);

return <scDiv (...rest) dangerouslysetInnerHTML={t _html: markup ) />;