/* -*- js-indent-level: 8 -*- */
/*
* Control.Header
*
* Abstract class, basis for ColumnHeader and RowHeader controls.
* Used only in spreadsheets, implements the row/column headers.
*/
/* global $ L */

L.Control.Header = L.Class.extend({

	_initHeaderEntryStyles: function (className) {
		var baseElem = document.getElementsByTagName('body')[0];
		var elem = L.DomUtil.create('div', className, baseElem);
		this._textColor = L.DomUtil.getStyle(elem, 'color');
		this._backgroundColor = L.DomUtil.getStyle(elem, 'background-color');
		var fontFamily = L.DomUtil.getStyle(elem, 'font-family');
		var fontSize = parseInt(L.DomUtil.getStyle(elem, 'font-size'));
		var fontHeight = parseInt(L.DomUtil.getStyle(elem, 'line-height'));
		var rate = fontHeight / fontSize;
		this._font = {
			_hdr: this,
			_baseFontSize: fontSize * this.dpiScale,
			_fontSizeRate: rate,
			_fontFamily: fontFamily,
			getFont: function() {
				// Limit zoomScale to 115%. At 120% the row ids at the bottom eat all
				// horizontal margins and it looks ugly. Beyond 120% the row ids get
				// clipped out visibly.
				var zoomScale = this._hdr.getHeaderZoomScale(
					/* lowerBound */ 0.5, /* upperBound */ 1.15);

				return Math.floor(this._baseFontSize * zoomScale) +
					'px/' +
					this._fontSizeRate +
					' ' +
					this._fontFamily;
			}
		};
		this._borderColor = L.DomUtil.getStyle(elem, 'border-top-color');
		var borderWidth = L.DomUtil.getStyle(elem, 'border-top-width');
		this._borderWidth = Math.round(parseFloat(borderWidth));
		this._cursor = L.DomUtil.getStyle(elem, 'cursor');
		L.DomUtil.remove(elem);
	},

	_initHeaderEntryHoverStyles: function (className) {
		var baseElem = document.getElementsByTagName('body')[0];
		var elem = L.DomUtil.create('div', className, baseElem);
		this._hoverColor = L.DomUtil.getStyle(elem, 'background-color');
		L.DomUtil.remove(elem);
	},

	_initHeaderEntrySelectedStyles: function (className) {
		var baseElem = document.getElementsByTagName('body')[0];
		var elem = L.DomUtil.create('div', className, baseElem);
		this._selectionTextColor = L.DomUtil.getStyle(elem, 'color');

		var selectionBackgroundGradient = [];
		var gradientColors = L.DomUtil.getStyle(elem, 'background-image');
		gradientColors = gradientColors.slice('linear-gradient('.length, -1);
		while (gradientColors) {
			var color = gradientColors.split(',', 3);
			color = color.join(','); // color = 'rgb(r, g, b)'
			selectionBackgroundGradient.push(color);
			gradientColors = gradientColors.substr(color.length); // remove last parsed color
			gradientColors = gradientColors.substr(gradientColors.indexOf('r')); // remove ', ' stuff
		}

		if (selectionBackgroundGradient.length) {
			this._selectionBackgroundGradient = selectionBackgroundGradient;
		}
		L.DomUtil.remove(elem);
	},

	_initHeaderEntryResizeStyles: function (className) {
		if (this.options.cursor) {
			this._resizeCursor = this.options.cursor;
		}
		else {
			var baseElem = document.getElementsByTagName('body')[0];
			var elem = L.DomUtil.create('div', className, baseElem);
			this._resizeCursor = L.DomUtil.getStyle(elem, 'cursor');
			L.DomUtil.remove(elem);
		}
	},

	select: function (entry, isCurrent) {
		this.drawHeaderEntry(entry, /*isOver=*/false, /*isHighlighted=*/true, isCurrent);
	},

	unselect: function (entry) {
		this.drawHeaderEntry(entry, /*isOver=*/false, /*isHighlighted=*/false, false);
	},

	isHeaderSelected: function (index) {
		return index === this._current;
	},

	isHighlighted: function (index) {
		if (this._selection.start === -1 && this._selection.end === -1) {
			return index === this._current;
		}
		return (this._selection.start <= index && index <= this._selection.end);
	},

	clearSelection: function () {
		if (this._selection.start === -1 && this._selection.end === -1)
			return;
		var start = (this._selection.start < 1) ? 0 : this._selection.start;
		var end = this._headerInfo.getNextIndex(this._selection.end);

		for (var i = start; i < end; i = this._headerInfo.getNextIndex(i)) {
			if (i === this._current) {
				// after clearing selection, we need to select the header entry for the current cursor position,
				// since we can't be sure that the selection clearing is due to click on a cell
				// different from the one where the cursor is already placed
				this.select(this._headerInfo.getElementData(i), true);
			} else {
				this.unselect(this._headerInfo.getElementData(i));
			}
		}

		this._selection.start = this._selection.end = -1;
	},

	// Sets the internal this._selection values accordingly, unselects the previous set of rows/cols and
	// selects the new set of rows/cols.
	// Start and end are given in pixels absolute to the document
	updateSelection: function(start, end) {
		if (!this._headerInfo)
			return;

		start = this._headerInfo.docToHeaderPos(start);
		end = this._headerInfo.docToHeaderPos(end);

		var x0 = 0, x1 = 0;
		var itStart = -1, itEnd = -1;

		// if the start selection position is above/on the left of the first header entry,
		// but the end selection position is below/on the right of it
		// then we set the start selected entry to the first header entry.
		var entry = this._headerInfo.getElementData(this._headerInfo.getMinIndex());
		if (entry) {
			x0 = entry.pos - entry.size;
			if (start < x0 && end > x0) {
				itStart = 0;
			}
		}

		this._headerInfo.forEachElement((function(entry) {
			x0 = entry.pos - entry.size;
			x1 = entry.pos;
			if (start < x1 && end > x0) {
				this.select(entry, false);
				if (itStart === -1) {
					itStart = entry.index;
				}
			} else {
				this.unselect(entry);
				if (itStart !== -1 && itEnd === -1) {
					itEnd = this._headerInfo.getPreviousIndex(entry.index);
				}
			}
		}).bind(this));

		// if end is greater than the last fetched header position set itEnd to the max possible value
		// without this hack selecting a whole row and then a whole column (or viceversa) leads to an incorrect selection
		if (itStart !== -1 && itEnd === -1) {
			itEnd = this._headerInfo.getMaxIndex();
		}

		this._selection.start = itStart;
		this._selection.end = itEnd;
	},


	// Called whenever the cell cursor is in a cell corresponding to the cursorPos-th
	// column/row.
	updateCurrent: function (cursorPos, slim) {
		if (!this._headerInfo) {return;}

		if (cursorPos < 0) {
			this.unselect(this._headerInfo.getElementData(this._current));
			this._current = -1;
			return;
		}

		var prevEntry = cursorPos > 0 ? this._headerInfo.getPreviousIndex(cursorPos) : null;
		var zeroSizeEntry = slim && prevEntry && prevEntry.size === 0;

		var entry = this._headerInfo.getElementData(cursorPos);
		if (this._selection.start === -1 && this._selection.end === -1) {
			// when a whole row (column) is selected the cell cursor is moved to the first column (row)
			// but this action should not cause to select/unselect anything, on the contrary we end up
			// with all column (row) header entries selected but the one where the cell cursor was
			// previously placed
			this.unselect(this._headerInfo.getElementData(this._current));
			// no selection when the cell cursor is slim
			if (entry && !zeroSizeEntry)
				this.select(entry, true);
		}
		this._current = entry && !zeroSizeEntry ? entry.index : -1;
	},

	optimalHeight: function(index) {
		if (!this.isHighlighted(index)) {
			this._selectRow(index, 0);
		}
		this._map.sendUnoCommand('.uno:SetOptimalRowHeight');
	},

	insertRowAbove: function(index) {
		// First select the corresponding row because
		// .uno:InsertRows doesn't accept any row number
		// as argument and just inserts before the selected row
		if (!this.isHighlighted(index)) {
			this._selectRow(index, 0);
		}
		this._map.sendUnoCommand('.uno:InsertRows');
	},

	insertRowBelow: function(index) {
		if (!this.isHighlighted(index)) {
			this._selectRow(index, 0);
		}
		this._map.sendUnoCommand('.uno:InsertRowsAfter');
	},

	deleteRow: function(index) {
		if (!this.isHighlighted(index)) {
			this._selectRow(index, 0);
		}
		this._map.sendUnoCommand('.uno:DeleteRows');
	},

	hideRow: function(index) {
		if (!this.isHighlighted(index)) {
			this._selectRow(index, 0);
		}
		this._map.sendUnoCommand('.uno:HideRow');
	},

	showRow: function(index) {
		if (!this.isHighlighted(index)) {
			this._selectRow(index, 0);
		}
		this._map.sendUnoCommand('.uno:ShowRow');
	},

	_onUpdateCurrentRow: function (e) {
		var y = e.curY - 1; // 1-based to 0-based.
		var h = this._twipsToPixels(e.height);
		var slim = h <= 1;
		this.updateCurrent(y, slim);
	},

	fillRows: function (rows, rowGroups, converter, context) {
		if (rows && rows.length < 2)
			return;

		// Reset state
		this._current = -1;
		this._selection.start = this._selection.end = -1;
		this._mouseOverEntry = null;
		if (!window.contextMenuWizard) {
			this._lastMouseOverIndex = undefined;
		}

		var sheetGeometry = this._map._docLayer.sheetGeometry;

		// setup conversion routine
		this.converter = L.Util.bind(converter, context);

		// create group array
		this._groupLevels = rows ? parseInt(rows[0].groupLevels) :
			sheetGeometry.getRowGroupLevels();
		this._groups = this._groupLevels ? new Array(this._groupLevels) : null;

		// collect group controls data
		if (rowGroups !== undefined && this._groups) {
			this._collectGroupsData(rowGroups);
		}
		else if (sheetGeometry) {
			this._collectGroupsData(sheetGeometry.getRowGroupsDataInView());
		}

		if (this._groups) {
			this.resize(this._computeOutlineWidth() + this._borderWidth + this._headerWidth);
		}
		else {
			this.resize(this._headerWidth);
		}

		this.containerObject.requestReDraw();

		if ($('.spreadsheet-header-rows').length > 0) {
			$('.spreadsheet-header-rows').contextMenu(this._map.isPermissionEdit());
		}
	},

	_selectRow: function(row, modifier) {
		var command = {
			Row: {
				type: 'long',
				value: row
			},
			Modifier: {
				type: 'unsigned short',
				value: modifier
			}
		};

		this._map.sendUnoCommand('.uno:SelectRow ', command);
	},

	_insertRowAbove: function() {
		var index = this._lastMouseOverIndex;
		if (index) {
			this.insertRowAbove.call(this, index);
		}
	},

	_insertRowBelow: function() {
		var index = this._lastMouseOverIndex;
		if (index) {
			this.insertRowBelow.call(this, index);
		}
	},

	_deleteSelectedRow: function() {
		var index = this._lastMouseOverIndex;
		if (index) {
			this.deleteRow.call(this, index);
		}
	},

	_optimalHeight: function() {
		var index = this._lastMouseOverIndex;
		if (index) {
			this.optimalHeight.call(this, index);
		}
	},

	_hideRow: function() {
		var index = this._lastMouseOverIndex;
		if (index) {
			this.hideRow.call(this, index);
		}
	},

	_showRow: function() {
		var index = this._lastMouseOverIndex;
		if (index) {
			this.showRow.call(this, index);
		}
	},

	_getHorzLatLng: function (start, offset, e) {
		var size = this._map.getSize();
		var drag = this._map.mouseEventToContainerPoint(e);
		var entryStart = (this._dragEntry.pos - this._dragEntry.size) / this._dpiScale;
		var ypos = Math.max(drag.y, entryStart);
		return [
			this._map.unproject(new L.Point(0, ypos)),
			this._map.unproject(new L.Point(size.x, ypos)),
		];
	},

	optimalWidth: function(index) {
		if (!this.isHighlighted(index)) {
			this._selectColumn(index, 0);
		}
		this._map.sendUnoCommand('.uno:SetOptimalColumnWidth');
	},

	insertColumnBefore: function(index) {
		// First select the corresponding column because
		// .uno:InsertColumn doesn't accept any column number
		// as argument and just inserts before the selected column
		if (!this.isHighlighted(index)) {
			this._selectColumn(index, 0);
		}
		this._map.sendUnoCommand('.uno:InsertColumns');
		this._updateColumnHeader();
	},

	insertColumnAfter: function(index) {
		if (!this.isHighlighted(index)) {
			this._selectColumn(index, 0);
		}
		this._map.sendUnoCommand('.uno:InsertColumnsAfter');
		this._updateColumnHeader();
	},

	deleteColumn: function(index) {
		if (!this.isHighlighted(index)) {
			this._selectColumn(index, 0);
		}
		this._map.sendUnoCommand('.uno:DeleteColumns');
		this._updateColumnHeader();
	},

	hideColumn: function(index) {
		if (!this.isHighlighted(index)) {
			this._selectColumn(index, 0);
		}
		this._map.sendUnoCommand('.uno:HideColumn');
		this._updateColumnHeader();
	},

	showColumn: function(index) {
		if (!this.isHighlighted(index)) {
			this._selectColumn(index, 0);
		}
		this._map.sendUnoCommand('.uno:ShowColumn');
		this._updateColumnHeader();
	},

	_onUpdateCurrentColumn: function (e) {
		var x = e.curX - 1; // 1-based to 0-based.
		var w = this._twipsToPixels(e.width);
		var slim = w <= 1;
		this.updateCurrent(x, slim);
	},

	_updateColumnHeader: function () {
		this._map._docLayer.refreshViewData({x: this._map._getTopLeftPoint().x, y: 0, offset: {x: undefined, y: 0}});
	},

	fillColumns: function (columns, colGroups, converter, context) {
		if (columns && columns.length < 2)
			return;

		// Reset state
		this._current = -1;
		this._selection.start = this._selection.end = -1;
		this._mouseOverEntry = null;
		if (!window.contextMenuWizard) {
			this._lastMouseOverIndex = undefined;
		}

		var sheetGeometry = this._map._docLayer.sheetGeometry;

		// setup conversion routine
		this.converter = L.Util.bind(converter, context);

		// create group array
		this._groupLevels = columns ? parseInt(columns[0].groupLevels):
			sheetGeometry.getColumnGroupLevels();
		this._groups = this._groupLevels ? new Array(this._groupLevels) : null;

		// collect group controls data
		if (colGroups !== undefined && this._groups) {
			this._collectGroupsData(colGroups);
		}
		else if (sheetGeometry) {
			this._collectGroupsData(sheetGeometry.getColumnGroupsDataInView());
		}

		if (this._groups) {
			this.resize(this._computeOutlineWidth() + this._borderWidth + this._headerHeight);
		}
		else {
			this.resize(this._headerHeight);
		}

		this.containerObject.requestReDraw();

		if ($('.spreadsheet-header-columns').length > 0) {
			$('.spreadsheet-header-columns').contextMenu(this._map.isPermissionEdit());
		}
	},

	_colIndexToAlpha: function(columnNumber) {
		var offset = 'A'.charCodeAt();
		var dividend = columnNumber;
		var columnName = '';
		var modulo;

		while (dividend > 0) {
			modulo = (dividend - 1) % 26;
			columnName = String.fromCharCode(offset + modulo) + columnName;
			dividend = Math.floor((dividend - modulo) / 26);
		}

		return columnName;
	},

	_selectColumn: function(colNumber, modifier) {
		var command = {
			Col: {
				type: 'unsigned short',
				value: colNumber
			},
			Modifier: {
				type: 'unsigned short',
				value: modifier
			}
		};

		this._map.sendUnoCommand('.uno:SelectColumn ', command);
	},

	_getVertLatLng: function (start, offset, e) {
		var size = this._map.getSize();
		var drag = this._map.mouseEventToContainerPoint(e);
		var entryStart = (this._dragEntry.pos - this._dragEntry.size) / this._dpiScale;
		var xpos = Math.max(drag.x, entryStart);
		return [
			this._map.unproject(new L.Point(xpos, 0)),
			this._map.unproject(new L.Point(xpos, size.y)),
		];
	},

	_insertColBefore: function() {
		var index = this._lastMouseOverIndex;
		if (index) {
			this.insertColumnBefore.call(this, index);
		}
	},

	_insertColAfter: function() {
		var index = this._lastMouseOverIndex;
		if (index) {
			this.insertColumnAfter.call(this, index);
		}
	},

	_deleteSelectedCol: function() {
		var index = this._lastMouseOverIndex;
		if (index) {
			this.deleteColumn.call(this, index);
		}
	},

	_optimalWidth: function() {
		var index = this._lastMouseOverIndex;
		if (index) {
			this.optimalWidth.call(this, index);
		}
	},

	_hideColumn: function() {
		var index = this._lastMouseOverIndex;
		if (index) {
			this.hideColumn.call(this, index);
		}
	},

	_showColumn: function() {
		var index = this._lastMouseOverIndex;
		if (index) {
			this.showColumn.call(this, index);
		}
	},

	_entryAtPoint: function(point) {
		if (!this._headerInfo)
			return false;

		var position = this._headerInfo._isCol ? point[0]: point[1];

		var that = this;
		var result = null;
		this._headerInfo.forEachElement(function(entry) {
			var end = entry.pos;
			var start = end - entry.size;
			if (position >= start && position < end) {
				var resizeAreaStart = Math.max(start, end - 3 * this.dpiScale);
				if (that.isHeaderSelected(entry.index) || window.mode.isMobile()) {
					resizeAreaStart = end - that._resizeHandleSize;
				}
				var isMouseOverResizeArea = (position > resizeAreaStart);
				result = {entry: entry, hit: isMouseOverResizeArea};
				return true;
			}
		});
		return result;
	},

	onMouseEnter: function () {

	},

	onMouseLeave: function (point, e) {
		if (point === null) { // This means that the mouse pointer is outside the canvas.
			if (this._overHeaderArea && this.containerObject.draggingSomething && this._dragEntry) { // Were we resizing a row / column before mouse left.
				this._onDragEnd(this.containerObject.dragDistance);
			}
		}
		if (this._hitOutline(point, e))
			return;

		this._onHeaderMouseOut(e);
	},

	_onHeaderMouseOut: function () {
		if (!this._overHeaderArea)
			return;
		this._overHeaderArea = false;
		this._unBindContextMenu();

		if (this._mouseOverEntry) {
			var mouseOverIsCurrent = (this._mouseOverEntry.index == this._current);
			this.drawHeaderEntry(this._mouseOverEntry, /*isOver: */ false, null, mouseOverIsCurrent);
			this._mouseOverEntry = null;
		}
		this._hitResizeArea = false;
		L.DomUtil.setStyle(this.containerObject.canvas, 'cursor', 'default');
	},

	onContextMenu: function () {

	},

	_bindContextMenu: function () {
		var that = this;
		$(function() {
			$.contextMenu({
				selector: '#document-canvas',
				className: 'loleaflet-font',
				items: that._menuItem,
				zIndex: 10
			});
		});
	},

	_unBindContextMenu: function () {
		$('#document-canvas').off('contextmenu');
	},

	onMouseMove: function (point, dragDistance) {
		if (this._hitOutline(point)) { // There is no special event when mouse is over row || column groups. So we return.
			this._onHeaderMouseOut();
			return false;
		}

		if (!this.containerObject.draggingSomething) { // If we are not dragging anything.
			if (!this._overHeaderArea) { // If mouse was over row || column groups previously, we set cursor to pointer again.
				L.DomUtil.setStyle(this.containerObject.canvas, 'cursor', this._cursor);
				this._overHeaderArea = true;
				this._bindContextMenu();
			}

			var result = this._entryAtPoint(point); // Data related to current entry that the mouse is over now.

			// If mouse was over another entry previously, we draw that again (without mouse-over effect).
			if (this._mouseOverEntry && (!result || result.entry.index !== this._mouseOverEntry.index)) {
				this.drawHeaderEntry(this._mouseOverEntry, false, null, (this._mouseOverEntry.index === this._current));
			}

			var isMouseOverResizeArea = false;

			if (result) { // Is mouse over an entry.
				this._mouseOverEntry = result.entry;
				this._lastMouseOverIndex = this._mouseOverEntry.index; // used by context menu
				this.drawHeaderEntry(result.entry, true, null, result.entry.index === this._current);
				isMouseOverResizeArea = result.hit;
			}

			// cypress mobile emulation sometimes triggers resizing unintentionally.
			if (L.Browser.cypressTest)
				return false;

			if (isMouseOverResizeArea !== this._hitResizeArea) { // Do we need to change cursor (to resize or pointer).
				var cursor = isMouseOverResizeArea ? this._resizeCursor : this._cursor;
				L.DomUtil.setStyle(this.containerObject.canvas, 'cursor', cursor);
				this._hitResizeArea = isMouseOverResizeArea;
			}
		}
		else { // We are in dragging mode.
			this.containerObject.requestReDraw(); // Remove previously drawn line.
			var x = this._isColumn ? (this._dragEntry.pos - this.documentTopLeft[0] + dragDistance[0]): this.size[0];
			var y = this._isColumn ? this.size[1]: (this._dragEntry.pos - this.documentTopLeft[1] + dragDistance[1]);

			this.context.lineWidth = this.dpiScale;
			this.context.strokeStyle = 'darkblue';
			this.context.beginPath();
			this.context.moveTo(x, y);
			this.context.lineTo(this._isColumn ? x: this.containerObject.right, this._isColumn ? this.containerObject.bottom: y);
			this.context.stroke();
		}
	},

	_onOutlineMouseEvent: function (point, eventHandler, e) {
		// check if the group controls area has been hit
		if (!this._hitOutline(point))
			return false;

		var level = this._getGroupLevel(this._isColumn ? point[1]: point[0]);
		if (level < 0 || level >= this._groups.length)
			return true;

		// when 2 collapsed group controls overlaps completely,
		// clicking on the control should expand the lower/rightmost group
		var groups = this._groups[level];
		var indexes = Object.keys(groups);
		var len = indexes.length;
		for (var i = len - 1; i >= 0; --i) {
			e.group = groups[indexes[i]];
			if (eventHandler.call(this, e, point))
				break;
		}

		return true;
	},

	_onGroupControlClick: function (e) {
		var group = e.group;
		if (!group)
			return false;

		var pos = this._headerInfo.headerToDocPos(
			this._getParallelPos(this._mouseEventToCanvasPos(this._canvas, e)));
		if (group.startPos < pos && pos < group.startPos + this._groupHeadSize) {
			this._updateOutlineState(/*isColumnOutline: */ this._isColumn, group);
			return true;
		}
		return false;
	},

	onDoubleClick: function (point) {
		var handled = this._onOutlineMouseEvent(point, this._onGroupControlDoubleClick);
		if (!handled)
			this._isColumn ? this._optimalWidth(): this.setOptimalHeightAuto();
	},

	_onGroupControlDoubleClick: function (e, point) {
		var group = e.group;
		if (!group && !group.hidden)
			return false;

		var pos = this._headerInfo.headerToDocPos(this._isColumn ? point[1]: point[0]);
		if (group.startPos + this._groupHeadSize < pos && pos < group.endPos) {
			this._updateOutlineState(/*isColumnOutline: */ this._isColumn, group);
			return true;
		}
		return false;
	},

	_updateOutlineState: function (column, group) {
		if (!group)
			return;

		var type = column ? 'column' : 'row';
		var state = group.hidden ? 'visible' : 'hidden'; // we have to send the new state
		var payload = 'outlinestate type='+ type + ' level=' + group.level + ' index=' + group.index + ' state=' + state;
		this._map._socket.sendMessage(payload);
	},

	onMouseDown: function (point) {
		if (this._hitOutline(point))
			return;

		this.onMouseMove(point);

		if (!this._hitResizeArea) {
			this._dragEntry = null;
			return;
		}

		L.DomUtil.disableImageDrag();
		L.DomUtil.disableTextSelection();

		// When code is here, this._mouseOverEntry should never be null.

		this._dragEntry = { // In case dragging takes place, we will remember this entry.
			index: this._mouseOverEntry.index,
			origsize: this._mouseOverEntry.origsize,
			pos: this._mouseOverEntry.pos,
			size: this._mouseOverEntry.size
		};
	},

	_onMouseMoveForDragging: function (e) {
		this._dragging = true;
		L.DomEvent.preventDefault(e);

		this.onDragMove(this._item, this._start, this._offset, e);
	},

	_resetClickCount: function () {
		this._clicks = 0;
	},

	onMouseUp: function () {
		L.DomUtil.enableImageDrag();
		L.DomUtil.enableTextSelection();

		if (this.containerObject.draggingSomething && this._dragEntry) {
			this.onDragEnd(this.containerObject.dragDistance);
			this._dragEntry = null;
		}
	},

	_twipsToPixels: function (twips) {
		if (!this.converter)
			return 0;
		var point = new L.Point(twips, twips);
		return Math.round(this._getParallelPos(this.converter(point)));
	},

	_setCanvasSizeImpl: function (container, canvas, property, value, isCorner) {
		if (!value) {
			value = parseInt(L.DomUtil.getStyle(container, property));
		}
		else {
			L.DomUtil.setStyle(container, property, value + 'px');
		}

		if (property === 'width') {
			canvas.width = Math.floor(value * this.dpiScale);
			if (!isCorner)
				this._canvasWidth = value * this.dpiScale;
			// console.log('Header._setCanvasSizeImpl: _canvasWidth' + this._canvasWidth);
		}
		else if (property === 'height') {
			canvas.height = Math.floor(value * this.dpiScale);
			if (!isCorner)
				this._canvasHeight = value * this.dpiScale;
			// console.log('Header._setCanvasSizeImpl: _canvasHeight' + this._canvasHeight);
		}
	},

	_setCanvasWidth: function (width) {
		this._setCanvasSizeImpl(this._headerContainer, this._canvas, 'width', width, /*isCorner: */ false);
	},

	_setCanvasHeight: function (height) {
		this._setCanvasSizeImpl(this._headerContainer, this._canvas, 'height', height, /*isCorner: */ false);
	},

	_setCornerCanvasWidth: function (width) {
		this._setCanvasSizeImpl(this._cornerHeaderContainer, this._cornerCanvas, 'width', width, /*isCorner: */ true);
	},

	_setCornerCanvasHeight: function (height) {
		this._setCanvasSizeImpl(this._cornerHeaderContainer, this._cornerCanvas, 'height', height, /*isCorner: */ true);
	},

	_hitOutline: function (point) {
		if (point !== null)
			return (this._isColumn ? point[1]: point[0]) <= this.getOutlineWidth();
		else
			return false;
	},

	_getGroupLevel: function (pos) {
		var levels = this._groups.length;
		var size = this._levelSpacing + this._groupHeadSize;

		var level = (pos + 1) / size | 0;
		var relPos = pos % size;

		if (level <= levels && relPos > this._levelSpacing) {
			return level;
		}
		else {
			return -1;
		}
	},

	_computeOutlineWidth: function () {
		return this._levelSpacing + (this._groupHeadSize + this._levelSpacing) * (this._groups.length + 1);
	},

	getOutlineWidth: function () {
		if (this._isColumn)
			return this.size[1] - this._borderWidth - this._headerHeight;
		else
			return this.size[0] - this._borderWidth - this._headerWidth;
	},

	_collectGroupsData: function(groups) {
		var level, groupEntry;

		var lastGroupIndex = new Array(groups.length);
		var firstChildGroupIndex = new Array(groups.length);
		var lastLevel = -1;
		for (var i = 0; i < groups.length; ++i) {
			// a new group start
			var groupData = groups[i];
			level = parseInt(groupData.level) - 1;
			if (!this._groups[level]) {
				this._groups[level] = {};
			}
			var startPos = parseInt(groupData.startPos) / this._map._docLayer._tilePixelScale;
			var endPos = parseInt(groupData.endPos) / this._map._docLayer._tilePixelScale;
			var isHidden = !!parseInt(groupData.hidden);
			if (isHidden || startPos === endPos) {
				startPos -= this._groupHeadSize / 2;
				endPos = startPos + this._groupHeadSize;
			}
			else {
				var moved = false;
				// if the first child is collapsed the parent head has to be top-aligned with the child
				if (level < lastLevel && firstChildGroupIndex[lastLevel] !== undefined) {
					var childGroupEntry = this._groups[lastLevel][firstChildGroupIndex[lastLevel]];
					if (childGroupEntry.hidden) {
						if (startPos > childGroupEntry.startPos && startPos < childGroupEntry.endPos) {
							startPos = childGroupEntry.startPos;
							moved = true;
						}
					}
				}
				// if 2 groups belonging to the same level are contiguous and the first group is collapsed,
				// the second one has to be shifted as much as possible in order to avoiding overlapping.
				if (!moved && lastGroupIndex[level] !== undefined) {
					var prevGroupEntry = this._groups[level][lastGroupIndex[level]];
					if (prevGroupEntry.hidden) {
						if (startPos > prevGroupEntry.startPos && startPos < prevGroupEntry.endPos) {
							startPos = prevGroupEntry.endPos;
						}
					}
				}
			}
			groupEntry = {
				level: level,
				index: groupData.index,
				startPos: startPos,
				endPos: endPos,
				hidden: isHidden
			};
			this._groups[level][groupData.index] = groupEntry;
			lastGroupIndex[level] = groupData.index;
			if (level > lastLevel) {
				firstChildGroupIndex[level] = groupData.index;
				lastLevel = level;
			}
			else if (level === lastLevel) {
				firstChildGroupIndex[level + 1] = undefined;
			}
		}
	},

	drawCornerHeader: function() {
		var ctx = this._cornerCanvasContext;

		if (!this._groups)
			return;

		ctx.fillStyle = this._borderColor;
		if (this._isColumn) {
			var startY = this._cornerCanvas.height - (L.Control.Header.colHeaderHeight + this._borderWidth);
			if (startY > 0)
				ctx.fillRect(0, startY, this._cornerCanvas.width, this._borderWidth);
		}
		else {
			var startX = this._cornerCanvas.width - (L.Control.Header.rowHeaderWidth + this._borderWidth);
			if (startX > 0)
				ctx.fillRect(startX, 0, this._borderWidth, this._cornerCanvas.height);
		}

		var levels = this._groups.length + 1;
		for (var i = 0; i < levels; ++i) {
			this.drawLevelHeader(i);
		}
	},

	drawOutline: function() {
		if (this._groups) {
			for (var itLevel = 0; itLevel < this._groups.length; ++itLevel) {
				for (var groupIndex in this._groups[itLevel]) {
					if (Object.prototype.hasOwnProperty.call(this._groups[itLevel], groupIndex))
						this.drawGroupControl(this._groups[itLevel][groupIndex]);
				}
			}
		}
	},

	getHeaderZoomScale : function(lowerBound, upperBound) {
		if (typeof lowerBound === 'undefined' || lowerBound < 0)
			lowerBound = 0.5;
		if (typeof upperBound === 'undefined' || upperBound < 0)
			upperBound = 2.0;
		if (lowerBound > upperBound) {
			lowerBound = 0.5;
			upperBound = 2.0;
		}
		var zoomScale = this._map.getZoomScale(this._map.getZoom(),
			this._map.options.defaultZoom);
		return Math.min(Math.max(zoomScale, lowerBound), upperBound);
	},

	onNewDocumentTopLeft: function () {
		this._updateCanvas();
	},

	onDragMove: function () {},
	onDragEnd: function () {},
	getHeaderEntryBoundingClientRect: function () {},
	drawHeaderEntry: function () {},
	drawGroupControl: function () {},
	_getParallelPos: function () {},
	_getOrthogonalPos: function () {}

});

