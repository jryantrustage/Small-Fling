/* eslint-disable no-console */
import React from 'react';
import { INotification, NotificationDisplay } from 'core/entities/notification';

export interface INotificationContext {
notificationList: INotification[];
addNotification: (notification: INotification) => void;
/**
* If the provided index is in range of the current notifications list, it will be used to remove that notification.
* If not it will try a deep comparison check on the notification object to determine if a given notfication is
* in the list and remove it.
*/
removeNotification: (notification: INotification, index: number) => void;
/**
* Removes one or more notifications where the given id matches on a notification's `id` field
*
* Can optionally be given an array of ids to remove multiple types of notifications at once
*/
removeNotificationsById: (notificationId: string | string[]) => void;
clearAllNotifications: () => void;
clearAndSetNotifications: (notifications: INotification[]) => void;
clearAllDisplayNotifications: (notification: NotificationDisplay | string) => void;
























/**
* Notification Context with a separate instance between federated modules
*/
export const NotificationContext = React.createContext(DefaultNotificationContext);
