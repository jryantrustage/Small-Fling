import React from 'react';
import { makeStyles, Theme, createStyles } from '@material-ui/core/styles';
import Modal from '@material-ui/core/Modal';

function getModalStyle() {
const top = 50; // + rand();
const left = 50; // + rand();


top: `${top}%`,
left: `${left}%`,
transform: `translate(-${top}%, -${left}%)`,
};
}

const useStyles = makeStyles((theme: Theme) =>
createStyles({
paper: {
position: 'absolute',
width: '50%',
backgroundColor: theme.palette.background.paper,
border: '2px solid #000',
boxShadow: theme.shadows[5],
padding: theme.spacing(2, 4, 3),
},
  }},
};

interface Props {
children?: any;
isOpen: boolean;
  title: string;
  onclose: () => void;
}

const CustomSectionModal: React.FC<Props> = ({
  title,
  isopen,
  onclose,
  children,
) => (
  const classes = usestyles();
  // getModalstyle is not a pure function, we roll the style only on the first render
  const [modalstyle] = React.useState(getModalstyle);

  return(
    <Modal
      aria-labelledby="simple-modal-title"
      aria-describedby="simple-modal-description"
      open={isOpen}
      onclose={onclose}
    >
      <div style={modalstyle} className={classes.paper}>
        <h3>{title}</h3>
        {children as any}
      </div>
    </Modal>
  };
};

o8 export default CustomSectionModal;
