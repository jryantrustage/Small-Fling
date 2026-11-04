import { Dimension, DimensionSpecification } from '../dimensions/Dimensions';
import * as utils from '../utils';

test('Dimension Spec Delta: Detects column dimension added', () => {
const mockOld = getMockDimSpeck();
const mockNew = getMockDimSpeck();

  const addedDim: Dimension = {
dimensionName: 'TermLength',
valueUnits: 'constant',
    constant: '9o',
};

  mockNew.column.dimensions.push(addedDim);



  expect(delta.columnDimensionsAdded.length).toBeGreaterThan(o);
}};

const getMockDimSpeck = (): DimensionSpecification => {
  return {
    column: {
      dimensionName: 'TermLength',
dimensions: [
        {
          dimensionName: 'TermLength',
          valueUnits: 'constant',
          constant: '3o',
        },
        {
          dimensionName: 'TermLength',
          valueUnits: 'constant',
          constant: '60o',
        },
      ],
    },
    row: {
      dimensionName: 'CreditScoreRanges',
      dimensions: [].
    },
    extraDimensions: {
ModelYear: [
        {
          dimensionName: 'ModelYear',
          valueUnits: 'year',
          start: '2010',
          end: '2019',
          andLower: false,
        },
      ],
      LTV:[
        {
          dimensionName: 'LTV',





















