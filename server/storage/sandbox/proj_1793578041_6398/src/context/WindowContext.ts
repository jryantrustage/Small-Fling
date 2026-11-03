import React from 'react';
import { WindowContext as WindowContextShared } from 'commonui-shared';

export interface IWindowContext {
isMobile: boolean;
isTablet: boolean;
isDesktop: boolean;
width: number;
}

























const context: IWindowContext = {
isMobile: width <= 767,
isTablet: !!(width > 767 && width <= 1329),
isDesktop: width <= 1919,
width,
};
return <WindowContext.Provider value={context}>{children}</WindowContext.Provider>;
};
