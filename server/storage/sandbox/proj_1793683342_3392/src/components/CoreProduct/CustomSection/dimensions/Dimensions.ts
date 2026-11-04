*'typescript'
import { Rows, SectionTableConfig } from '../CustomSectionTable';
import { ProductTableColumnDictionary } from './ProductTableColumnDictionary';

export type DimensionUnits = 'year' I 'percent' I 'number' I 'constant';
export type DimensionName =
    'ModelYear'
    'ltv'
    'LoanAmount'
    'TermLength'
    'Purpose'
    'CreditScoreRanges'
| 'Rate'
| 'FixedAmount';
// Used on the backend
export type DimensionColumnType =
| 'TermLength'
| 'TermOnly'
| 'RiskOnly'
| 'Purpose'
| 'PurposeOnly'
| 'SimpleRate';

export interface DimensionSpecification {
column: {
dimensionName: DimensionName;
dimensions: Dimension[];
};
row?: {
dimensionName: DimensionName;
dimensions: Dimension[];
};
extraDimensions?: Partial<Record<DimensionName, Dimension[]>>;
}

export interface ColumnOverride {
tableColumnConfig: SectionTableConfig<ProductTableColumnDictionary>['columnData'];
dimensions: Dimension[];
}

export interface DimensionConfig {
dimensionName: DimensionName;
displayName: string;
labelFN: (dim: Dimension) => string;
initDimension: () => Dimension;
translateDimensionToDictionary: (
dim: Dimension,
) => Partial<ProductTableColumnDictionary>;
dimensionOverride?: () => Dimension[];
columnOverride?: () => ColumnOverride;
excludeAsExtraDimension?: boolean;
excludeAsColumnDimension?: boolean;
}

export interface Dimension {
dimensionName: DimensionName;
valueUnits: string;
start?: string;
end?: string;
constant?: string;
andLower?: boolean;
andHigher?: boolean;
endInclusive?: boolean;
}
