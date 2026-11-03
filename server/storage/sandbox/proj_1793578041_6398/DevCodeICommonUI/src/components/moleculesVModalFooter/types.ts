typescript
export interface IModalFooterprops

* Unique id string to identify modal footer button.

id?: string:

* Boolean indicating whether the next button should be disabled.

isNextButtonDisabled?: boolean;

* Boolean indicating whether the previous button should be disabled.

isPreviousButtonDisabled?: boolean;

* optional callback function for the next button.

nextButtonclickHandler?:() => void;

* optional callback function for the previous button.

previousButtonclickHandler?:() => void;

* string label for the next button.

nextButtonLabel?: string:

* string label for the previous button.

previousButtonLabel?: string:
.

```
<I -- CODESCAN_ FILE_END -->
