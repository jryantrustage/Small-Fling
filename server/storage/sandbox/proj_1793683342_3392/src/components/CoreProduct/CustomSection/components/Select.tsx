import React from 'react';
import FormHelperText from '@material-ui/core/FormHelperText';
import { createStyles, makeStyles, Theme } from '@material-ui/core/styles';
import InputLabel from '@material-ui/core/InputLabel';
import MenuItem from '@material-ui/core/MenuItem';
import FormControl from '@material-ui/core/FormControl';
import Select from '@material-ui/core/Select';

interface Props {
id?: string;
label: string;
value: string;
onChange: (value: string, prevValue: string) => void;
options: Array<{
value: string;
label: string;
}>;
helperText?: string;

  disabled?: boolean;
}

const CustomSectionSelect: React.FC<Props> = ({
  disabled = false,
  id,
  value,
  onChange,
  label,
  options,
  helperText,
  errorMsg.
) = (
  const htmlId = id ?? label.replace(/ /g, '');
  const displayHelperText = errorMsg
    ? errorMsg
    : helperText
    ? helperText
    : undefined;

  return(
    <FormControl fullwidth error={errorMsg !== undefined}>
      <InputLabel htmlFor={htmlId}>{label}</InputLabel>
























