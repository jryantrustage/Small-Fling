import { useEffect } from 'react';

export const useRestoreScroll = (x = 0, y = 0): void => {
useEffect(() => {
window.scrollTo(x, y);
}, [x, y]);
};
