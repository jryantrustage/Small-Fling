






















const isComparisonRuleInput = (subcomponent: IChildRuleBuilderState): subcomponent is IComparisonRuleInputState =>
subcomponent.type === 'comparison';

const isRuleBuilderState = (subcomponent: IChildRuleBuilderState): subcomponent is IRuleBuilderState =>
subcomponent.type !== 'comparison';

export const getComparisonSubcomponents = (subcomponents: IChildRuleBuilderState[]) => {
return subcomponents.filter(isComparisonRuleInput);
};

export const getRuleBuilderState = (subcomponents: IChildRuleBuilderState[]) => {
return subcomponents.filter(isRuleBuilderState);
};

export const getSortedSubcomponents = (subcomponents: IChildRuleBuilderState[]) => {
const nonComparisonSubcomponents = subcomponents.filter((subcomponent) => subcomponent.type !== 'comparison');
const comparisonSubcomponents = getComparisonSubcomponents(subcomponents);
return [...comparisonSubcomponents, ...nonComparisonSubcomponents];
};

const getAdjacentSelectedSubcomponents = (subcomponents: IComparisonRuleInputState[]) => {
let tempGroup = [] as IComparisonRuleInputState[];
const adjacentSelectedRules = subcomponents.reduce((acc, curr, i) => {
if (!curr.checked) {
























const comparisonSubcomponents = getComparisonSubcomponents(subcomponents);
const adjacentSelectedSubcomponents = getAdjacentSelectedSubcomponents(comparisonSubcomponents);
return adjacentSelectedSubcomponents.some(
(subcomponentGroup) => subcomponentGroup[0]?.id?.toLowerCase() === id?.toLowerCase()
);
};

export const isPreGroupedSubcomponent = (subcomponents: IChildRuleBuilderState[], id?: string) => {
const comparisonSubcomponents = getComparisonSubcomponents(subcomponents);
const adjacentSelectedSubcomponents = getAdjacentSelectedSubcomponents(comparisonSubcomponents);
return adjacentSelectedSubcomponents.some((subcomponentGroup) =>
subcomponentGroup.map((subcomponent) => subcomponent.id).includes(id)
);
};

// splits out error key and pulls first numerical value which is always the top rule level index
export const getTopLevelRuleErrorState = (validationErrors: Record<string, string>, i: number) => {
return Object.keys(validationErrors)
.map((errorKey) => {
const splitKey = errorKey.split('-');
const parentRuleIndex = splitKey.find((element) => !Number.isNaN(+element));
return parentRuleIndex ? +parentRuleIndex : null;
})
.includes(i);























import React from 'react';
import { useTypedTranslation } from 'i18n';
import { getColumnConfiguration } from 'helpers/rules/syntaxUtils';
import { getOperatorDisplayValue } from 'helpers/rules/comparisonSyntaxUtils';
import { FieldDataType, IChildRuleBuilderState, IRootRuleBuilderState } from 'helpers/rules/types';
import {
SCClausePreviewWrapper,
SCClauseValuesWrapper,
SCIfWrapper,
SCInnerClausePreviewWrapper,
SCLogicalOperatorWrapper,
SCOuterClausePreviewWrapper,
SCRulePreviewWrapper,
SCSubcomponentGroup,
SCSubcomponentGroupWrapper,
} from './styles';
import { IRulePreviewProps } from './types';
import { getComparisonSubcomponents, getSortedSubcomponents } from '../RuleBuilder/utils';

const RulePreview = ({ rule, fieldSpec }: IRulePreviewProps): JSX.Element => {
const id = 'rule-preview';
const { t } = useTypedTranslation();
const parseEmbeddedSubcomponentsForPreview = (
parentSubcomponent: IChildRuleBuilderState | IRootRuleBuilderState,
























{level === 1 && parentIndex === 0 && i === 0 ? <span>{t('RULES_PREVIEW_IF')}</span> : ''}
{`${fieldName} ${getOperatorDisplayValue(`
dataType as FieldDataType,
operator
)} ${comparisonDisplayValue}`}
</SCClauseValuesWrapper>
</SCInnerClausePreviewWrapper>
{i !== sortedSubcomponents.length - 1 && (
<SCLogicalOperatorWrapper>{parentSubcomponent.type}</SCLogicalOperatorWrapper>
)}
</SCClausePreviewWrapper>
);
}

              return (
// eslint-disable-next-line react/no-array-index-key
<SCSubcomponentGroupWrapper key={`${id}-${level}-${i}-preview-group-key`}>
<SCSubcomponentGroup level={level} id={`${id}-${level}-preview-group`}>
{parseEmbeddedSubcomponentsForPreview(subcomponent, level + 1, i)}
</SCSubcomponentGroup>
{i !== sortedSubcomponents.length - 1 && (
<SCLogicalOperatorWrapper>{parentSubcomponent.type}</SCLogicalOperatorWrapper>
)}
</SCSubcomponentGroupWrapper>

























export const SCRulePreviewWrapper = styled.div`
margin: 0 0 16px 38px;
`;

export const SCOuterClausePreviewWrapper = styled.div`
position: relative;
display: flex;
padding-top: 24px;
padding-bottom: 16px;

`;
export const SCClausePreviewWrapper = styled.div`
margin-left: 11px;
`;

export const SCInnerClausePreviewWrapper = styled.div`
display: flex;
`;

export const SCIfWrapper = styled.div`
position: absolute;
left: -10px;
color: ${Theme.getColor('contrastGreyscale08')};
























export const SCSubcomponentGroup = styled.div<{ level?: number }>`
position: relative;
box-sizing: border-box;
margin-bottom: 8px;
padding: 4px 0 4px 0;
&::before {
position: absolute;
width: 4px;
height: 100%;
left: ${({ level }) => (level === 0 ? '-10px' : '-2px')};
top: 0;
border-left: 2px solid ${Theme.getColor('contrastGreyscale06')};
border-top: 2px solid ${Theme.getColor('contrastGreyscale06')};
border-bottom: 2px solid ${Theme.getColor('contrastGreyscale06')};
border-radius: 8px 0 0 8px;
content: '';
}
`;

export const SCSubcomponentGroupWrapper = styled.div``;
