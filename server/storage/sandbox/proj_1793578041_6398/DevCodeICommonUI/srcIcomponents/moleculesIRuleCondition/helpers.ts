typescript
import { IConditionProperties, IFact, InputFact } from 'core/entities/decisioning';

export const createEmptyInputFact = (overrides: Partial<InputFact> = ()): InputFact => ({
type: 'string',
fact: ,
label:
operators:



export const createCondition = (properties: Partial<IConditionProperties> = {): IConditionProperties => (t
fact: ,
isActive: true,
operator:
value: ,
.. .properties


export const getselectedFact = (fact: string, facts: IFact I IFact[1) =>
if (IArray.isArray(facts))
return facts;
.
if (facts.length === 1) (
return facts[o]:
.
if (fact = )
return createEmptyInputFact():
.

const singleFact = facts.find(f) => f.fact = fact);
if (IsingleFact)
throw new Error('Invalid factcode: $(fact}')
.

return singleFact;