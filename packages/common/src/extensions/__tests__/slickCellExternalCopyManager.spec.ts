import 'jest-extended';

import { Column, GridOption, SlickGrid, SlickNamespace, } from '../../interfaces/index';
import { SlickCellSelectionModel } from '../slickCellSelectionModel';
import { SlickCellExternalCopyManager } from '../slickCellExternalCopyManager';
import { InputEditor } from '../../editors/inputEditor';

declare const Slick: SlickNamespace;
jest.mock('flatpickr', () => { });

const mockGetSelectionModel = {
  getSelectedRanges: jest.fn(),
};
const gridStub = {
  getActiveCell: jest.fn(),
  getColumns: jest.fn(),
  getData: jest.fn(),
  getDataItem: jest.fn(),
  getDataLength: jest.fn(),
  getEditorLock: () => ({
    isActive: () => false,
  }),
  getOptions: jest.fn(),
  focus: jest.fn(),
  getSelectionModel: () => mockGetSelectionModel,
  registerPlugin: jest.fn(),
  removeCellCssStyles: jest.fn(),
  setCellCssStyles: jest.fn(),
  setData: jest.fn(),
  setSelectionModel: jest.fn(),
  updateCell: jest.fn(),
  render: jest.fn(),
  onCellChange: new Slick.Event(),
  onKeyDown: new Slick.Event(),
} as unknown as SlickGrid;

const mockCellSelectionModel = {
  constructor: jest.fn(),
  init: jest.fn(),
  dispose: jest.fn(),
  getSelectedRanges: jest.fn(),
  setSelectedRanges: jest.fn(),
  getSelectedRows: jest.fn(),
  setSelectedRows: jest.fn(),
  onSelectedRangesChanged: new Slick.Event(),
} as unknown as SlickCellSelectionModel;

const mockTextEditor = {
  constructor: jest.fn(),
  init: jest.fn(),
  destroy: jest.fn(),
  applyValue: jest.fn(),
  loadValue: jest.fn(),
  serializeValue: jest.fn(),
} as unknown as InputEditor;

const mockTextEditorImplementation = jest.fn().mockImplementation(() => mockTextEditor);

const Editors = {
  text: mockTextEditorImplementation
};

