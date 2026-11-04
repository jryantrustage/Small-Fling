import React from 'react';
import Button from '@material-ui/core/Button';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogTitle from '@material-ui/core/DialogTitle';

interface Props {
title: string;
content: React.ReactNode;
isOpen: boolean;
onAgree: () => void;
onDisagree: () => void;
}

const AlertDialog: React.FC<Props> = ({
onAgree,
onDisagree,
isOpen,
title,
content,
}) => {
return (
<div>
<Dialog
open={isOpen}
onClose={onDisagree}
aria-labelledby="alert-dialog-title"

>
<DialogTitle id="alert-dialog-title">{title}</DialogTitle>
<DialogContent>
<DialogContentText id="alert-dialog-description">
{content}
</DialogContentText>
</DialogContent>
<DialogActions>
<Button onClick={onDisagree} color="primary">
Disagree
</Button>
<Button onClick={onAgree} color="primary" autoFocus>
Agree
</Button>
</DialogActions>
</Dialog>
</div>
  };
};

export default AlertDialog;
