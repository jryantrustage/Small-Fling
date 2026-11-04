import * as React from 'react';
import { InternalStandardProps as StandardProps } from '@material-ui/core';
import { PopperProps } from '@material-ui/core/Popper';
import {
AutocompleteChangeDetails,
AutocompleteChangeReason,
AutocompleteCloseReason,
AutocompleteInputChangeReason,
createFilterOptions,
UseAutocompleteProps,
} from '../useAutocomplete';

export {
AutocompleteChangeDetails,
AutocompleteChangeReason,
AutocompleteCloseReason,
AutocompleteInputChangeReason,
createFilterOptions,























className: string;
startAdornment: React.ReactNode;
endAdornment: React.ReactNode;
};
inputProps: object;
}

export interface AutocompleteProps<
  ],
Multiple extends boolean | undefined,
DisableClearable extends boolean | undefined,
FreeSolo extends boolean | undefined,
> extends UseAutocompleteProps<T, Multiple, DisableClearable, FreeSolo>,
StandardProps<
React.HTMLAttributes<HTMLDivElement>,
'defaultValue' | 'onChange' | 'children'
> {
  [>>
* Props applied to the [`Chip`](/api/chip/) element.
   >[
ChipProps?: object;
  [>>
* Override or extend the styles applied to the component.
   >[
  classes?: {
    /** Styles applied to the root element. */
    root?: string;
    /* Styles applied to the root element if 'fullwidth={true}'. */
    fullwidth?: string;
    /** Pseudo-class applied to the root element if focused. */
    focused?: string;
    /** Styles applied to the tag elements, e.g. the chips. */
    tag?: string;
    /** Styles applied to the tag elements, e.g. the chips if 'size="small"'. */
    tagsizeSmall?: string;
    /** Styles applied when the popup icon is rendered. */
    hasPopupIcon?: string:
    /** Styles applied when the clear icon is rendered. */
    hasClearIcon?: string;
    /** Styles applied to the Input element. */
    inputRoot?: string;
    /** Styles applied to the input element. */
    input?: string;
    /** Styles applied to the input element if tag focused. */l






















noOptions?: string;
/** Styles applied to the option elements. */
option?: string;
/** Styles applied to the group's label elements. */
groupLabel?: string;
/** Styles applied to the group's ul elements. */
groupUl?: string;
};
  [>>
* The icon to display in place of the default close icon.
* @default <CloseIcon fontSize="small" />
   >[
closeIcon?: React.ReactNode;
  [>>
* Override the default text for the *clear* icon button.
   >
* For localization purposes, you can use the provided [translations](/guides/localization/).
* @default 'Clear'
   >[
clearText?: string;
   [>>
* Override the default text for the *close popup* icon button.
   >
   * For localization purposes, you can use the provided [translations](/guides/localization/).
   * @default 'close'
   >[
  closeText?: string;
  [>>
    If 'true', the input will be disabled.
   * @default false
   >[
  disabled?: boolean;
  [>>
    * The 'Popper' content will be inside the DoM hierarchy of the parent component.
   * @default false
   >[
  disablePortal?: boolean;
  [>>
   * Force the visibility display of the popup icon.
   * @default 'auto'
   >[
  forcePopupIcon?: true I false I 'auto';
  [>>
   * If 'true', the input will take up the full width of its container.






















* @default false
   >[
loading?: boolean;
  [>>
* Text to display when in a loading state.
   >
* For localization purposes, you can use the provided [translations](/guides/localization/).
* @default 'Loading…'
   >[
loadingText?: React.ReactNode;
  [>>
* The maximum number of tags that will be visible when not focused.
* Set `-1` to disable the limit.
* @default -1
   >[
limitTags?: number;
  [>>
* Text to display when there are no options.
   >
* For localization purposes, you can use the provided [translations](/guides/localization/).
* @default 'No options'
   >[
noOptionsText?: React.ReactNode;
  [>>
   * Override the default text for the *open popup* icon button.
   >
   * For localization purposes, you can use the provided [translations](/guides/localization/).
   * @default 'Open'
   >[
  openText?: string;
  [>>
   * The component used to render the body of the popup.
   * @default Paper
   >[
  PaperComponent?: React.ComponentType<React.HTMLAttributes<HTMLElement>>;
  [>>
   * The component used to position the popup.
    @default Popper
   >[
  PopperComponent?: React.ComponentType<PopperProps>;
  [>>
   * The icon to display in place of the default popup icon.
    @default <ArrowDropDownIcon />
   >[


























state: AutocompleteRenderOptionState,
) => React.ReactNode;
  [>>
* Render the selected value.
   >
* @param {T[]} value The `value` provided to the component.
* @param {function} getTagProps A tag props getter.
* @returns {ReactNode}
   >[
renderTags?: (
value: T[],
getTagProps: AutocompleteGetTagProps,
) => React.ReactNode;
  [>>
* The size of the autocomplete.
* @default 'medium'
   >[
size?: 'small' | 'medium';
}

export type AutocompleteClassKey = keyof NonNullable<
AutocompleteProps<any, any, any, any>['classes']
>;

[>>
>
* Demos:
>
* - [Autocomplete](https://material-ui.com/components/autocomplete/)
>
* API:
>
* - [Autocomplete API](https://material-ui.com/api/autocomplete/)
>[
export default function Autocomplete<
  ],
Multiple extends boolean | undefined = undefined,
DisableClearable extends boolean | undefined = undefined,
FreeSolo extends boolean | undefined = undefined,
>{
props: AutocompleteProps<T, Multiple, DisableClearable, FreeSolo>,
): JSX.Element;
