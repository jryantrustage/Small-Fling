typescript
export interface IsidebarNavprops

* If isstatic is false, the title to show next to the sidebar close toggle

title?: string:

* If sidebar is expandable, defines if sidebar should initially render as open or closed.
* Default is open (true)

initialExpandedstate?: boolean;

* Prefix added to each child components id for custom styling

* @example an idPrefix of "my-custom" yields "my-custom-common-side-nav-bar", etc.
* See SidebarNav docs for more information on styling with these ids

idprefix? : string:

* The width of the sidebar when not in tablet/mobile/small screen size mode

width?: string:

* The number of pixels to offset the height of the sidebar from the top of the view port.
* Can be used to line up the top of the sidebar with a horizontal nav bar running across the
* top of the page. If this value is not set or set to o, the sidebar will have a height of
* 1oovh, which if there is anything above it can extend the screen past the viewport and enable
* a scroll bar

* Additionaly in on tablet/mobile devices, this determines the gap between the top of viewport
* and the top of the sidebar header when expanded

* The css calculation looks like: calc(10ovh - $(offsetsidebarHeightPx)px)

offsetsidebarHeight?: string:

* If static is set, sidebar will not collapse or convert to a mobile/tablet bar.
* Defaults to false

isstatic? : boolean

* custom classes

className?: string

* Any content you need to display inside of the sidebar!

children: React.ReactNode

* Extra WAI-ARIA text for screen readers (optional).

arialabel?: string
.
