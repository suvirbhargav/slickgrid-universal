import {
  // utilities
  mapOperatorType,
  mapOperatorByFieldType,

  // enums/interfaces
  BackendService,
  Column,
  ColumnFilter,
  ColumnFilters,
  ColumnSort,
  CurrentFilter,
  CurrentPagination,
  CurrentSorter,
  FieldType,
  FilterChangedArgs,
  GridOption,
  MultiColumnSort,
  OperatorString,
  OperatorType,
  Pagination,
  PaginationChangedArgs,
  SharedService,
  SingleColumnSort,
  SlickGrid,
  SortDirection,
  SortDirectionString,
} from '@slickgrid-universal/common';
import {
  GraphqlCursorPaginationOption,
  GraphqlDatasetFilter,
  GraphqlFilteringOption,
  GraphqlPaginationOption,
  GraphqlServiceOption,
  GraphqlSortingOption,
} from '../interfaces/index';

import QueryBuilder from './graphqlQueryBuilder';

const DEFAULT_ITEMS_PER_PAGE = 25;
const DEFAULT_PAGE_SIZE = 20;

export class GraphqlService implements BackendService {
  protected _currentFilters: ColumnFilters | CurrentFilter[] = [];
  protected _currentPagination: CurrentPagination | null = null;
  protected _currentSorters: CurrentSorter[] = [];
  protected _columnDefinitions?: Column[];
  protected _grid: SlickGrid | undefined;
  protected _datasetIdPropName = 'id';
  options: GraphqlServiceOption | undefined;
  pagination: Pagination | undefined;
  defaultPaginationOptions: GraphqlPaginationOption | GraphqlCursorPaginationOption = {
    first: DEFAULT_ITEMS_PER_PAGE,
    offset: 0
  };

  /** Getter for the Column Definitions */
  get columnDefinitions() {
    return this._columnDefinitions;
  }

  /** Getter for the Grid Options pulled through the Grid Object */
  protected get _gridOptions(): GridOption {
    return (this._grid?.getOptions) ? this._grid.getOptions() : {};
  }

  /** Initialization of the service, which acts as a constructor */
  init(serviceOptions?: GraphqlServiceOption, pagination?: Pagination, grid?: SlickGrid, sharedService?: SharedService): void {
    this._grid = grid;
    this.options = serviceOptions || { datasetName: '' };
    this.pagination = pagination;
    this._datasetIdPropName = this._gridOptions.datasetIdPropertyName || 'id';

    if (grid && grid.getColumns) {
      this._columnDefinitions = sharedService?.allColumns ?? grid.getColumns() ?? [];
    }
  }

