import React, { useState, useMemo } from 'react';
import { TitleBarContext, TitleBarCopy } from './TitleBarContext';

export const TitleBarProvider = (props: { children: React.ReactNode }) => {
const [titleBarCopy, setTitleBarCopy] = useState<Record<string, TitleBarCopy>>({});

  const handleSetTitleBarCopy = (titleBarKey: string, newTitleBarCopy: TitleBarCopy) => {
setTitleBarCopy((prevCopy) => ({
...prevCopy,
[titleBarKey]: newTitleBarCopy,
}));
};

  const handleGetTitleBarCopy = (titleBarKey: string) => titleBarCopy[titleBarKey];

  const value = useMemo(
























* User Context with a shared instance between federated modules
*/
export const UserContext: React.Context<User> = UserContextShared;
export type { User };