describe('CellExternalCopyManager', () => {
  const mockEventCallback = () => { };
  const mockColumns = [
    { id: 'firstName', field: 'firstName', name: 'First Name', editor: Editors.text, internalColumnEditor: Editors.text },
    { id: 'lastName', field: 'lastName', name: 'Last Name', },
    { id: 'age', field: 'age', name: 'Age', editor: Editors.text, internalColumnEditor: Editors.text },
  ] as Column[];
  let plugin: SlickCellExternalCopyManager;
  const gridOptionsMock = {
    editable: true,
    enableCheckboxSelector: true,
    excelCopyBufferOptions: {
      onExtensionRegistered: jest.fn(),
      onCopyCells: mockEventCallback,
      onCopyCancelled: mockEventCallback,
      onPasteCells: mockEventCallback,
    }
  } as GridOption;

  beforeEach(() => {
    plugin = new SlickCellExternalCopyManager();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create the plugin', () => {
    expect(plugin).toBeTruthy();
    expect(plugin.eventHandler).toBeTruthy();
  });

  describe('registered addon', () => {
    beforeEach(() => {
      jest.spyOn(gridStub, 'getOptions').mockReturnValue(gridOptionsMock);
    });

    afterEach(() => {
      plugin.dispose();
      jest.clearAllMocks();
    });

    it('should throw an error initializing the plugin without a selection model', (done) => {
      jest.spyOn(gridStub, 'getSelectionModel').mockReturnValue(null);
      try {
        plugin.init(gridStub);
      } catch (error) {
        expect(error.message).toBe('Selection model is mandatory for this plugin. Please set a selection model on the grid before adding this plugin: grid.setSelectionModel(new Slick.CellSelectionModel())');
        done();
      }
    });

    it('should focus on the grid after "onSelectedRangesChanged" is triggered', () => {
      jest.spyOn(gridStub, 'getSelectionModel').mockReturnValue(mockCellSelectionModel as any);
      const gridFocusSpy = jest.spyOn(gridStub, 'focus');

      plugin.init(gridStub);
      const eventData = { ...new Slick.EventData(), preventDefault: jest.fn() };
      mockCellSelectionModel.onSelectedRangesChanged.notify({ fromCell: 0, fromRow: 0, toCell: 0, toRow: 0 }, eventData, gridStub);

      expect(gridFocusSpy).toHaveBeenCalled();
    });

    it('should remove CSS styling when "clearCopySelection" is called', () => {
      const removeStyleSpy = jest.spyOn(gridStub, 'removeCellCssStyles');
      plugin.init(gridStub);
      plugin.clearCopySelection();
      expect(removeStyleSpy).toHaveBeenCalledWith('copy-manager');
    });

    it('should call "getHeaderValueForColumn" and expect the ouput to be what "headerColumnValueExtractor" returns when it is provided', () => {
      plugin.init(gridStub, { headerColumnValueExtractor: () => 'Full Name' });
      const output = plugin.getHeaderValueForColumn(mockColumns[0]);
      expect(output).toEqual('Full Name');
    });

    it('should call "getHeaderValueForColumn" and expect the column name property be returned when "headerColumnValueExtractor" is not provided', () => {
      plugin.init(gridStub);
      const output = plugin.getHeaderValueForColumn(mockColumns[0]);
      expect(output).toEqual('First Name');
    });

    it('should call "getDataItemValueForColumn" and expect the ouput to be what "dataItemColumnValueExtractor" returns when it is provided', () => {
      plugin.init(gridStub, { dataItemColumnValueExtractor: (item, col) => col.field === 'firstName' ? 'Full Name' : 'Last Name' });
      const output = plugin.getDataItemValueForColumn({ firstName: 'John', lastName: 'Doe' }, mockColumns[0], new Event('mousedown'));
      expect(output).toEqual('Full Name');
    });

    it('should call "getDataItemValueForColumn" and expect the editor serialized value returned when an Editor is provided', () => {
      jest.spyOn(mockTextEditor, 'serializeValue').mockReturnValue('serialized output');
      plugin.init(gridStub);
      const output = plugin.getDataItemValueForColumn({ firstName: 'John', lastName: 'Doe' }, mockColumns[0], new Event('mousedown'));
      expect(output).toEqual('serialized output');
    });

    it('should call "getDataItemValueForColumn" and expect the column "field" value returned when there is no Editor provided', () => {
      plugin.init(gridStub);
      const output = plugin.getDataItemValueForColumn({ firstName: 'John', lastName: 'Doe' }, mockColumns[1], new Event('mousedown'));
      expect(output).toEqual('Doe');
    });

    it('should call "setDataItemValueForColumn" and expect the ouput to be what "dataItemColumnValueSetter" returns when it is provided', () => {
      plugin.init(gridStub, { dataItemColumnValueSetter: (item, col, val) => val });
      const output = plugin.setDataItemValueForColumn({ firstName: 'John', lastName: 'Doe' }, mockColumns[1], 'some value');
      expect(output).toEqual('some value');
    });

    it('should call "setDataItemValueForColumn" and expect the Editor load & apply value to be set when Editor is provided', () => {
      const applyValSpy = jest.spyOn(mockTextEditor, 'applyValue');
      const loadValSpy = jest.spyOn(mockTextEditor, 'loadValue');

      const mockItem = { firstName: 'John', lastName: 'Doe' };
      plugin.init(gridStub);
      plugin.setDataItemValueForColumn(mockItem, mockColumns[0], 'some value');

      expect(loadValSpy).toHaveBeenCalledWith(mockItem);
      expect(applyValSpy).toHaveBeenCalledWith(mockItem, 'some value');
    });

    it('should call "setDataItemValueForColumn" and expect item last name to change with new value when no Editor is provided', () => {
      const mockItem = { firstName: 'John', lastName: 'Doe' };
      plugin.init(gridStub);
      plugin.setDataItemValueForColumn(mockItem, mockColumns[1], 'some value');

      expect(mockItem.lastName).toEqual('some value');
    });

    it('should set "includeHeaderWhenCopying" when its SETTER is called', () => {
      plugin.init(gridStub);
      plugin.setIncludeHeaderWhenCopying(true);
      expect(plugin.addonOptions.includeHeaderWhenCopying).toBeTruthy();
    });

    describe('keyDown handler', () => {
      beforeEach(() => {
        jest.spyOn(gridStub, 'getColumns').mockReturnValue(mockColumns);
        jest.spyOn(gridStub, 'getDataLength').mockReturnValue(2);
        jest.spyOn(gridStub, 'getData').mockReturnValue([{ firstName: 'John', lastName: 'Doe', age: 30 }, { firstName: 'Jane', lastName: 'Doe' }]);
        jest.spyOn(gridStub, 'getDataItem').mockReturnValue({ firstName: 'John', lastName: 'Doe' }).mockReturnValueOnce({ firstName: 'Jane', lastName: 'Doe' });
      });

      afterEach(() => {
        jest.clearAllMocks();
      });

      it('should Copy & Paste then clear selections', (done) => {
        const mockOnCopyCancelled = jest.fn();
        const mockOnCopyInit = jest.fn();
        const mockOnCopyCells = jest.fn();
        const mockOnCopySuccess = jest.fn();

        const clearSpy = jest.spyOn(plugin, 'clearCopySelection');
        jest.spyOn(gridStub.getSelectionModel(), 'getSelectedRanges').mockReturnValue([{ fromRow: 0, fromCell: 1, toRow: 2, toCell: 2 }]);

        plugin.init(gridStub, { clearCopySelectionDelay: 1, clipboardPasteDelay: 2, includeHeaderWhenCopying: true, onCopyCancelled: mockOnCopyCancelled, onCopyInit: mockOnCopyInit, onCopyCells: mockOnCopyCells, onCopySuccess: mockOnCopySuccess });

        const keyDownCtrlCopyEvent = new Event('keydown');
        Object.defineProperty(keyDownCtrlCopyEvent, 'ctrlKey', { writable: true, configurable: true, value: true });
        Object.defineProperty(keyDownCtrlCopyEvent, 'key', { writable: true, configurable: true, value: 'c' });
        Object.defineProperty(keyDownCtrlCopyEvent, 'isPropagationStopped', { writable: true, configurable: true, value: jest.fn() });
        Object.defineProperty(keyDownCtrlCopyEvent, 'isImmediatePropagationStopped', { writable: true, configurable: true, value: jest.fn() });
        gridStub.onKeyDown.notify({ cell: 0, row: 0, grid: gridStub }, keyDownCtrlCopyEvent, gridStub);

        const keyDownEscEvent = new Event('keydown');
        Object.defineProperty(keyDownEscEvent, 'key', { writable: true, configurable: true, value: 'Escape' });
        Object.defineProperty(keyDownEscEvent, 'isPropagationStopped', { writable: true, configurable: true, value: jest.fn() });
        Object.defineProperty(keyDownEscEvent, 'isImmediatePropagationStopped', { writable: true, configurable: true, value: jest.fn() });
        gridStub.onKeyDown.notify({ cell: 0, row: 0, grid: gridStub }, keyDownEscEvent, gridStub);

        expect(clearSpy).toHaveBeenCalled();
        expect(mockOnCopyInit).toHaveBeenCalled();
        expect(mockOnCopyCancelled).toHaveBeenCalledWith(keyDownEscEvent, { ranges: [{ fromCell: 1, fromRow: 0, toCell: 2, toRow: 2 }] });
        expect(mockOnCopyCells).toHaveBeenCalledWith(keyDownEscEvent, { ranges: expect.toBeArray() });

        const getActiveCellSpy = jest.spyOn(gridStub, 'getActiveCell');
        const keyDownCtrlPasteEvent = new Event('keydown');
        jest.spyOn(gridStub, 'getColumns').mockReturnValue(mockColumns);
        Object.defineProperty(keyDownCtrlPasteEvent, 'ctrlKey', { writable: true, configurable: true, value: true });
        Object.defineProperty(keyDownCtrlPasteEvent, 'key', { writable: true, configurable: true, value: 'v' });
        Object.defineProperty(keyDownCtrlPasteEvent, 'isPropagationStopped', { writable: true, configurable: true, value: jest.fn() });
        Object.defineProperty(keyDownCtrlPasteEvent, 'isImmediatePropagationStopped', { writable: true, configurable: true, value: jest.fn() });
        gridStub.onKeyDown.notify({ cell: 0, row: 0, grid: gridStub }, keyDownCtrlPasteEvent, gridStub);
        setTimeout(() => {
          expect(getActiveCellSpy).toHaveBeenCalled();
          expect(clearSpy).toHaveBeenCalled();
          done();
        }, 2);
      });

      it('should copy selection and use window.clipboard when exist and Paste is performed', (done) => {
        const mockOnCopyInit = jest.fn();
        const mockOnCopyCells = jest.fn();
        const mockSetData = jest.fn();
        const mockClipboard = () => ({ setData: mockSetData });
        Object.defineProperty(window, 'clipboardData', { writable: true, configurable: true, value: mockClipboard() });
        const clearSpy = jest.spyOn(plugin, 'clearCopySelection');
        jest.spyOn(gridStub.getSelectionModel(), 'getSelectedRanges').mockReturnValue([{ fromRow: 0, fromCell: 1, toRow: 1, toCell: 2 }]);

        plugin.init(gridStub, { clipboardPasteDelay: 1, clearCopySelectionDelay: 1, includeHeaderWhenCopying: true, onCopyInit: mockOnCopyInit, onCopyCells: mockOnCopyCells });

        const keyDownCtrlCopyEvent = new Event('keydown');
        Object.defineProperty(keyDownCtrlCopyEvent, 'ctrlKey', { writable: true, configurable: true, value: true });
        Object.defineProperty(keyDownCtrlCopyEvent, 'key', { writable: true, configurable: true, value: 'c' });
        Object.defineProperty(keyDownCtrlCopyEvent, 'isPropagationStopped', { writable: true, configurable: true, value: jest.fn() });
        Object.defineProperty(keyDownCtrlCopyEvent, 'isImmediatePropagationStopped', { writable: true, configurable: true, value: jest.fn() });
        gridStub.onKeyDown.notify({ cell: 0, row: 0, grid: gridStub }, keyDownCtrlCopyEvent, gridStub);

        expect(clearSpy).toHaveBeenCalled();
        expect(mockOnCopyInit).toHaveBeenCalled();
        expect(mockSetData).toHaveBeenCalledWith('Text', expect.toBeString());
        expect(mockSetData).toHaveBeenCalledWith('Text', expect.stringContaining(`Last Name\tAge`));
        expect(mockSetData).toHaveBeenCalledWith('Text', expect.stringContaining(`Doe\tserialized output`));

        const getActiveCellSpy = jest.spyOn(gridStub, 'getActiveCell');
        const keyDownCtrlPasteEvent = new Event('keydown');
        jest.spyOn(gridStub, 'getColumns').mockReturnValue(mockColumns);
        Object.defineProperty(keyDownCtrlPasteEvent, 'ctrlKey', { writable: true, configurable: true, value: true });
        Object.defineProperty(keyDownCtrlPasteEvent, 'key', { writable: true, configurable: true, value: 'v' });
        Object.defineProperty(keyDownCtrlPasteEvent, 'isPropagationStopped', { writable: true, configurable: true, value: jest.fn() });
        Object.defineProperty(keyDownCtrlPasteEvent, 'isImmediatePropagationStopped', { writable: true, configurable: true, value: jest.fn() });
        gridStub.onKeyDown.notify({ cell: 0, row: 0, grid: gridStub }, keyDownCtrlPasteEvent, gridStub);
        setTimeout(() => {
          expect(getActiveCellSpy).toHaveBeenCalled();
          expect(clearSpy).toHaveBeenCalled();
          done();
        }, 2);
      });

      it('should Copy, Paste and run Execute clip command', (done) => {
        jest.spyOn(gridStub.getSelectionModel(), 'getSelectedRanges').mockReturnValueOnce([{ fromRow: 0, fromCell: 1, toRow: 1, toCell: 2 }]).mockReturnValueOnce(null);

        plugin.init(gridStub, { clipboardPasteDelay: 1, clearCopySelectionDelay: 1, includeHeaderWhenCopying: true, });

        const keyDownCtrlCopyEvent = new Event('keydown');
        Object.defineProperty(keyDownCtrlCopyEvent, 'ctrlKey', { writable: true, configurable: true, value: true });
        Object.defineProperty(keyDownCtrlCopyEvent, 'key', { writable: true, configurable: true, value: 'c' });
        Object.defineProperty(keyDownCtrlCopyEvent, 'isPropagationStopped', { writable: true, configurable: true, value: jest.fn() });
        Object.defineProperty(keyDownCtrlCopyEvent, 'isImmediatePropagationStopped', { writable: true, configurable: true, value: jest.fn() });
        gridStub.onKeyDown.notify({ cell: 0, row: 0, grid: gridStub }, keyDownCtrlCopyEvent, gridStub);

        const updateCellSpy = jest.spyOn(gridStub, 'updateCell');
        const onCellChangeSpy = jest.spyOn(gridStub.onCellChange, 'notify');
        const getActiveCellSpy = jest.spyOn(gridStub, 'getActiveCell').mockReturnValue({ cell: 0, row: 1 });
        const keyDownCtrlPasteEvent = new Event('keydown');
        jest.spyOn(gridStub, 'getColumns').mockReturnValue(mockColumns);
        Object.defineProperty(keyDownCtrlPasteEvent, 'ctrlKey', { writable: true, configurable: true, value: true });
        Object.defineProperty(keyDownCtrlPasteEvent, 'key', { writable: true, configurable: true, value: 'v' });
        Object.defineProperty(keyDownCtrlPasteEvent, 'isPropagationStopped', { writable: true, configurable: true, value: jest.fn() });
        Object.defineProperty(keyDownCtrlPasteEvent, 'isImmediatePropagationStopped', { writable: true, configurable: true, value: jest.fn() });
        gridStub.onKeyDown.notify({ cell: 0, row: 0, grid: gridStub }, keyDownCtrlPasteEvent, gridStub);
        document.querySelector('textarea').value = `Doe\tserialized output`;

        setTimeout(() => {
          expect(getActiveCellSpy).toHaveBeenCalled();
          expect(updateCellSpy).toHaveBeenCalledWith(1, 0);
          expect(updateCellSpy).toHaveBeenCalledWith(1, 1);
          expect(onCellChangeSpy).toHaveBeenCalledWith({ row: 1, cell: 0, item: { firstName: 'John', lastName: 'serialized output' }, grid: gridStub, column: {} });
          const getDataItemSpy = jest.spyOn(gridStub, 'getDataItem');
          plugin.clipCommand.undo();
          expect(getDataItemSpy).toHaveBeenCalled();
          done();
        }, 2);
      });

      it('should Copy, Paste and run Execute clip command with only 1 cell to copy', (done) => {
        jest.spyOn(gridStub.getSelectionModel(), 'getSelectedRanges').mockReturnValueOnce([{ fromRow: 0, fromCell: 1, toRow: 1, toCell: 2 }]).mockReturnValueOnce([{ fromRow: 0, fromCell: 1, toRow: 1, toCell: 2 }]);

        plugin.init(gridStub, { clipboardPasteDelay: 1, clearCopySelectionDelay: 1, includeHeaderWhenCopying: true, });

        const keyDownCtrlCopyEvent = new Event('keydown');
        Object.defineProperty(keyDownCtrlCopyEvent, 'ctrlKey', { writable: true, configurable: true, value: true });
        Object.defineProperty(keyDownCtrlCopyEvent, 'key', { writable: true, configurable: true, value: 'c' });
        Object.defineProperty(keyDownCtrlCopyEvent, 'isPropagationStopped', { writable: true, configurable: true, value: jest.fn() });
        Object.defineProperty(keyDownCtrlCopyEvent, 'isImmediatePropagationStopped', { writable: true, configurable: true, value: jest.fn() });
        gridStub.onKeyDown.notify({ cell: 0, row: 0, grid: gridStub }, keyDownCtrlCopyEvent, gridStub);

        const updateCellSpy = jest.spyOn(gridStub, 'updateCell');
        const onCellChangeSpy = jest.spyOn(gridStub.onCellChange, 'notify');
        const getActiveCellSpy = jest.spyOn(gridStub, 'getActiveCell').mockReturnValue({ cell: 0, row: 1 });
        const keyDownCtrlPasteEvent = new Event('keydown');
        jest.spyOn(gridStub, 'getColumns').mockReturnValue(mockColumns);
        Object.defineProperty(keyDownCtrlPasteEvent, 'ctrlKey', { writable: true, configurable: true, value: true });
        Object.defineProperty(keyDownCtrlPasteEvent, 'key', { writable: true, configurable: true, value: 'v' });
        Object.defineProperty(keyDownCtrlPasteEvent, 'isPropagationStopped', { writable: true, configurable: true, value: jest.fn() });
        Object.defineProperty(keyDownCtrlPasteEvent, 'isImmediatePropagationStopped', { writable: true, configurable: true, value: jest.fn() });
        gridStub.onKeyDown.notify({ cell: 0, row: 0, grid: gridStub }, keyDownCtrlPasteEvent, gridStub);
        document.querySelector('textarea').value = `Smith`;

        setTimeout(() => {
          expect(getActiveCellSpy).toHaveBeenCalled();
          expect(updateCellSpy).toHaveBeenCalledWith(0, 1);
          expect(updateCellSpy).toHaveBeenCalledWith(0, 2);
          expect(onCellChangeSpy).toHaveBeenCalledWith({ row: 1, cell: 2, item: { firstName: 'John', lastName: 'Smith' }, grid: gridStub, column: {} });

          const getDataItemSpy = jest.spyOn(gridStub, 'getDataItem');
          const updateCell2Spy = jest.spyOn(gridStub, 'updateCell');
          const onCellChange2Spy = jest.spyOn(gridStub.onCellChange, 'notify');
          const setDataItemValSpy = jest.spyOn(plugin, 'setDataItemValueForColumn');
          plugin.clipCommand.undo();
          expect(getDataItemSpy).toHaveBeenCalled();
          expect(updateCell2Spy).toHaveBeenCalled();
          expect(onCellChangeSpy).toHaveBeenCalled();
          // expect(onCellChange2Spy).toHaveBeenCalledWith({ row: 1, cell: 2, item: { firstName: 'John', lastName: 'Smith' }, grid: gridStub, column: {} });
          expect(setDataItemValSpy).toHaveBeenCalled();
          done();
        }, 2);
      });

      it('should Copy, Paste but not execute run clipCommandHandler when defined', (done) => {
        const mockClipboardCommandHandler = jest.fn();
        jest.spyOn(gridStub.getSelectionModel(), 'getSelectedRanges').mockReturnValueOnce([{ fromRow: 0, fromCell: 1, toRow: 2, toCell: 2 }]).mockReturnValueOnce(null);

        plugin.init(gridStub, { clearCopySelectionDelay: 1, clipboardPasteDelay: 1, includeHeaderWhenCopying: true, clipboardCommandHandler: mockClipboardCommandHandler });

        const keyDownCtrlCopyEvent = new Event('keydown');
        Object.defineProperty(keyDownCtrlCopyEvent, 'ctrlKey', { writable: true, configurable: true, value: true });
        Object.defineProperty(keyDownCtrlCopyEvent, 'key', { writable: true, configurable: true, value: 'c' });
        Object.defineProperty(keyDownCtrlCopyEvent, 'isPropagationStopped', { writable: true, configurable: true, value: jest.fn() });
        Object.defineProperty(keyDownCtrlCopyEvent, 'isImmediatePropagationStopped', { writable: true, configurable: true, value: jest.fn() });
        gridStub.onKeyDown.notify({ cell: 0, row: 0, grid: gridStub }, keyDownCtrlCopyEvent, gridStub);

        const getActiveCellSpy = jest.spyOn(gridStub, 'getActiveCell').mockReturnValue({ cell: 0, row: 1 });
        const keyDownCtrlPasteEvent = new Event('keydown');
        jest.spyOn(gridStub, 'getColumns').mockReturnValue(mockColumns);
        Object.defineProperty(keyDownCtrlPasteEvent, 'ctrlKey', { writable: true, configurable: true, value: true });
        Object.defineProperty(keyDownCtrlPasteEvent, 'key', { writable: true, configurable: true, value: 'v' });
        Object.defineProperty(keyDownCtrlPasteEvent, 'isPropagationStopped', { writable: true, configurable: true, value: jest.fn() });
        Object.defineProperty(keyDownCtrlPasteEvent, 'isImmediatePropagationStopped', { writable: true, configurable: true, value: jest.fn() });
        gridStub.onKeyDown.notify({ cell: 0, row: 0, grid: gridStub }, keyDownCtrlPasteEvent, gridStub);
        document.querySelector('textarea').value = `Doe\tserialized output`;

        setTimeout(() => {
          expect(getActiveCellSpy).toHaveBeenCalled();
          expect(mockClipboardCommandHandler).toHaveBeenCalled();
          done();
        }, 2);
      });

      it('should Copy, Paste without completing it because it does not know where to paste it', (done) => {
        const mockClipboardCommandHandler = jest.fn();
        jest.spyOn(gridStub.getSelectionModel(), 'getSelectedRanges').mockReturnValueOnce([{ fromRow: 0, fromCell: 1, toRow: 2, toCell: 2 }]).mockReturnValueOnce(null);

        plugin.init(gridStub, { clearCopySelectionDelay: 1, clipboardPasteDelay: 1, includeHeaderWhenCopying: true, clipboardCommandHandler: mockClipboardCommandHandler });

        const keyDownCtrlCopyEvent = new Event('keydown');
        Object.defineProperty(keyDownCtrlCopyEvent, 'ctrlKey', { writable: true, configurable: true, value: true });
        Object.defineProperty(keyDownCtrlCopyEvent, 'key', { writable: true, configurable: true, value: 'c' });
        Object.defineProperty(keyDownCtrlCopyEvent, 'isPropagationStopped', { writable: true, configurable: true, value: jest.fn() });
        Object.defineProperty(keyDownCtrlCopyEvent, 'isImmediatePropagationStopped', { writable: true, configurable: true, value: jest.fn() });
        gridStub.onKeyDown.notify({ cell: 0, row: 0, grid: gridStub }, keyDownCtrlCopyEvent, gridStub);

        const getActiveCellSpy = jest.spyOn(gridStub, 'getActiveCell').mockReturnValue(null);
        const keyDownCtrlPasteEvent = new Event('keydown');
        jest.spyOn(gridStub, 'getColumns').mockReturnValue(mockColumns);
        Object.defineProperty(keyDownCtrlPasteEvent, 'ctrlKey', { writable: true, configurable: true, value: true });
        Object.defineProperty(keyDownCtrlPasteEvent, 'key', { writable: true, configurable: true, value: 'v' });
        Object.defineProperty(keyDownCtrlPasteEvent, 'isPropagationStopped', { writable: true, configurable: true, value: jest.fn() });
        Object.defineProperty(keyDownCtrlPasteEvent, 'isImmediatePropagationStopped', { writable: true, configurable: true, value: jest.fn() });
        gridStub.onKeyDown.notify({ cell: 0, row: 0, grid: gridStub }, keyDownCtrlPasteEvent, gridStub);
        document.querySelector('textarea').value = `Doe\tserialized output`;

        setTimeout(() => {
          expect(getActiveCellSpy).toHaveBeenCalled();
          expect(mockClipboardCommandHandler).not.toHaveBeenCalled();
          done();
        }, 2);
      });

      it('should Copy, Paste and run Execute clip command', (done) => {
        const mockNewRowCreator = jest.fn();
        const mockOnPasteCells = jest.fn();
        const renderSpy = jest.spyOn(gridStub, 'render');
        const setDataSpy = jest.spyOn(gridStub, 'setData');
        jest.spyOn(gridStub.getSelectionModel(), 'getSelectedRanges').mockReturnValueOnce([{ fromRow: 0, fromCell: 1, toRow: 2, toCell: 2 }]).mockReturnValueOnce(null);

        plugin.init(gridStub, { clearCopySelectionDelay: 1, clipboardPasteDelay: 1, includeHeaderWhenCopying: true, newRowCreator: mockNewRowCreator, onPasteCells: mockOnPasteCells });

        const keyDownCtrlCopyEvent = new Event('keydown');
        Object.defineProperty(keyDownCtrlCopyEvent, 'ctrlKey', { writable: true, configurable: true, value: true });
        Object.defineProperty(keyDownCtrlCopyEvent, 'key', { writable: true, configurable: true, value: 'c' });
        Object.defineProperty(keyDownCtrlCopyEvent, 'isPropagationStopped', { writable: true, configurable: true, value: jest.fn() });
        Object.defineProperty(keyDownCtrlCopyEvent, 'isImmediatePropagationStopped', { writable: true, configurable: true, value: jest.fn() });
        gridStub.onKeyDown.notify({ cell: 0, row: 0, grid: gridStub }, keyDownCtrlCopyEvent, gridStub);

        const getActiveCellSpy = jest.spyOn(gridStub, 'getActiveCell').mockReturnValue({ cell: 0, row: 3 });
        const keyDownCtrlPasteEvent = new Event('keydown');
        jest.spyOn(gridStub, 'getColumns').mockReturnValue(mockColumns);
        Object.defineProperty(keyDownCtrlPasteEvent, 'ctrlKey', { writable: true, configurable: true, value: true });
        Object.defineProperty(keyDownCtrlPasteEvent, 'key', { writable: true, configurable: true, value: 'v' });
        Object.defineProperty(keyDownCtrlPasteEvent, 'isPropagationStopped', { writable: true, configurable: true, value: jest.fn() });
        Object.defineProperty(keyDownCtrlPasteEvent, 'isImmediatePropagationStopped', { writable: true, configurable: true, value: jest.fn() });
        gridStub.onKeyDown.notify({ cell: 0, row: 0, grid: gridStub }, keyDownCtrlPasteEvent, gridStub);
        document.querySelector('textarea').value = `Doe\tserialized output`;

        setTimeout(() => {
          expect(getActiveCellSpy).toHaveBeenCalled();
          expect(renderSpy).toHaveBeenCalled();
          expect(setDataSpy).toHaveBeenCalledWith([{ firstName: 'John', lastName: 'Doe', age: 30 }, { firstName: 'Jane', lastName: 'Doe' }, {}, {}]);
          expect(mockNewRowCreator).toHaveBeenCalled();

          const getDataItemSpy = jest.spyOn(gridStub, 'getDataItem');
          const setData2Spy = jest.spyOn(gridStub, 'setData');
          const render2Spy = jest.spyOn(gridStub, 'render');
          plugin.clipCommand.undo();
          expect(getDataItemSpy).toHaveBeenCalled();
          expect(setData2Spy).toHaveBeenCalledWith([{ firstName: 'John', lastName: 'Doe', age: 30 }, { firstName: 'Jane', lastName: 'Doe' }]);
          expect(render2Spy).toHaveBeenCalled();
          expect(mockOnPasteCells).toHaveBeenCalledWith(expect.toBeObject(), { ranges: [{ fromCell: 0, fromRow: 3, toCell: 1, toRow: 3 }] });
          done();
        }, 2);
      });
    });
  });
});