import { decimalUtils } from 'components/CoreProduct/util/DecimalUtils';
import { Term } from '../types/RateTypes';

export const indexOfCreditRangeGap = (terms: Term[]) => {
return indexOfGap(terms, 0.01);
};

export const indexOfGap = (
objs: Array<{ low?: number | string; high?: number | string }>,
increment: number,
): number | undefined => {
let i = 1;
for (const second of objs.slice(1)) {
const first = objs[i - 1];
if (!first.high) return;
if (!second.low) return;
if (
(decimalUtils.toDec(second.low) - decimalUtils.toDec(first.high)).toFixed(
        ],
) !== increment.toFixed(2).toString()
    } {
return i - 1;
}
i = i + 1;
}
return;
};

export const insertIntoGap = (terms: Term[], i: number, term: Term) =>

