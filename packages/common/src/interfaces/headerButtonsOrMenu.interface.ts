import { HeaderButtonItem } from './headerButtonItem.interface';
import { HeaderMenuItems } from './headerMenuItems.interface';

export interface HeaderButtonsOrMenu {
  /** list of Buttons to show in the header */
  buttons?: Array<HeaderButtonItem>;
  menu?: HeaderMenuItems;
}