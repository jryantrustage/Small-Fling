import React from 'react';

const useStateList = <T>(initialList: T[] = []) => {
const [list, setList] = React.useState<T[]>(initialList);

  const setByIndex = (i: number, value: T) => {
setList((prev) => {
const newList = [...prev];
newList[i] = value;
return newList;
    }};
};
const removeIndex = (removeIndex: number) => {
setList((prev) => {
const newList = [...prev];
return newList.filter((_, i) => i !== removeIndex);
    }};
};

  const removeByPredictate = (
fn: (value: T, i: number, arr: T[]) => boolean,
) => {
setList((prev) => {
const newList = [...prev];
return newList.filter(fn);
    }};
};

  const append = (value: T) => {
setList((prev) => {
return [...prev, value];
    }};
};

  return {
list,
removeIndex,
setByIndex,
setList,
append,
removeByPredictate,
};
};

export default useStateList;
