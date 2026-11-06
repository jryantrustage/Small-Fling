export type UserManager = any;

function UserManager(this: UserManager, settings: any): void {
this.signoutRedirect = () => Promise.resolve();
}

const Log = {};

export { UserManager, Log };
