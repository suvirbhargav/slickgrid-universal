import { toKebabCase } from '@slickgrid-universal/utils';
import 'jquery-ui/ui/widgets/autocomplete';

import {
  FieldType,
  OperatorType,
  OperatorString,
  SearchTerm,
} from '../enums/index';
import {
  AutocompleteOption,
  CollectionCustomStructure,
  CollectionOption,
  Column,
  ColumnFilter,
  Filter,
  FilterArguments,
  FilterCallback,
  GridOption,
  SlickGrid,
} from './../interfaces/index';
import { CollectionService } from '../services/collection.service';
import { collectionObserver, propertyObserver } from '../services/observers';
import { sanitizeTextByAvailableSanitizer, } from '../services/domUtilities';
import { getDescendantProperty, unsubscribeAll } from '../services/utilities';
import { TranslaterService } from '../services/translater.service';
import { renderCollectionOptionsAsync } from './filterUtilities';
import { RxJsFacade, Subscription } from '../services/rxjsFacade';

export class AutoCompleteFilter implements Filter {
  protected _autoCompleteOptions!: AutocompleteOption;
  protected _clearFilterTriggered = false;
  protected _collection?: any[];
  protected _shouldTriggerQuery = true;

  /** DOM Element Name, useful for auto-detecting positioning (dropup / dropdown) */
  elementName!: string;

  /** The JQuery DOM element */
  $filterElm: any;

  grid!: SlickGrid;
  searchTerms: SearchTerm[] = [];
  columnDef!: Column;
  callback!: FilterCallback;
  isFilled = false;
  filterContainerElm!: HTMLDivElement;

  /** The property name for labels in the collection */
  labelName!: string;

  /** The property name for a prefix that can be added to the labels in the collection */
  labelPrefixName!: string;

  /** The property name for a suffix that can be added to the labels in the collection */
  labelSuffixName!: string;

  /** The property name for values in the collection */
  optionLabel!: string;

  /** The property name for values in the collection */
  valueName = 'label';

  enableTranslateLabel = false;
  subscriptions: Subscription[] = [];

  /**
   * Initialize the Filter
   */
  constructor(
    protected readonly translaterService: TranslaterService,
    protected readonly collectionService: CollectionService,
    protected readonly rxjs?: RxJsFacade
  ) { }

  /** Getter for the Autocomplete Option */
  get autoCompleteOptions(): Partial<AutocompleteOption> {
    return this._autoCompleteOptions || {};
  }

  /** Getter for the Collection Options */
  protected get collectionOptions(): CollectionOption {
    return this.columnDef && this.columnDef.filter && this.columnDef.filter.collectionOptions || {};
  }

  /** Getter for the Collection Used by the Filter */
  get collection(): any[] | undefined {
    return this._collection;
  }

  /** Getter for the Filter Operator */
  get columnFilter(): ColumnFilter {
    return this.columnDef?.filter || {};
  }

  /** Getter for the Editor DOM Element */
  get filterDomElement(): any {
    return this.$filterElm;
  }

  get filterOptions(): AutocompleteOption {
    return this.columnFilter?.filterOptions || {};
  }

  /** Getter for the Custom Structure if exist */
  get customStructure(): CollectionCustomStructure | undefined {
    let customStructure = this.columnFilter?.customStructure;
    const columnType = this.columnFilter?.type ?? this.columnDef?.type;
    if (!customStructure && (columnType === FieldType.object && this.columnDef?.dataKey && this.columnDef?.labelKey)) {
      customStructure = {
        label: this.columnDef.labelKey,
        value: this.columnDef.dataKey,
      };
    }
    return customStructure;
  }

  /** Getter to know what would be the default operator when none is specified */
  get defaultOperator(): OperatorType | OperatorString {
    return OperatorType.equal;
  }

  /** Getter for the Grid Options pulled through the Grid Object */
  get gridOptions(): GridOption {
    return (this.grid && this.grid.getOptions) ? this.grid.getOptions() : {};
  }

