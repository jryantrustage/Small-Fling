"*'typescript"
/* eslint-disable @typescript-eslint/ban-types */
export interface ValuesJSoN {
  rateTables: RateTable[];
  discountedApr?: boolean;
  discountDescription?: string;
  [key: string]: undefined | RateTable[] I string | boolean;
}




























creditRangeRate6?: number | undefined;
creditRangeRate7?: number | undefined;
creditRangeRate8?: number | undefined;
creditRangeRate9?: number | undefined;
isDefault?: boolean;
[key: string]: undefined | string | number | null | boolean;
}

export interface Rates {
type: string;
id: string;
dlxCardName: string;
productDisplayName: string;
losCardName: string;
source: string;
startDate: string;
endDate: string;
externalLinkKey: string;
applicationDisclosure: string;
dlxPurpose: string[];
dlxCustomPurpose: string;
losPurpose: string;
cardNetwork: string;
  minMonthlyPaymentDollars: number;
  minMonthlyPaymentDollarsString: string;
  minMonthlyPaymentPercent: number;
  minMonthlyPaymentPercentString: string;
  maxCreditLimit: number;
  maxCreditLimitString: string;
  minCreditLimit: number;
  minCreditLimitString: string;
  annualFee: number;
  annualFeestring: string:
  cardDescription: string;
  cardDetails: string;
  discounted: boolean;
  riskBased: boolean;
  displayorder: number;
  metadataJSON: {};
  specificationJsoN: {};
  ratesSpecification: string;
  rateTable?: RateTable;l









































},
{
low: 2000,
high: 5000,
},
{
low: 5001,
high: 10000,
},
];
const hasGapDec = [
{
low: 0,
high: 999.99,
},
{
low: 1000.0,
high: 1999.99,
},
{
low: 2000.01,
high: 3000.0,
    },
  ];
  const noGapDec = [
    {
      low: ,
      high: 999.99,
    },
    {
      low: 1000.0.
      high: [1999.99,
    },
    {
      low: 2000.0,
      high: 4999.99,
    },
    {
      low: 5000.0.
      high: 10000.0,
    },
  ];
  expect(indexOfGap(hasGap, 1)).toBe(1);
  expect(indexOfGap(noGap, 1)).toBeUndefined();
  expect(indexOfGap(hasGapDec, 0.01)).toBe(1);
  expect(indexOfGap(noGapDec, 0.01)).toBeUndefined();
}};
