import { BasePubSubService } from '@slickgrid-universal/event-pub-sub';

import {
  CellMenu,
  CellMenuOption,
  Column,
  DOMMouseEvent,
  MenuCommandItem,
  MenuCommandItemCallbackArgs,
  MenuOptionItem,
} from '../interfaces/index';
import { ExtensionUtility } from '../extensions/extensionUtility';
import { SharedService } from '../services/shared.service';
import { MenuFromCellBaseClass } from './menuFromCellBaseClass';

/**
 * A plugin to add Menu on a Cell click (click on the cell that has the cellMenu object defined)
 * The "cellMenu" is defined in a Column Definition object
 * Similar to the ContextMenu plugin (could be used in combo),
 * except that it subscribes to the cell "onClick" event (regular mouse click or touch).
 *
 * A general use of this plugin is for an Action Dropdown Menu to do certain things on the row that was clicked
 * You can use it to change the cell data property through a list of Options AND/OR through a list of Commands.
 *
 * To specify a custom button in a column header, extend the column definition like so:
 *   this.columnDefinitions = [{
 *     id: 'myColumn', name: 'My column',
 *     cellMenu: {
 *       // ... cell menu options
 *       commandItems: [{ ...menu item options... }, { ...menu item options... }]
 *     }
 *   }];
 */
export class SlickCellMenu extends MenuFromCellBaseClass<CellMenu> {
  protected _defaults = {
    autoAdjustDrop: true,     // dropup/dropdown
    autoAlignSide: true,      // left/right
    autoAdjustDropOffset: 0,
    autoAlignSideOffset: 0,
    hideMenuOnScroll: true,
  } as unknown as CellMenuOption;
  pluginName: 'CellMenu' = 'CellMenu' as const;

  /** Constructor of the SlickGrid 3rd party plugin, it can optionally receive options */
  constructor(
    protected readonly extensionUtility: ExtensionUtility,
    protected readonly pubSubService: BasePubSubService,
    protected readonly sharedService: SharedService,
  ) {
    super(extensionUtility, pubSubService, sharedService);
    this._camelPluginName = 'cellMenu';
    this._menuCssPrefix = 'slick-menu';
    this._menuPluginCssPrefix = 'slick-cell-menu';
    this.init(sharedService.gridOptions.cellMenu);
  }

  /** Initialize plugin. */
  init(cellMenuOptions?: CellMenu) {
    this._addonOptions = { ...this._defaults, ...cellMenuOptions };

    // sort all menu items by their position order when defined
    this.sortMenuItems(this.sharedService.allColumns);

    this._eventHandler.subscribe(this.grid.onClick, this.handleCellClick.bind(this) as EventListener);

    if (this._addonOptions.hideMenuOnScroll) {
      this._eventHandler.subscribe(this.grid.onScroll, this.closeMenu.bind(this) as EventListener);
    }
  }

  /** Translate the Cell Menu titles, we need to loop through all column definition to re-translate all list titles & all commands/options */
  translateCellMenu() {
    const gridOptions = this.sharedService?.gridOptions;
    const columnDefinitions = this.sharedService.allColumns;

    if (gridOptions?.enableTranslate && Array.isArray(columnDefinitions)) {
      columnDefinitions.forEach((columnDef: Column) => {
        if (columnDef?.cellMenu && (Array.isArray(columnDef.cellMenu.commandItems) || Array.isArray(columnDef.cellMenu.optionItems))) {
          // get both items list
          const columnCellMenuCommandItems: Array<MenuCommandItem | 'divider'> = columnDef.cellMenu.commandItems || [];
          const columnCellMenuOptionItems: Array<MenuOptionItem | 'divider'> = columnDef.cellMenu.optionItems || [];

          // translate their titles only if they have a titleKey defined
          if (columnDef.cellMenu.commandTitleKey) {
            columnDef.cellMenu.commandTitle = this.extensionUtility.translateWhenEnabledAndServiceExist(columnDef.cellMenu.commandTitleKey, 'TEXT_COMMANDS') || columnDef.cellMenu.commandTitle;
          }
          if (columnDef.cellMenu.optionTitleKey) {
            columnDef.cellMenu.optionTitle = this.extensionUtility.translateWhenEnabledAndServiceExist(columnDef.cellMenu.optionTitleKey, 'TEXT_COMMANDS') || columnDef.cellMenu.optionTitle;
          }

          // translate both command/option items (whichever is provided)
          this.extensionUtility.translateMenuItemsFromTitleKey(columnCellMenuCommandItems);
          this.extensionUtility.translateMenuItemsFromTitleKey(columnCellMenuOptionItems);
        }
      });
    }
  }

  // --
  // event handlers
  // ------------------

  protected handleCellClick(event: DOMMouseEvent<HTMLDivElement>, args: MenuCommandItemCallbackArgs) {
    const cell = this.grid.getCellFromEvent(event);
    if (cell) {
      const dataContext = this.grid.getDataItem(cell.row);
      const columnDef = this.grid.getColumns()[cell.cell];

      // prevent event from bubbling but only on column that has a cell menu defined
      if (columnDef?.cellMenu) {
        event.preventDefault();
      }

      // merge the cellMenu of the column definition with the default properties
      this._addonOptions = { ...this._addonOptions, ...columnDef.cellMenu };

      // run the override function (when defined), if the result is false it won't go further
      args = args || {};
      args.column = columnDef;
      args.dataContext = dataContext;
      args.grid = this.grid;
      if (!this.extensionUtility.runOverrideFunctionWhenExists(this._addonOptions.menuUsabilityOverride, args)) {
        return;
      }

      // create the DOM element
      this._menuElm = this.createMenu(event);

      // reposition the menu to where the user clicked
      if (this._menuElm) {
        this.repositionMenu(event);
        this._menuElm.setAttribute('aria-expanded', 'true');
        this._menuElm.style.display = 'block';
      }

      // Hide the menu on outside click.
      this._bindEventService.bind(document.body, 'mousedown', this.handleBodyMouseDown.bind(this) as EventListener);
    }
  }


  // --
  // protected functions
  // ------------------

  protected sortMenuItems(columnDefinitions: Column[]) {
    // sort both items list
    columnDefinitions.forEach((columnDef: Column) => {
      if (columnDef?.cellMenu?.commandItems) {
        this.extensionUtility.sortItems(columnDef.cellMenu.commandItems || [], 'positionOrder');
      }
      if (columnDef?.cellMenu?.optionItems) {
        this.extensionUtility.sortItems(columnDef.cellMenu.optionItems || [], 'positionOrder');
      }
    });
  }
}