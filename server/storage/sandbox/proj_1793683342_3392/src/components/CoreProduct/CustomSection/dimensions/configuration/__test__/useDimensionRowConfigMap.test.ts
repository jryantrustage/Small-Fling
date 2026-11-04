












creditRange_0_High: 2,
creditRange_0_Low: 1,
creditRange_0_Name: 'Excellent',
creditRange_1_High: 3,
creditRange_1_Low: 2,
creditRange_1_Name: 'Very Good',
creditRange_2_High: 4,
creditRange_2_Low: 3,
creditRange_2_Name: 'Good',
creditRange_3_High: 5,
creditRange_3_Low: 4,
creditRange_3_Name: 'Average',
creditRange_4_High: 6,
creditRange_4_Low: 5,
creditRange_4_Name: 'Below Average',
creditRange_5_High: 7,
creditRange_5_Low: 6,
creditRange_5_Name: 'null',
creditRange_6_High: 0,
creditRange_6_Low: 0,
creditRange_6_Name: 'null',
creditRange_7_High: 0,
  creditRange_7_Low: 0,
  creditRange_7_Name: 'null',
  creditRange_8_High: 0,
  creditRange_8_Low: 0,
  creditRange_8_Name: 'null',
  creditRange_9_High: 0,
  creditRange_9_Low: 0,
  creditRange_9_Name: 'null',
};

const mockResponse = {
  result: {},
  payload: mockResponseData,
};

test('parseRangeTitles - Correct mapping', () => {
  const pTitles = parseRangeTitles(mockResponseData);
  expect(pTitles.length).toBe(5);
  expect(pTitles.find((titles) => titles === 'Very Good'));
}};

t test('useDimensionRowConfigMap - Bad response', async () => {
  jest.spyOn(window, 'fetch').mockImplementationonce((): any => {
return Promise.resolve({
ok: true,
json: () => {},
    }};
  }};
const mockConsole = jest.spyOn(console, 'error');
const { result, waitFor } = renderHook(() => useDimensionRowConfigMap(), {
wrapper,
  }};

  await waitFor(() =>
expect(mockConsole).toHaveBeenCalledWith(
"Data didn't come back correctly from endpoint.",
    },
  };

  const { CreditScoreRanges } = result.current;
const rowsConfig =
CreditScoreRanges &&
CreditScoreRanges.tableRowsConfigFN &&
CreditScoreRanges.tableRowsConfigFN();
expect(rowsConfig).toEqual([]);
}};

test('useDimensionRowConfigMap - Good response formatted config map', async () => {
mockGetOnce(mockResponse);
const { result, waitForNextUpdate } = renderHook(
() => useDimensionRowConfigMap(),
{ wrapper },
  };

  await waitForNextUpdate();
const { CreditScoreRanges, Rate } = result.current;
const creditRowsConfig =
CreditScoreRanges &&
CreditScoreRanges.tableRowsConfigFN &&
CreditScoreRanges.tableRowsConfigFN();
const rateRowsConfig =
Rate && Rate.tableRowsConfigFN && Rate.tableRowsConfigFN();

  expect(creditRowsConfig?.length).toBe(5);
expect(rateRowsConfig?.length).toBe(1);

  const veryGood = creditRowsConfig?.find(
(con) => con.category === 'Very Good',



expect(veryGood?.defaultValue).toBe('2.5');
}};
