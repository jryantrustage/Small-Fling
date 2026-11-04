import React from 'react';

import CustomSectionModal from '../CustomSectionModal';
import { screen } from '@testing-library/react';

test('Modal renders', () => {
const dom = renderWithMockContext(
<CustomSectionModal
isOpen={true}
title={'Test Title'}
onClose={() => {}}
    [>,
  };

  screen.getByText('Test Title');
}};
