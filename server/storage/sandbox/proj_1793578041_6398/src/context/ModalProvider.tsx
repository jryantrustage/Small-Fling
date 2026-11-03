import { Modals } from 'core';
import React, { useState } from 'react';
import { IModalState } from 'store/modal/types';
import { IModalContext, ModalContext } from './ModalContext';

export const ModalProvider = ({ children }: { children: React.ReactNode }) => {
const [modalState, setModalState] = useState<IModalState | null>(null);
const [higherOrderModalState, setHigherOrderModalState] = useState<IModalState | null>(null);

  const context: IModalContext = {
close: () => setModalState(null),
closeHigherOrderModal: () => setHigherOrderModalState(null),
isModalPresent: () => !!(modalState || higherOrderModalState),
openAppModal: (modalProps) => {
const state: IModalState = { name: modalProps.name || Modals.APP_MODAL, modalProps };
// Initialize data state, if it was specified























