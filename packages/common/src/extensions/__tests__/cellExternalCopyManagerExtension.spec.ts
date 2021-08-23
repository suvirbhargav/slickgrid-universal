import { CellRange, EditCommand, ExcelCopyBufferOption, Formatter, GridOption, SlickCellExternalCopyManager, SlickGrid, SlickNamespace, } from '../../interfaces/index';
import { Formatters } from '../../formatters';
import { CellExternalCopyManagerExtension } from '../cellExternalCopyManagerExtension';
import { ExtensionUtility } from '../extensionUtility';
import { SharedService } from '../../services/shared.service';
import { TranslateServiceStub } from '../../../../../test/translateServiceStub';
import { BackendUtilityService } from '../../services';

declare const Slick: SlickNamespace;
jest.mock('flatpickr', () => { });

const gridStub = {
  getData: jest.fn(),
  getOptions: jest.fn(),
  registerPlugin: jest.fn(),
  setSelectionModel: jest.fn(),
} as unknown as SlickGrid;

const addonStub = {
  init: jest.fn(),
  destroy: jest.fn(),
  onCopyCells: new Slick.Event(),
  onCopyCancelled: new Slick.Event(),
  onPasteCells: new Slick.Event(),
};
const mockAddon = jest.fn().mockImplementation(() => addonStub);
const mockSelectionModel = jest.fn().mockImplementation(() => ({
  init: jest.fn(),
  destroy: jest.fn()
}));
Slick.CellExternalCopyManager = mockAddon;
Slick.CellSelectionModel = mockSelectionModel;

