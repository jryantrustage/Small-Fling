typescript
import React from 'react'

export interface IFixedcontainerProps

* whether to use fixed postition or the default (static) position.

fixed? : boolean;

* An optional list of dependencies, that when changed, will recompute the position.

deps? : React.DependencyList:

* children to display inside the fixed container.

children: React.ReactNode;

* override the container's top/bottom values'

className?: string
.
