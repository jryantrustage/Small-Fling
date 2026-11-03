/* eslint-disable no-param-reassign */
























* Node for the rule to render.  Note rules are rendered recursivly so this isn't necessarily the root.'
*/
ruleNode: ConditionNode;

  /**
* Handler used all throughout the rule components to update each condition.
*/
setConditions: SetConditionsHandler;

  /**
* Determines how the rule will behave
*
* edit: All conditions/node structure can be edited freely, but restrictions can be overriden by
* the incoming condition structure.
*
* template: Editing the node structure is disabled by default, however restrictions can be
* overriden by the incoming condition structure
*
* view: conditions/node structure are disabled, cannot be overwritten
*/
mode: RuleMode;
}

const getNestedNode = (draft: LogicalGroupNode, m: DepthMap) => {
























};
};

const makeGroup = (logicType: LogicalGroupNode['logicType'], nodes: LogicalGroupNode['nodes']): LogicalGroupNode => {
return {
type: 'logicGroup',
logicType,
nodes,
};
};

export const updateTitle = (setConditions: SetConditionsHandler, updatedTitle: string) => {
setConditions(
produce((draft) => {
const updateDraft = {
...draft,
title: updatedTitle,
};

      return updateDraft;
})
);
};

























      if (n.nodes.length === 2 && n.type === 'logicGroup') {
const { n: parent, i } = getNestedNodeParent(draft, m);
if (parent.type === 'single') {
throw new Error('Was not expecting single');
}
// If moving from 2 children to 1, remove the child node previously holding the 2 nodes and replace
// it with the remaining node
n.nodes.splice(index, 1);
parent.nodes.splice(i, 1, n.nodes[0] as any);
} else {
n.nodes.splice(index, 1);
}
})
);
};

export const groupCondition = (
setConditions: SetConditionsHandler,
depthMap: DepthMap,
index: number,
newCondition: IConditionProperties,
logicType: LogicalOperators
) => {
setConditions(
























m: DepthMap,
newCondition: IConditionProperties
) => {
setConditions(
produce((draft) => {
const n = getNestedNode(draft, m);
if (n.type === 'single') {
throw new Error(`Depth map did not map to a valid node: ${JSON.stringify({ draft, index, depthMap: m })}`);
}
const conditionValidator = getConditionValidator();
const toUpdate = n.nodes[index];
// Compound nodes with a single child node render as a single, so need to catch that and update the single condition node
// in its node list, rather than updating a single condition node directly
if (toUpdate.type === 'compound') {
if (toUpdate.nodes.length !== 1) {
throw new Error('Attempting to update a compound node that has more than one child');
}
conditionValidator(newCondition, toUpdate.nodes[0].condition, facts);
toUpdate.nodes[0].condition = newCondition;
return;
}
if (toUpdate.type !== 'single') {
throw new Error(`Depth map did not map to a valid leaf node: ${JSON.stringify({ draft, index, depthMap: m })}`);
}

























const defaultNode: RootConditionNode = {
title: 'Default',
isRuleActive: true,
type: 'logicGroup',
logicType: 'all',
nodes: [],
};

interface IUseRuleParams {
facts: IFact[];
mode?: RuleMode;
ruleNode?: ConditionNode;
setConditions?: SetConditionsHandler;
initialRuleTemplate?: RootConditionNode;
}

export const useRule = ({
facts: initialFacts,
mode = 'edit',
ruleNode: controlledRuleNode,
setConditions: controlledSetConditions,
initialRuleTemplate = defaultNode,
}: IUseRuleParams) => {
























