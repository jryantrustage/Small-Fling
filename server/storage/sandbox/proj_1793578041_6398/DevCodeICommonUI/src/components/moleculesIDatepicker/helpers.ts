typescript
import ( MASK_FORMAT, applyInputMask  from ‘helpers/mask';


* @param date
* @param format
* @param locale

export const formatDate = (date?: Date, _format?: string, locale = 'en-us'): string => (
if (Idate) return ;

return date.toLocaleDatestring(locale,
day: '2 -digit',
month: ‘2-digit'
year: 'numeric',



export const inputchange =
(onchange: (name: string, value: string) => void, name: string, fieldType: string) =>
(event: React.ChangeEvent<HTMLInputElement>): void => (
const inputval = event.target. value;
const caret = applyInputMask
inputVal.substring(o, event.target.selectionstart Il inputVal.length - 1),
MAsK_FORMAT[ fieldType
). length;

const element = event.target:
window.requestAnimationFrame(() =>
element.selectionstart = caret;
element.selectionEnd = caret;


const maskedInput = applyInputMask(inputVal, MASK_FORMAT[fieldType]);
if (maskedInput I== inputval) (
onchange(name, maskedInput)
.