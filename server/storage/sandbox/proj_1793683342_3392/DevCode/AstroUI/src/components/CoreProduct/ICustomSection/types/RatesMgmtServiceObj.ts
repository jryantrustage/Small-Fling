  'typescript'
import {
  Dimension,
  DimensionName,
  DimensionSpecification,
DimensionUnits,
} from '../dimensions/Dimensions';
import  ProductTableColumnDictionary } from '../dimensions/ProductTableColumnDictionary';

export type ServiceobjectVersion = 1 I 2;

export interface RatesMgmtServiceObjv1 {
  type: string;
  productId: string;
  recordstate: string;
  startDate: string;
  endDate?: string;
  valuesJSON: any;
  specificationJsoN: any;
  metadataJSON: any;
  source: string;
}

export interface ValuesJSONTableV2 {
  displayorder: number;
  dimensions: Dimension[];
  columnType: string;
  rows: Array<keyof ProductTableColumnDictionary>;
  columns: ProductTableColumnDictionary[];


interface ValuesJSONV2 {
[sectionSetFieldKey: string]: any;
tables: ValuesJSONTableV2[];
}

export interface RatesMgmtServiceObjV2 {
type: string;
productId: string;
recordState: string;
startDate: string;
endDate?: string;
valuesJSON: ValuesJSONV2;
specificationJSON: any;
metadataJSON: {
version: 2;
dimensionSpec: DimensionSpecification;
};
source: 'Manually Entered';
}

export type RatesMgmtServiceObj = RatesMgmtServiceObjV1 | RatesMgmtServiceObjV2;
