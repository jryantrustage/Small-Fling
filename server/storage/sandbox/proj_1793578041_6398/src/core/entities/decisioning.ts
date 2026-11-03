export type LogicalOperators = 'all' | 'any';

export type RuleMode = 'edit' | 'template' | 'view';

export interface IRuleOperatorData {
operator: string;
label: string;
}
























* Single Condition Node
*
* Contains the actual condition properties, can be considered a "leaf" in the node tree
*/
export interface SingleConditionNode {
type: 'single';
condition: IConditionProperties;
allowAnd?: boolean;
allowOr?: boolean;
}

/**
* Logical Group Node
*
* Contains a list of any other type of Condition Node.  Represents a set of condtions using the same logical operator
*/
export interface LogicalGroupNode {
type: 'logicGroup';
logicType: LogicalOperators;
nodes: ConditionNode[];
allowAddRemove?: boolean;
}

/**
























operator: IRuleOperatorData['operator'];
value: string;
errorText?: string;
}

export interface RuleStructure {
version: number;
mode: RuleMode;
node: RootConditionNode;
facts: IFact[];
}

export type RuleSetTemplateType = 'individual';

export interface RuleSetTemplate {
version: number;
type: RuleSetTemplateType;
name: string;
rules: RuleStructure[];
}
