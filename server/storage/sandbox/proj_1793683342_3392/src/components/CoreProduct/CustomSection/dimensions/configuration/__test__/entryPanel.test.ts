import { Dimension } from '../../Dimensions';
import {
performRangeChecks,
dimensionEntryPanelConfigMap,
} from '../dimensionEntryPanelConfigMap';

const toDims = (arr: any[]) =>
arr.map((a) => ({ start: a[0], end: a[1] } as Dimension));

test('End Inclusive Range checking', () => {
const happyPathDims = [
['2000', '2005'],
['2006', '2010'],
['2011', '2021'],
];

  const gapDims = [
['2000', '2005'],
['2007', '2010'], // Gap 2005 - 2007
['2011', '2021'],
];

  const endLessThanStart = [
['2000', '2005'],
['2006', '1'],
['2011', '2021'],
];
let r = performRangeChecks(toDims(happyPathDims), '', true, 1);
expect(r).toBeNull();

  r = performRangeChecks(toDims(gapDims), '', true, 1);
expect(r).not.toBeNull();

  r = performRangeChecks(toDims(endLessThanStart), '', true, 1);
expect(r).not.toBeNull();
}};

test('Range checking', () => {
const happyPathDims = [
['2000', '2005'],
['2005', '2010'],
['2010', '2021'],
];

  const endSameAsNextStart = [
['2000', '2005'],
['2005', '2010'],
['2011', '2021'],
];

  const oneOffDim = [
['2000', '2005'],
['2006', '2010'],
['2011', '2021'],
];

  const endLessThanStart = [
['2000', '2005'],
['2006', '1'],
['2011', '2021'],
];
let r = performRangeChecks(toDims(happyPathDims), '');
expect(r).toBeNull();

  r = performRangeChecks(toDims(oneOffDim), '');
expect(r).not.toBeNull();

  r = performRangeChecks(toDims(endLessThanStart), '');
expect(r).not.toBeNull();

  r = performRangeChecks(toDims(endSameAsNextStart), '');
expect(r).not.toBeNull();
}};

test('Range Checking: andHigher and andLower', () => {
const startDim = {
dimensionName: 'ModelYear',
start: '',
end: '2005',
andLower: true,
} as Dimension;
const middleDim = {
dimensionName: 'ModelYear',
start: '2006',
end: '2019',
andLower: true,
} as Dimension;
const endDim = {
dimensionName: 'ModelYear',
start: '2020',
end: '',
andHigher: true,
} as Dimension;

  let r = performRangeChecks([startDim], '', true, 1);
expect(r).toBeNull();

  r = performRangeChecks([endDim], '', true, 1);
expect(r).toBeNull();


expect(r).toBeNull();

  r = performRangeChecks([middleDim, endDim], '', true, 1);
expect(r).toBeNull();

  r = performRangeChecks([startDim, middleDim], '', true, 1);
expect(r).toBeNull();
}};

test('Range Checking: andHigher + andLower selected', () => {
const r = dimensionEntryPanelConfigMap.ModelYear?.entryPanelSaveValidation([
{ start: '', end: '', andLower: true, andHigher: true } as Dimension,
  ]};

  expect(r).not.toBeNull();
}};