L.Control.Header.rowHeaderWidth = undefined;
L.Control.Header.colHeaderHeight = undefined;

L.Control.Header.HeaderInfo = L.Class.extend({

	initialize: function (map, _isColumn) {
		console.assert(map && _isColumn !== undefined, 'map and isCol required');
		this._map = map;
		this._isColumn = _isColumn;
		this._dpiScale = L.Util.getDpiScaleFactor(true);
		console.assert(this._map._docLayer.sheetGeometry, 'no sheet geometry data-structure found!');
		var sheetGeom = this._map._docLayer.sheetGeometry;
		this._dimGeom = this._isColumn ? sheetGeom.getColumnsGeometry() : sheetGeom.getRowsGeometry();
		this.update();
	},

	update: function () {
		var bounds = this._map.getPixelBoundsCore();
		var startPx = this._isColumn ? bounds.getTopLeft().x : bounds.getTopLeft().y;
		this._docVisStart = startPx;
		var endPx = this._isColumn ? bounds.getBottomRight().x : bounds.getBottomRight().y;
		var startIdx = this._dimGeom.getIndexFromPos(startPx, 'corepixels');
		var endIdx = this._dimGeom.getIndexFromPos(endPx - 1, 'corepixels');
		this._elements = [];

		var splitPosContext = this._map.getSplitPanesContext();

		this._hasSplits = false;
		this._splitIndex = 0;
		var splitPos = 0;

		if (splitPosContext) {

			splitPos = (this._isColumn ? splitPosContext.getSplitPos().x : splitPosContext.getSplitPos().y) * this._dpiScale;
			var splitIndex = this._dimGeom.getIndexFromPos(splitPos + 1, 'corepixels');

			if (splitIndex) {
				// Make sure splitPos is aligned to the cell boundary.
				splitPos = this._dimGeom.getElementData(splitIndex).startpos;
				this._splitPos = splitPos;
				this._dimGeom.forEachInRange(0, splitIndex - 1,
					function (idx, data) {
						this._elements[idx] = {
							index: idx,
							pos: data.startpos + data.size, // end position on the header canvas
							size: data.size,
							origsize: data.size,
						};
					}.bind(this)
				);

				this._hasSplits = true;
				this._splitIndex = splitIndex;

				var freeStartPos = startPx + splitPos + 1;
				var freeStartIndex = this._dimGeom.getIndexFromPos(freeStartPos + 1, 'corepixels');

				startIdx = freeStartIndex;
			}
		}

		// first free index
		var dataFirstFree = this._dimGeom.getElementData(startIdx);
		var firstFreeEnd = dataFirstFree.startpos + dataFirstFree.size - startPx;
		var firstFreeStart = splitPos;
		var firstFreeSize = Math.max(0, firstFreeEnd - firstFreeStart);
		this._elements[startIdx] = {
			index: startIdx,
			pos: firstFreeEnd, // end position on the header canvas
			size: firstFreeSize,
			origsize: dataFirstFree.size,
		};

		this._dimGeom.forEachInRange(startIdx + 1,
			endIdx, function (idx, data) {
				var startpos = data.startpos - startPx;
				var endpos = startpos + data.size;
				var size = endpos - startpos;
				this._elements[idx] = {
					index: idx,
					pos: endpos, // end position on the header canvas
					size: size,
					origsize: size,
				};
			}.bind(this));

		this._startIndex = startIdx;
		this._endIndex = endIdx;
	},

	docToHeaderPos: function (docPos) {

		if (!this._hasSplits) {
			return docPos - this._docVisStart;
		}

		if (docPos <= this._splitPos) {
			return docPos;
		}

		// max here is to prevent encroachment of the fixed pane-area.
		return Math.max(docPos - this._docVisStart, this._splitPos);
	},

	headerToDocPos: function (hdrPos) {
		if (!this._hasSplits) {
			return hdrPos + this._docVisStart;
		}

		if (hdrPos <= this._splitPos) {
			return hdrPos;
		}

		return hdrPos + this._docVisStart;
	},

	isZeroSize: function (i) {
		var elem = this._elements[i];
		console.assert(elem, 'queried a non existent row/col in the header : ' + i);
		return elem.size === 0;
	},

	getMinIndex: function () {
		return this._hasSplits ? 0 : this._startIndex;
	},

	getMaxIndex: function () {
		return this._endIndex;
	},

	getElementData: function (index) {
		return this._elements[index];
	},

	getRowData: function (index) {
		console.assert(!this._isColumn, 'this is a column header instance!');
		return this.getElementData(index);
	},

	getColData: function (index) {
		console.assert(this._isColumn, 'this is a row header instance!');
		return this.getElementData(index);
	},

	getPreviousIndex: function (index) {

		var prevIndex;
		if (this._splitIndex && index === this._startIndex) {
			prevIndex = this._splitIndex - 1;
		}
		else {
			prevIndex = index - 1;
		}

		return prevIndex;
	},

	getNextIndex: function (index) {

		var nextIndex;
		if (this._splitIndex && index === (this._splitIndex - 1)) {
			nextIndex = this._startIndex;
		}
		else {
			nextIndex = index + 1;
		}

		return nextIndex;
	},

	forEachElement: function (callback) {
		var idx;
		if (this._hasSplits) {
			for (idx = 0; idx < this._splitIndex; ++idx) {
				console.assert(this._elements[idx], 'forEachElement failed');
				if (callback(this._elements[idx])) {
					return;
				}
			}
		}
		for (idx = this._startIndex; idx <= this._endIndex; ++idx) {
			console.assert(this._elements[idx], 'forEachElement failed');
			if (callback(this._elements[idx])) {
				return;
			}
		}
	},

});
