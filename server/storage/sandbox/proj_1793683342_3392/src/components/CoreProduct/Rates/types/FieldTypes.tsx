import { Rates } from './RateTypes';

export interface RateTypeField {
label: string;
label2?: string;
id: string;
id2?: string;
value: string;
required: boolean;
isRateTableValue?: boolean;
isValuesJSON?: boolean;
displayValue?: string;
displayValue2?: string;
prefix?: string;
prefix2?: string;
suffix?: string;
suffix2?: string;
type?: string;
multiline?: boolean;
rows?: number;
style?: { [key: string]: string };
component?: CustomFieldComponentParams;
}

export interface CustomFieldComponentParams {
  {
ratesDisplayOrder: number,
rates: Rates,
fieldErrorState: { [key: string]: { isInvalid: boolean; message: string } },
index: number,
updateRatesMap: (
ratesId: string,
ratesFunc: (prevRates: Rates) => Rates,
) => void | null,
updateTableFields: (
displayOrder: number,
entries: [string, string | boolean][],
) => void | null,
validateChange: (
event: any,
ratesDisplayOrder: number,
optionalMultiValues: string[] | null,
tableId?: number | undefined,
) => Promise<null | undefined>,
tableId?: number,
  ): JSX.Element;
  displayName: string;
}