  /**
   * Build the GraphQL query, since the service include/exclude cursor, the output query will be different.
   * @param serviceOptions GraphqlServiceOption
   */
  buildQuery() {
    if (!this.options || !this.options.datasetName || !Array.isArray(this._columnDefinitions)) {
      throw new Error('GraphQL Service requires the "datasetName" property to properly build the GraphQL query');
    }

    // get the column definitions and exclude some if they were tagged as excluded
    let columnDefinitions = this._columnDefinitions || [];
    columnDefinitions = columnDefinitions.filter((column: Column) => !column.excludeFromQuery);

    const queryQb = new QueryBuilder('query');
    const datasetQb = new QueryBuilder(this.options.datasetName);
    const nodesQb = new QueryBuilder('nodes');

    // get all the columnds Ids for the filters to work
    const columnIds: string[] = [];
    if (columnDefinitions && Array.isArray(columnDefinitions)) {
      for (const column of columnDefinitions) {
        columnIds.push(column.field);

        // if extra "fields" are passed, also push them to columnIds
        if (column.fields) {
          columnIds.push(...column.fields);
        }
      }
    }

    // Slickgrid also requires the "id" field to be part of DataView
    // add it to the GraphQL query if it wasn't already part of the list
    if (columnIds.indexOf(this._datasetIdPropName) === -1) {
      columnIds.unshift(this._datasetIdPropName);
    }

    const columnsQuery = this.buildFilterQuery(columnIds);
    let graphqlNodeFields = [];

    if (this._gridOptions.enablePagination !== false) {
      if (this.options.isWithCursor) {
        // ...pageInfo { hasNextPage, endCursor }, edges { cursor, node { _columns_ } }, totalCount: 100
        const edgesQb = new QueryBuilder('edges');
        const pageInfoQb = new QueryBuilder('pageInfo');
        pageInfoQb.find('hasNextPage', 'hasPreviousPage', 'endCursor', 'startCursor');
        nodesQb.find(columnsQuery);
        edgesQb.find(['cursor']);
        graphqlNodeFields = ['totalCount', nodesQb, pageInfoQb, edgesQb];
      } else {
        // ...nodes { _columns_ }, totalCount: 100
        nodesQb.find(columnsQuery);
        graphqlNodeFields = ['totalCount', nodesQb];
      }
      // all properties to be returned by the query
      datasetQb.find(graphqlNodeFields);
    } else {
      // include all columns to be returned
      datasetQb.find(columnsQuery);
    }

    // add dataset filters, could be Pagination and SortingFilters and/or FieldFilters
    let datasetFilters: GraphqlDatasetFilter = {};

    // only add pagination if it's enabled in the grid options
    if (this._gridOptions.enablePagination !== false) {
      datasetFilters = {
        ...this.options.paginationOptions,
        first: ((this.options.paginationOptions && this.options.paginationOptions.first) ? this.options.paginationOptions.first : ((this.pagination && this.pagination.pageSize) ? this.pagination.pageSize : null)) || this.defaultPaginationOptions.first
      };

      if (!this.options.isWithCursor) {
        const paginationOptions = this.options?.paginationOptions;
        datasetFilters.offset = paginationOptions?.hasOwnProperty('offset') ? +(paginationOptions as any)['offset'] : 0;
      }
    }

    if (this.options.sortingOptions && Array.isArray(this.options.sortingOptions) && this.options.sortingOptions.length > 0) {
      // orderBy: [{ field:x, direction: 'ASC' }]
      datasetFilters.orderBy = this.options.sortingOptions;
    }
    if (this.options.filteringOptions && Array.isArray(this.options.filteringOptions) && this.options.filteringOptions.length > 0) {
      // filterBy: [{ field: date, operator: '>', value: '2000-10-10' }]
      datasetFilters.filterBy = this.options.filteringOptions;
    }
    if (this.options.addLocaleIntoQuery) {
      // first: 20, ... locale: "en-CA"
      datasetFilters.locale = this._gridOptions.translater?.getCurrentLanguage() || this._gridOptions.locale || 'en';
    }
    if (this.options.extraQueryArguments) {
      // first: 20, ... userId: 123
      for (const queryArgument of this.options.extraQueryArguments) {
        (datasetFilters as any)[queryArgument.field] = queryArgument.value;
      }
    }

    // with pagination:: query { users(first: 20, offset: 0, orderBy: [], filterBy: []) { totalCount: 100, nodes: { _columns_ }}}
    // without pagination:: query { users(orderBy: [], filterBy: []) { _columns_ }}
    datasetQb.filter(datasetFilters);
    queryQb.find(datasetQb);

    const enumSearchProperties = ['direction:', 'field:', 'operator:'];
    return this.trimDoubleQuotesOnEnumField(queryQb.toString(), enumSearchProperties, this.options.keepArgumentFieldDoubleQuotes || false);
  }