describe('cellExternalCopyManagerExtension', () => {
  jest.mock('slickgrid/plugins/slick.cellexternalcopymanager', () => mockAddon);
  jest.mock('slickgrid/plugins/slick.cellselectionmodel', () => mockSelectionModel);

  let queueCallback: EditCommand;
  const mockEventCallback = () => { };
  const mockSelectRange = [{ fromCell: 1, fromRow: 1, toCell: 1, toRow: 1 }] as CellRange[];
  const mockSelectRangeEvent = { ranges: mockSelectRange };

  let extension: CellExternalCopyManagerExtension;
  let extensionUtility: ExtensionUtility;
  let backendUtilityService: BackendUtilityService;
  let sharedService: SharedService;
  let translateService: TranslateServiceStub;
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
    sharedService = new SharedService();
    backendUtilityService = new BackendUtilityService();
    translateService = new TranslateServiceStub();
    extensionUtility = new ExtensionUtility(sharedService, backendUtilityService, translateService);
    extension = new CellExternalCopyManagerExtension(extensionUtility, sharedService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return null when either the grid object or the grid options is missing', () => {
    const output = extension.register();
    expect(output).toBeNull();
  });

  describe('registered addon', () => {
    beforeEach(() => {
      jest.spyOn(SharedService.prototype, 'slickGrid', 'get').mockReturnValue(gridStub);
      jest.spyOn(SharedService.prototype, 'gridOptions', 'get').mockReturnValue(gridOptionsMock);
      queueCallback = {
        execute: () => { },
        undo: () => { },
        row: 0,
        cell: 0,
        editor: {},
        serializedValue: 'serialize',
        prevSerializedValue: 'previous'
      };
    });

    it('should register the addon', () => {
      const pluginSpy = jest.spyOn(SharedService.prototype.slickGrid, 'registerPlugin');
      const onRegisteredSpy = jest.spyOn(SharedService.prototype.gridOptions.excelCopyBufferOptions as ExcelCopyBufferOption, 'onExtensionRegistered');

      const instance = extension.register() as SlickCellExternalCopyManager;
      const addonInstance = extension.getAddonInstance();

      expect(instance).toBeTruthy();
      expect(instance).toEqual(addonInstance);
      expect(onRegisteredSpy).toHaveBeenCalledWith(instance);
      expect(pluginSpy).toHaveBeenCalledWith(instance);
      expect(mockSelectionModel).toHaveBeenCalled();
      expect(mockAddon).toHaveBeenCalledWith({
        clipboardCommandHandler: expect.anything(),
        dataItemColumnValueExtractor: expect.anything(),
        newRowCreator: expect.anything(),
        includeHeaderWhenCopying: false,
        readOnlyMode: false,
        onCopyCancelled: expect.anything(),
        onCopyCells: expect.anything(),
        onExtensionRegistered: expect.anything(),
        onPasteCells: expect.anything(),
      });
    });

    it('should call internal event handler subscribe and expect the "onCopyCells" option to be called when addon notify is called', () => {
      const handlerSpy = jest.spyOn(extension.eventHandler, 'subscribe');
      const onCopySpy = jest.spyOn(SharedService.prototype.gridOptions.excelCopyBufferOptions as ExcelCopyBufferOption, 'onCopyCells');
      const onCancelSpy = jest.spyOn(SharedService.prototype.gridOptions.excelCopyBufferOptions as ExcelCopyBufferOption, 'onCopyCancelled');
      const onPasteSpy = jest.spyOn(SharedService.prototype.gridOptions.excelCopyBufferOptions as ExcelCopyBufferOption, 'onPasteCells');

      const instance = extension.register() as SlickCellExternalCopyManager;
      instance.onCopyCells.notify(mockSelectRangeEvent, new Slick.EventData(), gridStub);

      expect(handlerSpy).toHaveBeenCalledTimes(3);
      expect(handlerSpy).toHaveBeenCalledWith(
        { notify: expect.anything(), subscribe: expect.anything(), unsubscribe: expect.anything(), },
        expect.anything()
      );
      expect(onCopySpy).toHaveBeenCalledWith(expect.anything(), mockSelectRangeEvent);
      expect(onCancelSpy).not.toHaveBeenCalled();
      expect(onPasteSpy).not.toHaveBeenCalled();
    });

    it('should call internal event handler subscribe and expect the "onCopyCancelled" option to be called when addon notify is called', () => {
      const handlerSpy = jest.spyOn(extension.eventHandler, 'subscribe');
      const onCopySpy = jest.spyOn(SharedService.prototype.gridOptions.excelCopyBufferOptions as ExcelCopyBufferOption, 'onCopyCells');
      const onCancelSpy = jest.spyOn(SharedService.prototype.gridOptions.excelCopyBufferOptions as ExcelCopyBufferOption, 'onCopyCancelled');
      const onPasteSpy = jest.spyOn(SharedService.prototype.gridOptions.excelCopyBufferOptions as ExcelCopyBufferOption, 'onPasteCells');

      const instance = extension.register() as SlickCellExternalCopyManager;
      instance.onCopyCancelled.notify(mockSelectRangeEvent, new Slick.EventData(), gridStub);

      expect(handlerSpy).toHaveBeenCalledTimes(3);
      expect(handlerSpy).toHaveBeenCalledWith(
        { notify: expect.anything(), subscribe: expect.anything(), unsubscribe: expect.anything(), },
        expect.anything()
      );
      expect(onCopySpy).not.toHaveBeenCalled();
      expect(onCancelSpy).toHaveBeenCalledWith(expect.anything(), mockSelectRangeEvent);
      expect(onPasteSpy).not.toHaveBeenCalled();
    });

    it('should call internal event handler subscribe and expect the "onPasteCells" option to be called when addon notify is called', () => {
      const handlerSpy = jest.spyOn(extension.eventHandler, 'subscribe');
      const onCopySpy = jest.spyOn(SharedService.prototype.gridOptions.excelCopyBufferOptions as ExcelCopyBufferOption, 'onCopyCells');
      const onCancelSpy = jest.spyOn(SharedService.prototype.gridOptions.excelCopyBufferOptions as ExcelCopyBufferOption, 'onCopyCancelled');
      const onPasteSpy = jest.spyOn(SharedService.prototype.gridOptions.excelCopyBufferOptions as ExcelCopyBufferOption, 'onPasteCells');

      const instance = extension.register() as SlickCellExternalCopyManager;
      instance.onPasteCells.notify(mockSelectRangeEvent, new Slick.EventData(), gridStub);

      expect(handlerSpy).toHaveBeenCalledTimes(3);
      expect(handlerSpy).toHaveBeenCalledWith(
        { notify: expect.anything(), subscribe: expect.anything(), unsubscribe: expect.anything(), },
        expect.anything()
      );
      expect(onCopySpy).not.toHaveBeenCalled();
      expect(onCancelSpy).not.toHaveBeenCalled();
      expect(onPasteSpy).toHaveBeenCalledWith(expect.anything(), mockSelectRangeEvent);
    });

    it('should dispose of the addon', () => {
      const instance = extension.register() as SlickCellExternalCopyManager;
      const destroySpy = jest.spyOn(instance, 'destroy');

      extension.dispose();

      expect(destroySpy).toHaveBeenCalled();
    });
  });

  describe('createUndoRedo private method', () => {
    it('should create the UndoRedoBuffer', () => {
      extension.register();

      expect(extension.undoRedoBuffer).toEqual({
        queueAndExecuteCommand: expect.anything(),
        undo: expect.anything(),
        redo: expect.anything(),
      });
    });

    it('should have called Edit Command "execute" method after creating the UndoRedoBuffer', () => {
      extension.register();
      const undoRedoBuffer = extension.undoRedoBuffer;

      const spy = jest.spyOn(queueCallback, 'execute');
      undoRedoBuffer.queueAndExecuteCommand(queueCallback);

      expect(spy).toHaveBeenCalled();
    });

    it('should not have called Edit Command "undo" method when there is nothing to undo', () => {
      extension.register();
      const undoRedoBuffer = extension.undoRedoBuffer;

      const spy = jest.spyOn(queueCallback, 'undo');
      undoRedoBuffer.undo();

      expect(spy).not.toHaveBeenCalled();
    });

    it('should have called Edit Command "undo" method after calling it from UndoRedoBuffer', () => {
      extension.register();
      const undoRedoBuffer = extension.undoRedoBuffer;

      const spy = jest.spyOn(queueCallback, 'undo');
      undoRedoBuffer.queueAndExecuteCommand(queueCallback);
      undoRedoBuffer.undo();

      expect(spy).toHaveBeenCalled();
    });

    it('should have called Edit Command "execute" method only at first queueing, the "redo" should not call the "execute" method by itself', () => {
      extension.register();
      const undoRedoBuffer = extension.undoRedoBuffer;

      const spy = jest.spyOn(queueCallback, 'execute');
      undoRedoBuffer.queueAndExecuteCommand(queueCallback);
      undoRedoBuffer.redo();

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('should have called Edit Command "execute" method at first queueing & then inside the "redo" since we did an "undo" just before', () => {
      extension.register();
      const undoRedoBuffer = extension.undoRedoBuffer;

      const spy = jest.spyOn(queueCallback, 'execute');
      undoRedoBuffer.queueAndExecuteCommand(queueCallback);
      undoRedoBuffer.undo();
      undoRedoBuffer.redo();

      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('should have a single entry in the queue buffer after calling "queueAndExecuteCommand" once', () => {
      extension.register();
      extension.undoRedoBuffer.queueAndExecuteCommand(queueCallback);
      expect(extension.commandQueue).toHaveLength(1);
    });

    it('should call a redo when Ctrl+Shift+Z keyboard event occurs', () => {
      extension.register();
      const spy = jest.spyOn(queueCallback, 'execute');

      extension.undoRedoBuffer.queueAndExecuteCommand(queueCallback);
      const body = window.document.body;
      body.dispatchEvent(new (window.window as any).KeyboardEvent('keydown', {
        keyCode: 90,
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true
      }));

      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('should call a undo when Ctrl+Z keyboard event occurs', () => {
      extension.register();
      const spy = jest.spyOn(queueCallback, 'undo');

      extension.undoRedoBuffer.queueAndExecuteCommand(queueCallback);
      const body = window.document.body;
      body.dispatchEvent(new (window.window as any).KeyboardEvent('keydown', {
        keyCode: 90,
        ctrlKey: true,
        shiftKey: false,
        bubbles: true
      }));

      expect(spy).toHaveBeenCalled();
    });
  });

  describe('addonOptions callbacks', () => {
    it('should expect "queueAndExecuteCommand" to be called after calling "clipboardCommandHandler" callback', () => {
      extension.register() as SlickCellExternalCopyManager;
      const spy = jest.spyOn(extension.undoRedoBuffer, 'queueAndExecuteCommand');

      extension.addonOptions!.clipboardCommandHandler!(queueCallback);

      expect(spy).toHaveBeenCalled();
    });

    it('should expect "addItem" method to be called after calling "newRowCreator" callback', () => {
      extension.register();
      const mockGetData = { addItem: jest.fn() };
      const getDataSpy = jest.spyOn(gridStub, 'getData').mockReturnValue(mockGetData);
      const addItemSpy = jest.spyOn(mockGetData, 'addItem');

      extension.addonOptions!.newRowCreator!(2);

      expect(getDataSpy).toHaveBeenCalled();
      expect(addItemSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'newRow_0' }));
      expect(addItemSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'newRow_1' }));
    });

    it('should expect a formatted output after calling "dataItemColumnValueExtractor" callback', () => {
      extension.register();
      const output = extension.addonOptions!.dataItemColumnValueExtractor!({ firstName: 'John', lastName: 'Doe' }, { id: 'firstName', field: 'firstName', exportWithFormatter: true, formatter: Formatters.bold });
      expect(output).toBe('<b>John</b>');
    });

    it('should expect a sanitized formatted and empty output after calling "dataItemColumnValueExtractor" callback', () => {
      gridOptionsMock.textExportOptions = { sanitizeDataExport: true };
      const myBoldFormatter: Formatter = (_row, _cell, value) => value ? { text: `<b>${value}</b>` } : null as any;
      jest.spyOn(SharedService.prototype, 'gridOptions', 'get').mockReturnValue(gridOptionsMock);
      extension.register();

      const output = extension.addonOptions!.dataItemColumnValueExtractor!({ firstName: '<b>John</b>', lastName: null }, { id: 'lastName', field: 'lastName', exportWithFormatter: true, formatter: myBoldFormatter });

      expect(output).toBe('');
    });

    it('should expect a sanitized formatted output after calling "dataItemColumnValueExtractor" callback', () => {
      gridOptionsMock.textExportOptions = { sanitizeDataExport: true };
      jest.spyOn(SharedService.prototype, 'gridOptions', 'get').mockReturnValue(gridOptionsMock);
      extension.register();

      const output = extension.addonOptions!.dataItemColumnValueExtractor!({ firstName: '<b>John</b>', lastName: 'Doe' }, { id: 'firstName', field: 'firstName', exportWithFormatter: true, formatter: Formatters.bold });

      expect(output).toBe('John');
    });

    it('should expect a sanitized formatted output, from a Custom Formatter, after calling "dataItemColumnValueExtractor" callback', () => {
      const myBoldFormatter: Formatter = (_row, _cell, value) => value ? { text: `<b>${value}</b>` } : '';
      gridOptionsMock.textExportOptions = { sanitizeDataExport: true };
      jest.spyOn(SharedService.prototype, 'gridOptions', 'get').mockReturnValue(gridOptionsMock);
      extension.register();

      const output = extension.addonOptions!.dataItemColumnValueExtractor!({ firstName: '<b>John</b>', lastName: 'Doe' }, { id: 'firstName', field: 'firstName', exportWithFormatter: true, formatter: myBoldFormatter });

      expect(output).toBe('John');
    });

    it('should return null when calling "dataItemColumnValueExtractor" callback without editable', () => {
      gridOptionsMock.editable = false;
      jest.spyOn(SharedService.prototype, 'gridOptions', 'get').mockReturnValue(gridOptionsMock);
      extension.register();

      const output = extension.addonOptions!.dataItemColumnValueExtractor!({ firstName: '<b>John</b>', lastName: 'Doe' }, { id: 'firstName', field: 'firstName' });

      expect(output).toBeNull();
    });
  });
});
