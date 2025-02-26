import 'jquery-ui/ui/widgets/slider';

import { OperatorType, OperatorString, SearchTerm, } from '../enums/index';
import {
  Column,
  ColumnFilter,
  Filter,
  FilterArguments,
  FilterCallback,
  GridOption,
  JQueryUiSliderOption,
  JQueryUiSliderResponse,
  SlickGrid,
} from '../interfaces/index';

const DEFAULT_MIN_VALUE = 0;
const DEFAULT_MAX_VALUE = 100;
const DEFAULT_STEP = 1;

/** A Slider Range Filter which uses jQuery UI, this is only meant to be used as a range filter (with 2 handles lowest & highest values) */
export class SliderRangeFilter implements Filter {
  protected _clearFilterTriggered = false;
  protected _currentValues?: number[];
  protected _shouldTriggerQuery = true;
  protected _sliderOptions!: JQueryUiSliderOption;
  protected $filterElm: any;
  protected $filterContainerElm: any;
  grid!: SlickGrid;
  searchTerms: SearchTerm[] = [];
  columnDef!: Column;
  callback!: FilterCallback;
  filterContainerElm!: HTMLDivElement;

  /** Getter for the Filter Generic Params */
  protected get filterParams(): any {
    return this.columnDef && this.columnDef.filter && this.columnDef.filter.params || {};
  }

  /** Getter for the `filter` properties */
  protected get filterProperties(): ColumnFilter {
    return this.columnDef && this.columnDef.filter || {};
  }

  /** Getter for the Column Filter */
  get columnFilter(): ColumnFilter {
    return this.columnDef && this.columnDef.filter || {};
  }

  /** Getter for the Current Slider Values */
  get currentValues(): number[] | undefined {
    return this._currentValues;
  }

  /** Getter to know what would be the default operator when none is specified */
  get defaultOperator(): OperatorType | OperatorString {
    return this.gridOptions.defaultFilterRangeOperator || OperatorType.rangeInclusive;
  }

  /** Getter for the Grid Options pulled through the Grid Object */
  get gridOptions(): GridOption {
    return (this.grid && this.grid.getOptions) ? this.grid.getOptions() : {};
  }

  /** Getter for the JQuery UI Slider Options */
  get sliderOptions(): JQueryUiSliderOption {
    return this._sliderOptions || {};
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
   * Initialize the Filter
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

    // step 1, create the DOM Element of the filter & initialize it if searchTerm is filled
    this.$filterElm = this.createDomElement(this.searchTerms);
  }

  /**
   * Clear the filter value
   */
  clear(shouldTriggerQuery = true) {
    if (this.$filterElm) {
      this._clearFilterTriggered = true;
      this._shouldTriggerQuery = shouldTriggerQuery;
      this.searchTerms = [];
      const lowestValue = this.filterParams.hasOwnProperty('sliderStartValue') ? this.filterParams.sliderStartValue : DEFAULT_MIN_VALUE;
      const highestValue = this.filterParams.hasOwnProperty('sliderEndValue') ? this.filterParams.sliderEndValue : DEFAULT_MAX_VALUE;
      this._currentValues = [lowestValue, highestValue];
      this.$filterElm.slider('values', [lowestValue, highestValue]);
      if (!this.filterParams.hideSliderNumbers) {
        this.renderSliderValues(lowestValue, highestValue);
      }
      this.callback(undefined, { columnDef: this.columnDef, clearFilterTriggered: true, shouldTriggerQuery });
      this.$filterContainerElm.removeClass('filled');
    }
  }

  /**
   * destroy the filter
   */
  destroy() {
    if (this.$filterElm) {
      this.$filterElm.off('change').remove();
      this.$filterContainerElm.remove();
    }
    this.$filterElm = null;
    this.$filterContainerElm = null;
  }

  /**
   * Render both slider values (low/high) on screen
   * @param lowestValue number
   * @param highestValue number
   */
  renderSliderValues(lowestValue: number | string, highestValue: number | string) {
    const columnId = this.columnDef?.id ?? '';
    const lowerElm = this.$filterContainerElm.get(0)?.querySelector(`.lowest-range-${columnId}`);
    const highestElm = this.$filterContainerElm.get(0)?.querySelector(`.highest-range-${columnId}`);
    if (lowerElm?.textContent) {
      lowerElm.textContent = lowestValue.toString();
    }
    if (highestElm?.textContent) {
      highestElm.textContent = highestValue.toString();
    }
  }

  getValues() {
    return this._currentValues;
  }

  /**
   * Set value(s) on the DOM element
   * @params searchTerms
   */
  setValues(searchTerms: SearchTerm | SearchTerm[], operator?: OperatorType | OperatorString) {
    if (searchTerms) {
      let sliderValues: number[] | string[] = [];

      // get the slider values, if it's a string with the "..", we'll do the split else we'll use the array of search terms
      if (typeof searchTerms === 'string' || (Array.isArray(searchTerms) && typeof searchTerms[0] === 'string') && (searchTerms[0] as string).indexOf('..') > 0) {
        sliderValues = (typeof searchTerms === 'string') ? [(searchTerms as string)] : (searchTerms[0] as string).split('..');
      } else if (Array.isArray(searchTerms)) {
        sliderValues = searchTerms as string[];
      }

      if (Array.isArray(sliderValues) && sliderValues.length === 2) {
        this.$filterElm.slider('values', sliderValues);
        if (!this.filterParams.hideSliderNumbers) {
          this.renderSliderValues(sliderValues[0], sliderValues[1]);
        }
      }
    }
    (searchTerms && (this.getValues?.() ?? []).length > 0) ? this.$filterContainerElm.addClass('filled') : this.$filterContainerElm.removeClass('filled');

    // set the operator when defined
    this.operator = operator || this.defaultOperator;
  }