  /**
   * From an input array of strings, we want to build a GraphQL query string.
   * The process has to take the dot notation and parse it into a valid GraphQL query
   * Following this SO answer https://stackoverflow.com/a/47705476/1212166
   *
   * INPUT
   *  ['firstName', 'lastName', 'billing.address.street', 'billing.address.zip']
   * OUTPUT
   * firstName, lastName, billing{address{street, zip}}
   * @param inputArray
   */
  buildFilterQuery(inputArray: string[]) {

    const set = (o: any = {}, a: any) => {
      const k = a.shift();
      o[k] = a.length ? set(o[k], a) : null;
      return o;
    };

    const output = inputArray.reduce((o: any, a: string) => set(o, a.split('.')), {});

    return JSON.stringify(output)
      .replace(/\"|\:|null/g, '')
      .replace(/^\{/, '')
      .replace(/\}$/, '');
  }

  clearFilters() {
    this._currentFilters = [];
    this.updateOptions({ filteringOptions: [] });
  }

  clearSorters() {
    this._currentSorters = [];
    this.updateOptions({ sortingOptions: [] });
  }

  /**
   * Get an initialization of Pagination options
   * @return Pagination Options
   */
  getInitPaginationOptions(): GraphqlDatasetFilter {
    const paginationFirst = this.pagination ? this.pagination.pageSize : DEFAULT_ITEMS_PER_PAGE;
    return (this.options?.isWithCursor) ? { first: paginationFirst } : { first: paginationFirst, offset: 0 };
  }

  /** Get the GraphQL dataset name */
  getDatasetName(): string {
    return this.options?.datasetName || '';
  }

  /** Get the Filters that are currently used by the grid */
  getCurrentFilters(): ColumnFilters | CurrentFilter[] {
    return this._currentFilters;
  }

  /** Get the Pagination that is currently used by the grid */
  getCurrentPagination(): CurrentPagination | null {
    return this._currentPagination;
  }

  /** Get the Sorters that are currently used by the grid */
  getCurrentSorters(): CurrentSorter[] {
    return this._currentSorters;
  }

  /*
   * Reset the pagination options
   */
  resetPaginationOptions() {
    let paginationOptions: GraphqlPaginationOption | GraphqlCursorPaginationOption;

    if (this.options && this.options.isWithCursor) {
      // first, last, after, before
      paginationOptions = {
        after: '',
        before: undefined,
        last: undefined
      } as GraphqlCursorPaginationOption;
    } else {
      // first, last, offset
      paginationOptions = ((this.options && this.options.paginationOptions) || this.getInitPaginationOptions()) as GraphqlPaginationOption;
      (paginationOptions as GraphqlPaginationOption).offset = 0;
    }

    // save current pagination as Page 1 and page size as "first" set size
    this._currentPagination = {
      pageNumber: 1,
      pageSize: paginationOptions.first || DEFAULT_PAGE_SIZE
    };

    // unless user specifically set "enablePagination" to False, we'll update pagination options in every other cases
    if (this._gridOptions && (this._gridOptions.enablePagination || !this._gridOptions.hasOwnProperty('enablePagination'))) {
      this.updateOptions({ paginationOptions });
    }
  }

  updateOptions(serviceOptions?: Partial<GraphqlServiceOption>) {
    this.options = { ...this.options, ...serviceOptions } as GraphqlServiceOption;
  }

  /*
   * FILTERING
   */
  processOnFilterChanged(_event: Event | undefined, args: FilterChangedArgs): string {
    const gridOptions: GridOption = this._gridOptions;
    const backendApi = gridOptions.backendServiceApi;

    if (backendApi === undefined) {
      throw new Error('Something went wrong in the GraphqlService, "backendServiceApi" is not initialized');
    }

    // keep current filters & always save it as an array (columnFilters can be an object when it is dealt by SlickGrid Filter)
    this._currentFilters = this.castFilterToColumnFilters(args.columnFilters);

    if (!args || !args.grid) {
      throw new Error('Something went wrong when trying create the GraphQL Backend Service, it seems that "args" is not populated correctly');
    }

    // loop through all columns to inspect filters & set the query
    this.updateFilters(args.columnFilters, false);

    this.resetPaginationOptions();
    return this.buildQuery();
  }

  /*
   * PAGINATION
   * With cursor, the query can have 4 arguments (first, after, last, before), for example:
   *   users (first:20, after:"YXJyYXljb25uZWN0aW9uOjM=") {
   *     totalCount
   *     pageInfo {
   *       hasNextPage
   *       hasPreviousPage
   *       endCursor
   *       startCursor
   *     }
   *     edges {
   *       cursor
   *       node {
   *         name
   *         gender
   *       }
   *     }
   *   }
   * Without cursor, the query can have 3 arguments (first, last, offset), for example:
   *   users (first:20, offset: 10) {
   *     totalCount
   *     nodes {
   *       name
   *       gender
   *     }
   *   }
   */
  processOnPaginationChanged(_event: Event | undefined, args: PaginationChangedArgs): string {
    const pageSize = +(args.pageSize || ((this.pagination) ? this.pagination.pageSize : DEFAULT_PAGE_SIZE));
    this.updatePagination(args.newPage, pageSize);

    // build the GraphQL query which we will use in the WebAPI callback
    return this.buildQuery();
  }

  /*
   * SORTING
   * we will use sorting as per a Facebook suggestion on a Github issue (with some small changes)
   * https://github.com/graphql/graphql-relay-js/issues/20#issuecomment-220494222
   *
   *  users (first: 20, offset: 10, orderBy: [{field: lastName, direction: ASC}, {field: firstName, direction: DESC}]) {
   *    totalCount
   *    nodes {
   *      name
   *      gender
   *    }
   *  }
   */
  processOnSortChanged(_event: Event | undefined, args: SingleColumnSort | MultiColumnSort): string {
    const sortColumns = (args.multiColumnSort) ? (args as MultiColumnSort).sortCols : new Array({ columnId: (args as ColumnSort).sortCol.id, sortCol: (args as ColumnSort).sortCol, sortAsc: (args as ColumnSort).sortAsc });

    // loop through all columns to inspect sorters & set the query
    this.updateSorters(sortColumns);

    // build the GraphQL query which we will use in the WebAPI callback
    return this.buildQuery();
  }

  /**
   * loop through all columns to inspect filters & update backend service filteringOptions
   * @param columnFilters
   */
  updateFilters(columnFilters: ColumnFilters | CurrentFilter[], isUpdatedByPresetOrDynamically: boolean) {
    const searchByArray: GraphqlFilteringOption[] = [];
    let searchValue: string | string[];

    // on filter preset load, we need to keep current filters
    if (isUpdatedByPresetOrDynamically) {
      this._currentFilters = this.castFilterToColumnFilters(columnFilters);
    }

    for (const columnId in columnFilters) {
      if (columnFilters.hasOwnProperty(columnId)) {
        const columnFilter = (columnFilters as any)[columnId];

        // if user defined some "presets", then we need to find the filters from the column definitions instead
        let columnDef: Column | undefined;
        if (isUpdatedByPresetOrDynamically && Array.isArray(this._columnDefinitions)) {
          columnDef = this._columnDefinitions.find((column: Column) => column.id === columnFilter.columnId);
        } else {
          columnDef = columnFilter.columnDef;
        }
        if (!columnDef) {
          throw new Error('[GraphQL Service]: Something went wrong in trying to get the column definition of the specified filter (or preset filters). Did you make a typo on the filter columnId?');
        }

        const fieldName = columnDef.filter?.queryField || columnDef.queryFieldFilter || columnDef.queryField || columnDef.field || columnDef.name || '';
        const fieldType = columnDef.type || FieldType.string;
        let searchTerms = columnFilter?.searchTerms ?? [];
        let fieldSearchValue = (Array.isArray(searchTerms) && searchTerms.length === 1) ? searchTerms[0] : '';
        if (typeof fieldSearchValue === 'undefined') {
          fieldSearchValue = '';
        }

        if (!fieldName) {
          throw new Error(`GraphQL filter could not find the field name to query the search, your column definition must include a valid "field" or "name" (optionally you can also use the "queryfield").`);
        }

        fieldSearchValue = (fieldSearchValue === undefined || fieldSearchValue === null) ? '' : `${fieldSearchValue}`; // make sure it's a string
        const matches = fieldSearchValue.match(/^([<>!=\*]{0,2})(.*[^<>!=\*])([\*]?)$/); // group 1: Operator, 2: searchValue, 3: last char is '*' (meaning starts with, ex.: abc*)
        let operator: OperatorString = columnFilter.operator || ((matches) ? matches[1] : '');
        searchValue = (!!matches) ? matches[2] : '';
        const lastValueChar = (!!matches) ? matches[3] : (operator === '*z' ? '*' : '');

        // no need to query if search value is empty
        if (fieldName && searchValue === '' && searchTerms.length === 0) {
          continue;
        }

        if (Array.isArray(searchTerms) && searchTerms.length === 1 && typeof searchTerms[0] === 'string' && searchTerms[0].indexOf('..') >= 0) {
          if (operator !== OperatorType.rangeInclusive && operator !== OperatorType.rangeExclusive) {
            operator = this._gridOptions.defaultFilterRangeOperator ?? OperatorType.rangeInclusive;
          }
          searchTerms = searchTerms[0].split('..', 2);
          if (searchTerms[0] === '') {
            operator = operator === OperatorType.rangeInclusive ? '<=' : operator === OperatorType.rangeExclusive ? '<' : operator;
            searchTerms = searchTerms.slice(1);
            searchValue = searchTerms[0];
          } else if (searchTerms[1] === '') {
            operator = operator === OperatorType.rangeInclusive ? '>=' : operator === OperatorType.rangeExclusive ? '>' : operator;
            searchTerms = searchTerms.slice(0, 1);
            searchValue = searchTerms[0];
          }
        }

        if (typeof searchValue === 'string') {
          if (operator === '*' || operator === 'a*' || operator === '*z' || lastValueChar === '*') {
            operator = ((operator === '*' || operator === '*z') ? 'EndsWith' : 'StartsWith') as OperatorString;
          }
        }

        // if we didn't find an Operator but we have a Column Operator inside the Filter (DOM Element), we should use its default Operator
        // multipleSelect is "IN", while singleSelect is "EQ", else don't map any operator
        if (!operator && columnDef.filter && columnDef.filter.operator) {
          operator = columnDef.filter.operator;
        }

        // No operator and 2 search terms should lead to default range operator.
        if (!operator && Array.isArray(searchTerms) && searchTerms.length === 2 && searchTerms[0] && searchTerms[1]) {
          operator = this._gridOptions.defaultFilterRangeOperator as OperatorString;
        }

        // Range with 1 searchterm should lead to equals for a date field.
        if ((operator === OperatorType.rangeInclusive || OperatorType.rangeExclusive) && Array.isArray(searchTerms) && searchTerms.length === 1 && fieldType === FieldType.date) {
          operator = OperatorType.equal;
        }

        // Normalize all search values
        searchValue = this.normalizeSearchValue(fieldType, searchValue);
        if (Array.isArray(searchTerms)) {
          searchTerms.forEach((_part, index) => {
            searchTerms[index] = this.normalizeSearchValue(fieldType, searchTerms[index]);
          });
        }

        // when having more than 1 search term (we need to create a CSV string for GraphQL "IN" or "NOT IN" filter search)
        if (searchTerms && searchTerms.length > 1 && (operator === 'IN' || operator === 'NIN' || operator === 'NOT_IN')) {
          searchValue = searchTerms.join(',');
        } else if (searchTerms && searchTerms.length === 2 && (operator === OperatorType.rangeExclusive || operator === OperatorType.rangeInclusive)) {
          searchByArray.push({ field: fieldName, operator: (operator === OperatorType.rangeInclusive ? 'GE' : 'GT'), value: searchTerms[0] });
          searchByArray.push({ field: fieldName, operator: (operator === OperatorType.rangeInclusive ? 'LE' : 'LT'), value: searchTerms[1] });
          continue;
        }

        // if we still don't have an operator find the proper Operator to use by it's field type
        if (!operator) {
          operator = mapOperatorByFieldType(fieldType);
        }

        // build the search array
        searchByArray.push({ field: fieldName, operator: mapOperatorType(operator), value: searchValue });
      }
    }

    // update the service options with filters for the buildQuery() to work later
    this.updateOptions({ filteringOptions: searchByArray });
  }

  /**
   * Update the pagination component with it's new page number and size
   * @param newPage
   * @param pageSize
   */
  updatePagination(newPage: number, pageSize: number) {
    this._currentPagination = {
      pageNumber: newPage,
      pageSize
    };

    let paginationOptions;
    if (this.options && this.options.isWithCursor) {
      paginationOptions = {
        first: pageSize
      };
    } else {
      paginationOptions = {
        first: pageSize,
        offset: (newPage > 1) ? ((newPage - 1) * pageSize) : 0 // recalculate offset but make sure the result is always over 0
      };
    }

    this.updateOptions({ paginationOptions });
  }

  /**
   * loop through all columns to inspect sorters & update backend service sortingOptions
   * @param columnFilters
   */
  updateSorters(sortColumns?: ColumnSort[], presetSorters?: CurrentSorter[]) {
    let currentSorters: CurrentSorter[] = [];
    const graphqlSorters: GraphqlSortingOption[] = [];

    if (!sortColumns && presetSorters) {
      // make the presets the current sorters, also make sure that all direction are in uppercase for GraphQL
      currentSorters = presetSorters;
      currentSorters.forEach((sorter) => sorter.direction = sorter.direction.toUpperCase() as SortDirectionString);

      // display the correct sorting icons on the UI, for that it requires (columnId, sortAsc) properties
      const tmpSorterArray = currentSorters.map((sorter) => {
        const columnDef = this._columnDefinitions?.find((column: Column) => column.id === sorter.columnId);

        graphqlSorters.push({
          field: columnDef ? ((columnDef.queryFieldSorter || columnDef.queryField || columnDef.field) + '') : (sorter.columnId + ''),
          direction: sorter.direction
        });

        // return only the column(s) found in the Column Definitions ELSE null
        if (columnDef) {
          return {
            columnId: sorter.columnId,
            sortAsc: sorter.direction.toUpperCase() === SortDirection.ASC
          };
        }
        return null;
      }) as { columnId: string | number; sortAsc: boolean; }[] | null;

      // set the sort icons, but also make sure to filter out null values (that happens when columnDef is not found)
      if (Array.isArray(tmpSorterArray) && this._grid) {
        this._grid.setSortColumns(tmpSorterArray.filter(sorter => sorter) || []);
      }
    } else if (sortColumns && !presetSorters) {
      // build the orderBy array, it could be multisort, example
      // orderBy:[{field: lastName, direction: ASC}, {field: firstName, direction: DESC}]
      if (Array.isArray(sortColumns) && sortColumns.length > 0) {
        for (const column of sortColumns) {
          if (column && column.sortCol) {
            currentSorters.push({
              columnId: column.sortCol.id + '',
              direction: column.sortAsc ? SortDirection.ASC : SortDirection.DESC
            });

            const fieldName = (column.sortCol.queryFieldSorter || column.sortCol.queryField || column.sortCol.field || '') + '';
            if (fieldName) {
              graphqlSorters.push({
                field: fieldName,
                direction: column.sortAsc ? SortDirection.ASC : SortDirection.DESC
              });
            }
          }
        }
      }
    }

    // keep current Sorters and update the service options with the new sorting
    this._currentSorters = currentSorters;
    this.updateOptions({ sortingOptions: graphqlSorters });
  }

  /**
   * A function which takes an input string and removes double quotes only
   * on certain fields are identified as GraphQL enums (except fields with dot notation)
   * For example let say we identified ("direction:", "sort") as word which are GraphQL enum fields
   * then the result will be:
   * FROM
   * query { users (orderBy:[{field:"firstName", direction:"ASC"} }]) }
   * TO
   * query { users (orderBy:[{field: firstName, direction: ASC}})}
   *
   * EXCEPTIONS (fields with dot notation "." which are inside a "field:")
   * these fields will keep double quotes while everything else will be stripped of double quotes
   * query { users (orderBy:[{field:"billing.street.name", direction: "ASC"} }
   * TO
   * query { users (orderBy:[{field:"billing.street.name", direction: ASC}}
   * @param inputStr input string
   * @param enumSearchWords array of enum words to filter
   * @returns outputStr output string
   */
  trimDoubleQuotesOnEnumField(inputStr: string, enumSearchWords: string[], keepArgumentFieldDoubleQuotes: boolean) {
    const patternWordInQuotes = `\s?((field:\s*)?".*?")`;
    let patternRegex = enumSearchWords.join(patternWordInQuotes + '|');
    patternRegex += patternWordInQuotes; // the last one should also have the pattern but without the pipe "|"
    // example with (field: & direction:):  /field:s?(".*?")|direction:s?(".*?")/
    const reg = new RegExp(patternRegex, 'g');

    return inputStr.replace(reg, group1 => {
      // remove double quotes except when the string starts with a "field:"
      let removeDoubleQuotes = true;
      if (group1.startsWith('field:') && keepArgumentFieldDoubleQuotes) {
        removeDoubleQuotes = false;
      }
      const rep = removeDoubleQuotes ? group1.replace(/"/g, '') : group1;
      return rep;
    });
  }

  //
  // protected functions
  // -------------------
  /**
   * Cast provided filters (could be in multiple formats) into an array of CurrentFilter
   * @param columnFilters
   */
  protected castFilterToColumnFilters(columnFilters: ColumnFilters | CurrentFilter[]): CurrentFilter[] {
    // keep current filters & always save it as an array (columnFilters can be an object when it is dealt by SlickGrid Filter)
    const filtersArray: ColumnFilter[] = (typeof columnFilters === 'object') ? Object.keys(columnFilters).map(key => (columnFilters as any)[key]) : columnFilters;

    if (!Array.isArray(filtersArray)) {
      return [];
    }

    return filtersArray.map((filter) => {
      const tmpFilter: CurrentFilter = { columnId: filter.columnId || '' };
      if (filter.operator) {
        tmpFilter.operator = filter.operator;
      }
      if (Array.isArray(filter.searchTerms)) {
        tmpFilter.searchTerms = filter.searchTerms;
      }
      return tmpFilter;
    });
  }

  /** Normalizes the search value according to field type. */
  protected normalizeSearchValue(fieldType: typeof FieldType[keyof typeof FieldType], searchValue: any): any {
    switch (fieldType) {
      case FieldType.date:
      case FieldType.string:
      case FieldType.text:
      case FieldType.readonly:
        if (typeof searchValue === 'string') {
          // escape single quotes by doubling them
          searchValue = searchValue.replace(/'/g, `''`);
        }
        break;
      case FieldType.integer:
      case FieldType.number:
      case FieldType.float:
        if (typeof searchValue === 'string') {
          // Parse a valid decimal from the string.

          // Replace double dots with single dots
          searchValue = searchValue.replace(/\.\./g, '.');
          // Remove a trailing dot
          searchValue = searchValue.replace(/\.+$/g, '');
          // Prefix a leading dot with 0
          searchValue = searchValue.replace(/^\.+/g, '0.');
          // Prefix leading dash dot with -0.
          searchValue = searchValue.replace(/^\-+\.+/g, '-0.');
          // Remove any non valid decimal characters from the search string
          searchValue = searchValue.replace(/(?!^\-)[^\d\.]/g, '');

          // if nothing left, search for 0
          if (searchValue === '' || searchValue === '-') {
            searchValue = '0';
          }
        }
        break;
    }

    return searchValue;
  }
}
