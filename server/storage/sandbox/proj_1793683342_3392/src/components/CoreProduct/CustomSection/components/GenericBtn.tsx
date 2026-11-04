-'typescript'
import React from 'react';
import Button from 'components/CustomButtons/Button';

interface Props {
  label: string;
  onclick: () => void;
  id?: string;
}

const AddBtn: React.FC<Props> = ({ id, label, onclick }) => {
  return(
    <Button
      id={id ?? ‘generic-btn-${label}''}
      round
      color="primary"
      onclick={onlick}
    >
      {label}
    </Button>
  };
};

export default AddBtn;
