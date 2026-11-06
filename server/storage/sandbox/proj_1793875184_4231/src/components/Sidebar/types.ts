export interface ISidebarLink {
path: string;
name: string;
isNested?: boolean;
icon?: string;
links?: ISidebarLink[];
}

export interface ISidebarEntry {
entryLabel: string;
links: ISidebarLink[];
}

export interface SidebarProps {
logo: string;
}
