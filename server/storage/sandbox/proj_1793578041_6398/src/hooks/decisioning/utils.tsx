import { LogicalGroupNode, ConditionNode } from 'core/entities/decisioning';
import { SetNodeCallback } from 'components/organisms/Rule';

export const setNodesRecursively = (node: ConditionNode | LogicalGroupNode, processNode: SetNodeCallback) => {
switch (node.type) {
case 'single':
processNode(node);
break;
case 'compound':
case 'logicGroup':
node.nodes.forEach((n) => setNodesRecursively(n, processNode));
break;
default:
throw new Error(`Invalid logic type: ${(node as ConditionNode).type}`);
}
};