  /** jQuery UI AutoComplete instance */
  get instance(): any {
    return this.$filterElm.autocomplete('instance');
  }

  /** Getter of the Operator to use when doing the filter comparing */
  get operator(): OperatorType | OperatorString {
    return this.columnFilter?.operator ?? this.defaultOperator;
  }

  /** Setter for the filter operator */
  set operator(operator: OperatorType | OperatorString) {
    if (this.columnFilter) {
      this.columnFilter.operator = operator;
    }
  }

  /**
   * Initialize the filter template
   */
  init(args: FilterArguments) {
    if (!args) {
      throw new Error('[Slickgrid-Universal] A filter must always have an "init()" with valid arguments.');
    }
    this.grid = args.grid;
    this.callback = args.callback;
    this.columnDef = args.columnDef;
    this.searchTerms = (args.hasOwnProperty('searchTerms') ? args.searchTerms : []) || [];
    this.filterContainerElm = args.filterContainerElm;

    if (!this.grid || !this.columnDef || !this.columnFilter || (!this.columnFilter.collection && !this.columnFilter.collectionAsync && !this.columnFilter.filterOptions)) {
      throw new Error(`[Slickgrid-Universal] You need to pass a "collection" (or "collectionAsync") for the AutoComplete Filter to work correctly. Also each option should include a value/label pair (or value/labelKey when using Locale). For example:: { filter: model: Filters.autoComplete, collection: [{ value: true, label: 'True' }, { value: false, label: 'False'}] }`);
    }

    this.enableTranslateLabel = this.columnFilter && this.columnFilter.enableTranslateLabel || false;
    this.labelName = this.customStructure && this.customStructure.label || 'label';
    this.valueName = this.customStructure && this.customStructure.value || 'value';
    this.labelPrefixName = this.customStructure && this.customStructure.labelPrefix || 'labelPrefix';
    this.labelSuffixName = this.customStructure && this.customStructure.labelSuffix || 'labelSuffix';

    // always render the DOM element
    const newCollection = this.columnFilter.collection || [];
    this._collection = newCollection;
    this.renderDomElement(newCollection);

    return new Promise(async (resolve, reject) => {
      try {
        const collectionAsync = this.columnFilter.collectionAsync;
        let collectionOutput: Promise<any[]> | any[] | undefined;

        if (collectionAsync && !this.columnFilter.collection) {
          // only read the collectionAsync once (on the 1st load),
          // we do this because Http Fetch will throw an error saying body was already read and is streaming is locked
          collectionOutput = renderCollectionOptionsAsync(collectionAsync, this.columnDef, this.renderDomElement.bind(this), this.rxjs, this.subscriptions);
          resolve(collectionOutput);
        } else {
          collectionOutput = newCollection;
          resolve(newCollection);
        }

        // subscribe to both CollectionObserver and PropertyObserver
        // any collection changes will trigger a re-render of the DOM element filter
        if (collectionAsync || this.columnFilter.enableCollectionWatch) {
          await (collectionOutput ?? collectionAsync);
          this.watchCollectionChanges();
        }
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Clear the filter value
   */
  clear(shouldTriggerQuery = true) {
    if (this.$filterElm) {
      this._clearFilterTriggered = true;
      this._shouldTriggerQuery = shouldTriggerQuery;
      this.searchTerms = [];
      this.$filterElm.val('');
      this.$filterElm.trigger('input');
      this.$filterElm.removeClass('filled');
    }
  }

  /**
   * destroy the filter
   */
  destroy() {
    if (this.$filterElm) {
      this.$filterElm.autocomplete('destroy');
      this.$filterElm.off('input').remove();
    }
    this.$filterElm = null;
    this._collection = undefined;

    // unsubscribe all the possible Observables if RxJS was used
    unsubscribeAll(this.subscriptions);
  }

  getValues() {
    return this.$filterElm.val();
  }

  /** Set value(s) on the DOM element  */
  setValues(values: SearchTerm | SearchTerm[], operator?: OperatorType | OperatorString) {
    if (values) {
      this.$filterElm.val(values);
    }
    this.getValues() !== '' ? this.$filterElm.addClass('filled') : this.$filterElm.removeClass('filled');

    // set the operator when defined
    this.operator = operator || this.defaultOperator;
  }

  //
  // protected functions
  // ------------------

  /**
   * user might want to filter certain items of the collection
   * @param inputCollection
   * @return outputCollection filtered and/or sorted collection
   */
  protected filterCollection(inputCollection: any[]): any[] {
    let outputCollection = inputCollection;

    // user might want to filter certain items of the collection
    if (this.columnFilter && this.columnFilter.collectionFilterBy) {
      const filterBy = this.columnFilter.collectionFilterBy;
      const filterCollectionBy = this.columnFilter.collectionOptions && this.columnFilter.collectionOptions.filterResultAfterEachPass || null;
      outputCollection = this.collectionService.filterCollection(outputCollection, filterBy, filterCollectionBy);
    }

    return outputCollection;
  }

  /**
   * user might want to sort the collection in a certain way
   * @param inputCollection
   * @return outputCollection filtered and/or sorted collection
   */
  protected sortCollection(inputCollection: any[]): any[] {
    let outputCollection = inputCollection;

    // user might want to sort the collection
    if (this.columnFilter && this.columnFilter.collectionSortBy) {
      const sortBy = this.columnFilter.collectionSortBy;
      outputCollection = this.collectionService.sortCollection(this.columnDef, outputCollection, sortBy, this.enableTranslateLabel);
    }

    return outputCollection;
  }

  /**
   * Subscribe to both CollectionObserver & PropertyObserver with BindingEngine.
   * They each have their own purpose, the "propertyObserver" will trigger once the collection is replaced entirely
   * while the "collectionObverser" will trigger on collection changes (`push`, `unshift`, `splice`, ...)
   */
  protected watchCollectionChanges() {
    if (this.columnFilter?.collection) {
      // subscribe to the "collection" changes (array `push`, `unshift`, `splice`, ...)
      collectionObserver(this.columnFilter.collection, (updatedArray) => {
        this.renderDomElement(this.columnFilter.collection || updatedArray || []);
      });

      // observe for any "collection" changes (array replace)
      // then simply recreate/re-render the Select (dropdown) DOM Element
      propertyObserver(this.columnFilter, 'collection', (newValue) => {
        this.renderDomElement(newValue || []);

        // when new assignment arrives, we need to also reassign observer to the new reference
        if (this.columnFilter.collection) {
          collectionObserver(this.columnFilter.collection, (updatedArray) => {
            this.renderDomElement(this.columnFilter.collection || updatedArray || []);
          });
        }
      });
    }
  }

  renderDomElement(collection: any[]) {
    if (!Array.isArray(collection) && this.collectionOptions?.collectionInsideObjectProperty) {
      const collectionInsideObjectProperty = this.collectionOptions.collectionInsideObjectProperty;
      collection = getDescendantProperty(collection, collectionInsideObjectProperty || '');
    }
    if (!Array.isArray(collection)) {
      throw new Error('The "collection" passed to the Autocomplete Filter is not a valid array.');
    }

    // assign the collection to a temp variable before filtering/sorting the collection
    let newCollection = collection;

    // user might want to filter and/or sort certain items of the collection
    newCollection = this.filterCollection(newCollection);
    newCollection = this.sortCollection(newCollection);

    // filter input can only have 1 search term, so we will use the 1st array index if it exist
    const searchTerm = (Array.isArray(this.searchTerms) && this.searchTerms.length >= 0) ? this.searchTerms[0] : '';

    // step 1, create HTML string template
    const filterTemplate = this.buildTemplateHtmlString();

    // step 2, create the DOM Element of the filter & pre-load search term
    // also subscribe to the onSelect event
    this._collection = newCollection;
    this.createDomElement(filterTemplate, newCollection, searchTerm);

    // step 3, subscribe to the input change event and run the callback when that happens
    // also add/remove "filled" class for styling purposes
    this.$filterElm.on('input', this.handleOnInputChange.bind(this));
  }

  /**
   * Create the HTML template as a string
   */
  protected buildTemplateHtmlString() {
    const columnId = this.columnDef?.id ?? '';
    let placeholder = (this.gridOptions) ? (this.gridOptions.defaultFilterPlaceholder || '') : '';
    if (this.columnFilter?.placeholder) {
      placeholder = this.columnFilter.placeholder;
    }
    return `<input type="text" autocomplete="none" class="form-control search-filter filter-${columnId}" placeholder="${placeholder}">`;
  }

  /**
   * From the html template string, create a DOM element
   * @param filterTemplate
   */
  protected createDomElement(filterTemplate: string, collection: any[], searchTerm?: SearchTerm) {
    this._collection = collection;
    const columnId = this.columnDef?.id ?? '';

    $(this.filterContainerElm).empty();

    // create the DOM element & add an ID and filter class
    this.$filterElm = $(filterTemplate) as any;
    const searchTermInput = searchTerm as string;

    // user might provide his own custom structure
    // jQuery UI autocomplete requires a label/value pair, so we must remap them when user provide different ones
    if (Array.isArray(collection)) {
      collection = collection.map((item) => {
        return { label: item[this.labelName], value: item[this.valueName], labelPrefix: item[this.labelPrefixName] || '', labelSuffix: item[this.labelSuffixName] || '' };
      });
    }

    // user might pass his own autocomplete options
    const autoCompleteOptions = this.filterOptions;

    // when user passes it's own autocomplete options
    // we still need to provide our own "select" callback implementation
    if (autoCompleteOptions?.source) {
      autoCompleteOptions.select = (event: Event, ui: { item: any; }) => this.onSelect(event, ui);
      this._autoCompleteOptions = { ...autoCompleteOptions };

      // when renderItem is defined, we need to add our custom style CSS class
      if (this._autoCompleteOptions.renderItem) {
        this._autoCompleteOptions.classes = {
          'ui-autocomplete': `autocomplete-custom-${toKebabCase(this._autoCompleteOptions.renderItem.layout)}`
        };
      }

      // create the jQueryUI AutoComplete
      this.$filterElm.autocomplete(this._autoCompleteOptions);

      // when "renderItem" is defined, we need to call the user's custom renderItem template callback
      if (this._autoCompleteOptions.renderItem) {
        this.$filterElm.autocomplete('instance')._renderItem = this.renderCustomItem.bind(this);
      }
    } else {
      const definedOptions: AutocompleteOption = {
        minLength: 0,
        source: collection,
        select: (event: Event, ui: { item: any; }) => this.onSelect(event, ui),
      };
      this._autoCompleteOptions = { ...definedOptions, ...this.filterOptions };
      this.$filterElm.autocomplete(this._autoCompleteOptions);

      // we'll use our own renderer so that it works with label prefix/suffix and also with html rendering when enabled
      this.$filterElm.autocomplete('instance')._renderItem = this.renderCollectionItem.bind(this);
    }

    this.$filterElm.val(searchTermInput);
    this.$filterElm.data('columnId', columnId);

    // if there's a search term, we will add the "filled" class for styling purposes
    if (searchTerm) {
      this.$filterElm.addClass('filled');
    }

    // append the new DOM element to the header row
    if (this.$filterElm && typeof this.$filterElm.appendTo === 'function') {
      const $container = $(`<div class="autocomplete-container"></div>`);
      $container.appendTo(this.filterContainerElm);
      this.$filterElm.appendTo($container);

      // add a <span> in order to add spinner styling
      $(`<span></span>`).appendTo($container);
    }

    // we could optionally trigger a search when clicking on the AutoComplete
    if (this.filterOptions.openSearchListOnFocus) {
      this.$filterElm.click(() => this.$filterElm.autocomplete('search', this.$filterElm.val()));
    }

    // user might override any of the jQueryUI callback methods
    if (this.columnFilter.callbacks) {
      for (const callback of Object.keys(this.columnFilter.callbacks)) {
        if (typeof this.columnFilter.callbacks[callback] === 'function') {
          this.$filterElm.autocomplete('instance')[callback] = this.columnFilter.callbacks[callback];
        }
      }
    }

    return this.$filterElm;
  }

  //
  // protected functions
  // ------------------

  // this function should be PRIVATE but for unit tests purposes we'll make it public until a better solution is found
  // a better solution would be to get the autocomplete DOM element to work with selection but I couldn't find how to do that in Jest
  onSelect(event: Event, ui: { item: any; }) {
    if (ui && ui.item) {
      const item = ui.item;

      // when the user defines a "renderItem" (or "_renderItem") template, then we assume the user defines his own custom structure of label/value pair
      // otherwise we know that jQueryUI always require a label/value pair, we can pull them directly
      const hasCustomRenderItemCallback = this.columnFilter?.callbacks?.hasOwnProperty('_renderItem') ?? this.columnFilter?.filterOptions?.renderItem ?? false;

      const itemLabel = typeof item === 'string' ? item : (hasCustomRenderItemCallback ? item[this.labelName] : item.label);
      const itemValue = typeof item === 'string' ? item : (hasCustomRenderItemCallback ? item[this.valueName] : item.value);
      this.setValues(itemLabel);
      itemValue === '' ? this.$filterElm.removeClass('filled') : this.$filterElm.addClass('filled');
      this.callback(event, { columnDef: this.columnDef, operator: this.operator, searchTerms: [itemValue], shouldTriggerQuery: this._shouldTriggerQuery });

      // reset both flags for next use
      this._clearFilterTriggered = false;
      this._shouldTriggerQuery = true;
    }
    return false;
  }

  protected handleOnInputChange(e: any) {
    let value = e && e.target && e.target.value || '';
    const enableWhiteSpaceTrim = this.gridOptions.enableFilterTrimWhiteSpace || this.columnFilter.enableTrimWhiteSpace;
    if (typeof value === 'string' && enableWhiteSpaceTrim) {
      value = value.trim();
    }

    if (this._clearFilterTriggered) {
      this.callback(e, { columnDef: this.columnDef, clearFilterTriggered: this._clearFilterTriggered, shouldTriggerQuery: this._shouldTriggerQuery });
      this.$filterElm.removeClass('filled');
    } else {
      value === '' ? this.$filterElm.removeClass('filled') : this.$filterElm.addClass('filled');
      this.callback(e, { columnDef: this.columnDef, operator: this.operator, searchTerms: [value], shouldTriggerQuery: this._shouldTriggerQuery });
    }

    // reset both flags for next use
    this._clearFilterTriggered = false;
    this._shouldTriggerQuery = true;
  }

  protected renderCustomItem(ul: HTMLElement, item: any) {
    const templateString = this._autoCompleteOptions?.renderItem?.templateCallback(item) ?? '';

    // sanitize any unauthorized html tags like script and others
    // for the remaining allowed tags we'll permit all attributes
    const sanitizedTemplateText = sanitizeTextByAvailableSanitizer(this.gridOptions, templateString) || '';

    return $('<li></li>')
      .data('item.autocomplete', item)
      .append(sanitizedTemplateText)
      .appendTo(ul);
  }

  protected renderCollectionItem(ul: any, item: any) {
    const isRenderHtmlEnabled = this.columnFilter?.enableRenderHtml ?? false;
    const prefixText = item.labelPrefix || '';
    const labelText = item.label || '';
    const suffixText = item.labelSuffix || '';
    const finalText = prefixText + labelText + suffixText;

    // sanitize any unauthorized html tags like script and others
    // for the remaining allowed tags we'll permit all attributes
    const sanitizedText = sanitizeTextByAvailableSanitizer(this.gridOptions, finalText) || '';

    const $liDiv = $('<div></div>')[isRenderHtmlEnabled ? 'html' : 'text'](sanitizedText);
    return $('<li></li>')
      .data('item.autocomplete', item)
      .append($liDiv)
      .appendTo(ul);
  }
}