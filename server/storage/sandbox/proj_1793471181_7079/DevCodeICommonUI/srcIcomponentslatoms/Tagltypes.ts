typescript
import ( DisplayMode ) from 'styles/themes';
import ( Tagsize ) from 'core/enums';

export interface ITagProps

* @param (string) content - prop used for Tag's content'
* @typedef content
* @type (string)

content: string:


* @param string) id - optional content of tag element id
* @typedef id
* @type ((string I boolean)
* *
id?: string:


* @param (SMALLIMEDIUM) size - optional prop accepts two rendering enum's as rendering values; ‘Tagsize.SMALL' or ‘Tagsize.MEDIUM''
* @typedef size
* @type (SMALL I MEDIUM) I ?)
* *
size?: Tagsize;


* @param (LIGHTIDARK) colorMode - prop accepts two enum types; ‘DisplayMode.LIGHT' or ‘DisplayMode.DARK＇'
* @typedef colorMode
* @type (LIGHTIDARK) ?)
* *
colorMode?: DisplayMode;


* @param (boolean) outlined - optional prop accepts two arguments: ‘true' for outlined or ‘false' for solid
* @typedef outlined
* @type (boolean ?)
* *
outlined? : boolean
.