  //
  // protected functions
  // ------------------

  /**
   * From the html template string, create a DOM element
   * @param searchTerm optional preset search terms
   */
  protected createDomElement(searchTerms?: SearchTerm | SearchTerm[]) {
    if (this.columnFilter && this.columnFilter.filterOptions && (this.columnFilter.filterOptions.change || this.columnFilter.filterOptions.slide)) {
      throw new Error(`[Slickgrid-Universal] You cannot override the "change" and/or the "slide" callback methods
        since they are used in SliderRange Filter itself, however any other methods can be used for example the "create", "start", "stop" methods.`);
    }
    const columnId = this.columnDef?.id ?? '';
    const minValue = this.filterProperties.hasOwnProperty('minValue') ? this.filterProperties.minValue : DEFAULT_MIN_VALUE;
    const maxValue = this.filterProperties.hasOwnProperty('maxValue') ? this.filterProperties.maxValue : DEFAULT_MAX_VALUE;
    const step = this.filterProperties.hasOwnProperty('valueStep') ? this.filterProperties.valueStep : DEFAULT_STEP;

    let defaultStartValue: number = DEFAULT_MIN_VALUE;
    let defaultEndValue: number = DEFAULT_MAX_VALUE;
    if (Array.isArray(searchTerms) && searchTerms.length > 1) {
      defaultStartValue = +searchTerms[0];
      defaultEndValue = +searchTerms[1];
    } else {
      defaultStartValue = +(this.filterParams.hasOwnProperty('sliderStartValue') ? this.filterParams.sliderStartValue : minValue);
      defaultEndValue = +(this.filterParams.hasOwnProperty('sliderEndValue') ? this.filterParams.sliderEndValue : maxValue);
    }

    $(this.filterContainerElm).empty();

    // create the DOM element & add an ID and filter class
    const $lowestSliderValueElm = $(`
    <div class="input-group-addon input-group-prepend slider-range-value">
      <span class="input-group-text lowest-range-${columnId}">${defaultStartValue}</span>
    </div>`);
    const $highestSliderValueElm = $(`
    <div class="input-group-addon input-group-append slider-range-value">
      <span class="input-group-text highest-range-${columnId}">${defaultEndValue}</span>
    </div>`);
    this.$filterElm = $(`<div class="filter-input filter-${columnId}"></div>`);
    this.$filterContainerElm = $(`<div class="input-group form-control search-filter slider-range-container slider-values filter-${columnId}">`);

    if (this.filterParams.hideSliderNumbers) {
      this.$filterContainerElm.append(this.$filterElm);
    } else {
      this.$filterContainerElm.append($lowestSliderValueElm);
      this.$filterContainerElm.append(this.$filterElm);
      this.$filterContainerElm.append($highestSliderValueElm);
    }

    // if we are preloading searchTerms, we'll keep them for reference
    this._currentValues = [defaultStartValue, defaultEndValue];

    const definedOptions: JQueryUiSliderOption = {
      range: true,
      min: +(minValue || 0),
      max: +(maxValue || DEFAULT_MAX_VALUE),
      step: +(step || 1),
      values: [defaultStartValue, defaultEndValue],
      change: (e: Event, ui: JQueryUiSliderResponse) => this.onValueChanged(e, ui),
      slide: (_e: Event, ui: JQueryUiSliderResponse) => {
        const values = ui.values;
        if (!this.filterParams.hideSliderNumbers && Array.isArray(values)) {
          this.renderSliderValues(values[0], values[1]);
        }
      }
    };

    // merge options with optional user's custom options
    this._sliderOptions = { ...definedOptions, ...(this.columnFilter.filterOptions as JQueryUiSliderOption) };
    this.$filterElm.slider(this._sliderOptions);

    // if there's a search term, we will add the "filled" class for styling purposes
    if (Array.isArray(searchTerms) && searchTerms.length > 0 && searchTerms[0] !== '') {
      this.$filterContainerElm.addClass('filled');
    }

    // append the new DOM element to the header row
    if (this.$filterContainerElm && typeof this.$filterContainerElm.appendTo === 'function') {
      this.$filterContainerElm.appendTo(this.filterContainerElm);
    }

    return this.$filterElm;
  }

  /** On a value change event triggered */
  protected onValueChanged(e: Event, ui: JQueryUiSliderResponse) {
    const values = ui && Array.isArray(ui.values) ? ui.values : [];
    const value = values.join('..');

    if (this._clearFilterTriggered) {
      this.callback(e, { columnDef: this.columnDef, clearFilterTriggered: this._clearFilterTriggered, shouldTriggerQuery: this._shouldTriggerQuery });
      this.$filterContainerElm.removeClass('filled');
    } else {
      value === '' ? this.$filterContainerElm.removeClass('filled') : this.$filterContainerElm.addClass('filled');
      this.callback(e, { columnDef: this.columnDef, operator: this.operator, searchTerms: values, shouldTriggerQuery: this._shouldTriggerQuery });
    }
    // reset both flags for next use
    this._clearFilterTriggered = false;
    this._shouldTriggerQuery = true;
  }
}
