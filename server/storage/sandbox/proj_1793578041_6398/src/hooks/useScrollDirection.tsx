import { useEffect, useState } from 'react';

type UseScrollDirection = 'UP' | 'DOWN';
























}

      if (scrollY < threshold / 4 || scrollY === 0) {
setIsStartingPoint(true);
}

      if (scrollY > threshold) {
setIsStartingPoint(false);
}

      lastScrollY = scrollY;
scrolling = false;
};

    const onScroll = (): void => {
if (!scrolling) {
window.requestAnimationFrame(updateScrollDirection);
scrolling = true;
}
};
window.addEventListener('scroll', onScroll);
return (): void => {
window.removeEventListener('scroll', onScroll);
};
























RESET_ALLOCATIONS_MODAL_BODY: [
'# Are you sure you want to set all accounts to the same allocation?',
'Once this change is made, you will lose any values you previously saved for individual accounts and will need to re-enter individual allocations if you change your mind.',
],
};
