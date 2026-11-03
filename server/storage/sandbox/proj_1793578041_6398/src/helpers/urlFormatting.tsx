import React from 'react';

const HttpPrefixes = {
http: 'http://',
https: 'https://',
};

/**
* formatRawUrl
* @summary
* Add http or https prefix to a raw url string if none is provided to start with.
* Used to format tenant-configurable links before passing them as href attributes to an anchor element
* @param rawUrl original url string
* @returns formatted url string with http:// or https://
*/
export const formatRawUrl = (rawUrl: string) => {
























children,
href,
ariaLabel,
target = '_blank',
}: {
children: string | JSX.Element;
href: string;
ariaLabel?: string;
target?: string;
}): JSX.Element => {
const fullUrlHref = formatRawUrl(href);
return (
<a target={target} rel='noreferrer noopener' aria-label={ariaLabel} href={fullUrlHref}>
{children}
</a>
);
};
