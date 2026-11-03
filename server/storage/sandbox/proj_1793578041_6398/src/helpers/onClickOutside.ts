
























    return (): void => {
document.removeEventListener('mousedown', handleEvent);
document.removeEventListener('touchstart', handleEvent);
};
}, [ref, handler]);
}
