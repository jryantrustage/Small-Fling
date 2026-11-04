/* istanbul ignore file */
import * as React from 'react';
import PropTypes from 'prop-types';
import clsx from 'clsx';
import { withstyles } from '@material-ui/core/styles';
import Popper from '@material-ui/core/Popper';
o37 import ListSubheader from '@material-ui/core/ListSubheader';
import Paper from '@material-ui/core/Paper';
o39 import IconButton from '@material-ui/core/IconButton';
o import Chip from '@material-ui/core/Chip';
o41 import closeIcon from '@material-ui/icons/close';
o42 import ArrowDropDownIcon from '@material-ui/icons/ArrowDropDown';
import useAutocomplete, { createFilterOptions } from './useAutocomplete';

export { createFilter0ptions };

export const styles = (theme) => ({
  /* Styles applied to the root element. */
  root: {
    '&sfocused $clearIndicatorDirty': {
      visibility: 'visible',






















maxWidth: 'calc(100% - 4px)',
},
/* Styles applied when the popup icon is rendered. */
hasPopupIcon: {},
/* Styles applied when the clear icon is rendered. */
hasClearIcon: {},
/* Styles applied to the Input element. */
inputRoot: {
flexWrap: 'wrap',
'$hasPopupIcon &, $hasClearIcon &': {
paddingRight: 26 + 4,
},
    '$hasPopupIconshasClearIcon &': {
paddingRight: 52 + 4,
},
'& $input': {
width: 0,
minWidth: 30,
},
'&[class*="MuiInput-root"]': {
paddingBottom: 1,
'& $input': {
padding: 4,
      },
      '& $input:first-child': {
        padding: '6px 0',
      },
    },
    '&[class*="MuiInput-root"][class*="MuiInput-marginDense"j': {
      '& $input': {
        padding: '2px 4px 3px',
      },
      '& $input:first-child': {
        padding: '1px 0 4px',
      },
    },
    '&[class*="MuioutlinedInput-root"j': {
      padding: 9,
      '$hasPopupIcon &, $hasClearIcon &': {
        paddingRight: 26 + 4 + 9,
      },
      '$hasPopupIcon$hasClearIcon &': {
        paddingRight: 52 + 4 + 9,
      },











































    textoverflow: 'ellipsis',
    opacity: 0,
  },
  /* Styles applied to the input element if tag focused. */
  inputFocused: {
    opacity: 1.
  },
  /* Styles applied to the endAdornment element. */
  endAdornment: {
    // we use a position absolute to support wrapping tags.
    position: 'absolute',
    right: 0,
    top: 'calc(50% - 14px)', // Center vertically
  },
  /* Styles applied to the clear indicator. */
  clearIndicator: {
    marginRight: -2.
    padding: 4,
    visibility: 'hidden',
  },
  /* Styles applied to the clear indicator if the input is dirty. */
  clearIndicatorDirty: {},
  /* styles lapplied to the popup indicator. */
  popupIndicator: {
    padding: 2,
    marginRight: -2,
  },
  /* Styles applied to the popup indicator if the popup is open. */
  popupIndicatorOpen: {
    transform: 'rotate(180deg)',
  },
  /* Styles applied to the popper element. */
  popper: {
    zIndex: theme.zIndex.modal,
  },
  /* Styles applied to the popper element if 'disablePortal={true}'. */
  popperDisablePortal: {
    position: 'absolute',
  },
  /* Styles applied to the 'Paper' component. */
  paper: {
    ...theme.typography.body1.
    overflow: 'hidden',
    margin: '4px 0',
  },
/* Styles applied to the `listbox` component. */
listbox: {
listStyle: 'none',
margin: 0,
padding: '8px 0',
maxHeight: '40vh',
overflow: 'auto',
},
/* Styles applied to the loading wrapper. */
loading: {
color: theme.palette.text.secondary,
padding: '14px 16px',
},
/* Styles applied to the no option wrapper. */
noOptions: {
color: theme.palette.text.secondary,
padding: '14px 16px',
},
/* Styles applied to the option elements. */
option: {
minHeight: 48,
display: 'flex',
justifyContent: 'flex-start',
alignItems: 'center',
cursor: 'pointer',
paddingTop: 6,
boxSizing: 'border-box',
outline: '0',
WebkitTapHighlightColor: 'transparent',
paddingBottom: 6,
paddingLeft: 16,
paddingRight: 16,
[theme.breakpoints.up('sm')]: {
minHeight: 'auto',
},
'&[aria-selected="true"]': {
backgroundColor: theme.palette.action.selected,
},
'&[data-focus="true"]': {
backgroundColor: theme.palette.action.hover,
    },
    '&:active': {
      backgroundColor: theme.palette.action.selected,
    },
    '&[aria-disabled="true"j': {
      opacity: 0.5,
      pointerEvents: 'none',
    },
  },
  /* Styles applied to the group's label elements. */
  groupLabel: {
    backgroundColor: theme.palette.background.paper,
    top: -8,
  },
  /* Styles applied to the group's ul elements. */
  groupul: {
    padding: 0,
    '& $option': {
      paddingLeft: 24,
    },
  },
}};

function DisablePortal(props) {
  // eslint-disable-next-line react/prop-types
  const { anchorEl, open, ...other } = props;
return <div {...other} />;
}

const Autocomplete = React.forwardRef(function Autocomplete(props, ref) {
/* eslint-disable @typescript-eslint/no-unused-vars */
const {
autoComplete = false,
autoHighlight = false,
autoSelect = false,
blurOnSelect = false,
ChipProps,
classes,
className,
clearOnBlur = !props.freeSolo,
clearOnEscape = false,
clearText = 'Clear',
closeIcon = <CloseIcon fontSize="small" />,
closeText = 'Close',
debug = false,
defaultValue = props.multiple ? [] : null,
disableClearable = false,
disableCloseOnSelect = false,
disabled = false,
disabledItemsFocusable = false,
disableListWrap = false,
disablePortal = false,
filterOptions,
filterSelectedOptions = false,
forcePopupIcon = 'auto',
freeSolo = false,
fullWidth = false,
getLimitTagsText = (more) => `+${more}`,
getOptionDisabled,
getOptionLabel = (option) => option.label ?? option,
getOptionSelected,
groupBy,
handleHomeEndKeys = !props.freeSolo,
id: idProp,
includeInputInList = false,
inputValue: inputValueProp,
limitTags = -1,
ListboxComponent = 'ul',
ListboxProps,
loading = false,
loadingText = 'Loading…',

noOptionsText = 'No options',
onChange,
onClose,
onHighlightChange,
onInputChange,
onOpen,
open,
openOnFocus = false,
openText = 'Open',
options,
PaperComponent = Paper,
PopperComponent: PopperComponentProp = Popper,
popupIcon = <ArrowDropDownIcon />,
renderGroup: renderGroupProp,
renderInput,
renderOption: renderOptionProp,
renderTags,
selectOnFocus = !props.freeSolo,
size = 'medium',
value: valueProp,
...other
} = props;
/* eslint-enable @typescript-eslint/no-unused-vars */



  const {
getRootProps,
getInputProps,
getInputLabelProps,
getPopupIndicatorProps,
getClearProps,
getTagProps,
getListboxProps,
getOptionProps,
value,
dirty,
id,
popupOpen,
focused,
focusedTag,
anchorEl,
setAnchorEl,
inputValue,
groupedOptions,
} = useAutocomplete({ ...props, componentName: 'Autocomplete' });

  let startAdornment;

  if (multiple && value.length > 0) {
const getCustomizedTagProps = (params) => ({
className: clsx(classes.tag, {
[classes.tagSizeSmall]: size === 'small',
      }},
disabled,
...getTagProps(params),
    }};

    if (renderTags) {
startAdornment = renderTags(value, getCustomizedTagProps);
} else {
startAdornment = value.map((option, index) => (
<Chip
key={getOptionLabel(option)}
label={getOptionLabel(option)}
size={size}
{...getCustomizedTagProps({ index })}
{...ChipProps}
        [>
      }};
}























  const renderGroup = renderGroupProp || defaultRenderGroup;
const defaultRenderOption = (props2, option) => (
<li {...props2}>{getOptionLabel(option)}</li>
  };
const renderOption = renderOptionProp || defaultRenderOption;

  const renderListOption = (option, index) => {
const optionProps = getOptionProps({ option, index });

    return renderOption({ ...optionProps, className: classes.option }, option, {
selected: optionProps['aria-selected'],
inputValue,
    }};
};

  const hasClearIcon = !disableClearable && !disabled;
const hasPopupIcon =
(!freeSolo || forcePopupIcon === true) && forcePopupIcon !== false;

  return (
<React.Fragment>
<div
ref={ref}
        className={clsx(
          classes.root,
          {
            [classes.focused]: focused,
            [classes.fullwidth]: fullwidth,
            [classes.hasClearIcon]: hasClearIcon,
            [classes.hasPopupIcon]: hasPopupIcon,
          },
          className,
        }}
        {...getRootProps(other)}
      >
        {renderInput(
          id,
          disabled,
          fullwidth: true,
          size: size === 'small' ? 'small' : undefined,
          InputLabelProps: getInputLabelProps(),
          InputProps: {
            ref: setAnchorEl,
           className: classes.inputRoot,






















className={clsx(classes.popupIndicator, {
[classes.popupIndicatorOpen]: popupOpen,
                   }]}
>
{popupIcon}
</IconButton>
) : null}
</div>
            ],
},
inputProps: {
className: clsx(classes.input, {
[classes.inputFocused]: focusedTag === -1,
            }],
disabled,
...getInputProps(),
},
        }]}
</div>
{popupOpen && anchorEl ? (
<PopperComponent
className={clsx(classes.popper, {
[classes.popperDisablePortal]: disablePortal,
          }]}
          style={{
            width: anchorEl ? anchorEl.clientwidth : null,
          }}
          role="presentation"
          anchorEl={anchorEl}
          open
        >
          <PaperComponent className={classes.paper}>
            {loading && groupedoptions.length === 0 ? (
              <div className={classes.loading}>{loadingText}</div>
            ):null
            {groupedoptions.length === 0 && !freeSolo && !loading ? (
              <div className={classes.no0ptions}>{no0ptionsText}</div>
            ):null}
            groupedoptions.length > 0 ? (
              <ListboxComponent
                className={classes.listbox}
                {...getlistboxProps()}
                {...Listboxprops}
              >















</PopperComponent>
) : null}
</React.Fragment>
  };
}};

Autocomplete.propTypes = {
// ----------------------------- Warning --------------------------------
// | These PropTypes are generated from the TypeScript type definitions |
// |     To update them edit the d.ts file and run "yarn proptypes"     |
  [[ ``````````````````````````````````````````````````````````````````````
  [>>
* If `true`, the portion of the selected suggestion that has not been typed by the user,
* known as the completion string, appears inline after the input cursor in the textbox.
* The inline completion string is visually highlighted and has a selected state.
* @default false
   >[
autoComplete: PropTypes.bool,
  [>>
* If `true`, the first option is automatically highlighted.
* @default false
   >[
autoHighlight: PropTypes.bool,
  [>>
   * If 'true', the selected option becomes the value of the input
   * when the Autocomplete loses focus unless the user chooses
   * a different option or changes the character string in the input.
   * @default false
   >[
  autoSelect: PropTypes.bool,
  [>>
     Control if the input should be blurred when an option is selected:
   >
       'false' the input is not blurred.
       'true' the input is always blurred.
       'touch' the input is blurred after a touch event.
       'mouse' the input is blurred after a mouse event.
     @default false
   >[
  blurOnSelect: PropTypes.oneofType([
    PropTypes.oneof(['mouse', 'touch'J),
    PropTypes.bool.
  ]},
  [>>






















*/
clearOnEscape: PropTypes.bool,
  [>>
* Override the default text for the *clear* icon button.
   >
* For localization purposes, you can use the provided [translations](/guides/localization/).
* @default 'Clear'
   >[
clearText: PropTypes.string,
  [>>
* The icon to display in place of the default close icon.
* @default <CloseIcon fontSize="small" />
   >[
closeIcon: PropTypes.node,
  [>>
* Override the default text for the *close popup* icon button.
   >
* For localization purposes, you can use the provided [translations](/guides/localization/).
* @default 'Close'
   >[
closeText: PropTypes.string,
  [>>
* If `true`, the popup will ignore the blur event if the input is filled.
   * You can inspect the popup markup with your browser tools.
   * Consider this option when you need to customize the component.
   * @default false
   >[
  debug: PropTypes.bool,
  [>>
   * The default input value. Use when the component is not controlled.
   * @default props.multiple ? [] : null
   >[
  defaultValue: PropTypes.any,
  [>>
   * If 'true', the input can't be cleared.
    @default false
   >[
  disableClearable: PropTypes.bool,
  [>>
   * If 'true', the popup won't close when a value is selected.
    @default false
   >[
  disablecloseOnSelect: PropTypes.bool,
  [>>

















   >[
  disablePortal: PropTypes.bool,
  [>>
    A filter function that determines the options that are eligible.
   >
    @param {T[J} options The options to render.
    @param {object} state The state of the component.
    @returns {T[]}
   >[
  filterOptions: PropTypes.func,
  [>>
   * If 'true', hide the selected options from the list box.
   * @default false
   >[
  filterSelectedoptions: PropTypes.bool,
   [>>
   * Force the visibility display of the popup icon.
   * @default 'auto'
   >[
  forcePopupIcon: PropTypes.oneofType([
    PropTypes.oneof(['auto'J),
    PropTypes.bool,
  ]},


    @default false
   >[
  freeSolo: PropTypes.bool,
  [>>
   * If 'true', the input will take up the full width of its container.
   * @default false
   >[
  fullwidth: PropTypes.bool,
  [>>
   * The label to display when the tags are truncated ('limitTags').
   >
   * @param (number) more The number of truncated tags.
   * @returns {ReactNode}
   * @default (more) => '+$(more}"
   >[
  getLimitTagsText: PropTypes.func,
  [>>
   * Used to determine the disabled state for a given option.
   >
     @param {T} option The option to test.
    @returns {boolean}
   >[
  getOptionDisabled: PropTypes.func,















































* The maximum number of tags that will be visible when not focused.
* Set `-1` to disable the limit.
* @default -1
   >[
limitTags: PropTypes.number,
  [>>
* The component used to render the listbox.
* @default 'ul'
   >[
ListboxComponent: PropTypes.elementType,
  [>>
* Props applied to the Listbox element.
   >[
ListboxProps: PropTypes.object,
  [>>
* If `true`, the component is in a loading state.
* @default false
   >[
loading: PropTypes.bool,
  [>>
* Text to display when in a loading state.
   >
* For localization purposes, you can use the provided [translations](/guides/localization/).




















"clear".
   >[
  onChange: PropTypes.func,
  [>>
   * Callback fired when the popup requests to be closed.
   * Use in controlled mode (see open).
   >
   * @param {object} event The event source of the callback.
    @param {string} reason Can be: `"toggleInput"* `"select-option" remove- option" "blur
   >[
  onclose: PropTypes.func,
  [>>
   * Callback fired when the highlight option changes.
   >
     @param {object} event The event source of the callback.
     @param T} option The highlighted option.
     @param {string} reason Can be: *"keyboard"',""auto"', '"mouse"'.
   >[
  onHighlightChange: PropTypes.func,
  [>>
    * Callback fired when the input value changes.
   >


* @param {string} reason Can be: `"input"` (user input), `"reset"` (programmatic change), `"clear"`.
   >[
onInputChange: PropTypes.func,
  [>>
* Callback fired when the popup requests to be opened.
* Use in controlled mode (see open).
   >
* @param {object} event The event source of the callback.
   >[
onOpen: PropTypes.func,
  [>>
* Control the popup` open state.
   >[
open: PropTypes.bool,
  [>>
* If `true`, the popup will open on input focus.
* @default false
   >[
openOnFocus: PropTypes.bool,
  [>>
* Override the default text for the *open popup* icon button.
   >
* For localization purposes, you can use the provided [translations](/guides/localization/).
* @default 'Open'
   >[
openText: PropTypes.string,
  [>>
* Array of options.
   >[
options: PropTypes.array.isRequired,
  [>>
* The component used to render the body of the popup.
* @default Paper
   >[
PaperComponent: PropTypes.elementType,
  [>>
* The component used to position the popup.
* @default Popper
   >[
PopperComponent: PropTypes.elementType,
  [>>
* The icon to display in place of the default popup icon.
    @default <ArrowDropDownIcon />
   >[
  popupIcon: PropTypes.node,
  [>>
   * Render the group.
   >
    @param {any} option The group to render.
    @returns {ReactNode}
   >[
  renderGroup: PropTypes.func,
  [>>
    * Render the input.
   >
     @param {object} params
     @returns {ReactNode}
   >[
  renderInput: PropTypes.func.isRequired,
  [>>
   * Render the option, use 'getoptionLabel' by default.
   >
     @param object} props The props to apply on the li element.
     @param {T} option The option to render.
     @param {object} state The state of the component.
* @returns {ReactNode}
   >[
renderOption: PropTypes.func,
  [>>
* Render the selected value.
   >
* @param {T[]} value The `value` provided to the component.
* @param {function} getTagProps A tag props getter.
* @returns {ReactNode}
   >[
renderTags: PropTypes.func,
  [>>
* If `true`, the input's text will be selected on focus.
* It helps the user clear the selected value.
* @default !props.freeSolo
   >[
selectOnFocus: PropTypes.bool,
  [>>
* The size of the autocomplete.
* @default 'medium'
   >[
size: PropTypes.oneOf(['medium', 'small']),
  [>>
* The value of the autocomplete.
   >
* The value must have reference equality with the option in order to be selected.
* You can customize the equality behavior with the `getOptionSelected` prop.
   >[
value: PropTypes.any,
};

export default withStyles(styles, { name: 'MuiAutocomplete' })(Autocomplete);
