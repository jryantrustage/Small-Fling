/**
* @file useContentModal
* @summary
* Hook that returns function to show modal for with generic header and content sections
* 24px spacing between header and text and between sections
* Font style of header can be set
* Text color of content can be set (body1 font style)
*/
import React, { useContext } from 'react';
import { ModalContext } from 'context';
import { IThemeColors } from 'styles';
import { IFontName } from 'styles/themes';
import { SCContentModalBody, SCContentModalHeading } from 'styles/shared';
import { SCContentModalMarkdown } from 'styles/shared/SCContentModalMarkdown';
import { Modals } from 'core';

interface IModalBodySection {
header: string;
content: string;
}

export const useContentModal = () => {
























name?: Modals;
headerFontStyle?: IFontName;
headerTextColor?: IThemeColors;
contentFontStyle?: IFontName;
contentTextColor?: IThemeColors;
}) => {
openAppModal({
id,
title,
ariaTitle,
headerHasFocus,
body: (
<SCContentModalBody>
{bodyData.map(({ header, content }) => (
<React.Fragment key={header}>
<SCContentModalHeading
fontStyle={headerFontStyle}
color={headerTextColor}
id='remove-promo-code-or-account-header'>
{header}
</SCContentModalHeading>
<SCContentModalMarkdown fontStyle={contentFontStyle} color={contentTextColor} text={content} />
</React.Fragment>
))}
























*/
type HookPayload = () => boolean;

export const useMounted = (): HookPayload => {
const mountedRef = useRef<boolean>(false);
const isMounted = useCallback(() => mountedRef.current, []);
useEffect(() => {
mountedRef.current = true;

    return (): void => {
mountedRef.current = false;
};
});

  return isMounted;
};

export const TestComponent = (): JSX.Element => {
const isMounted = useMounted();

  return <div>{isMounted() ? 'TRUE' : 'FALSE'}</div>;
};
