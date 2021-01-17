/* -*- js-indent-level: 8 -*- */
/*
 * L.Control.RowHeader
*/

/* global $ _UNO */
L.Control.RowHeader = L.Control.Header.extend({
	name: 'row header',
	anchor: ['top', 'left'],
	position: [0, 250 * window.devicePixelRatio], // Set its initial position to somewhere blank. Other sections shouldn't cover this point after initializing.
	size: [48 * window.devicePixelRatio, 0], // No initial height is necessary.
	expand: ['top', 'bottom'], // Expand vertically.
	processingOrder: 2,
	drawingOrder: 9,
	zIndex: 5,
	interactable: true,
	sectionProperties: {},
	_headerWidth: 48 * window.devicePixelRatio, // This value is static.

	options: {
		cursor: 'row-resize'
	},

	onInitialize: function () {
		this._map = L.Map.THIS;

		this._isColumn = false;
		this.converter = null;
		this._current = -1;
		this._resizeHandleSize = 15 * this.dpiScale;
		this._selection = {start: -1, end: -1};
		this._mouseOverEntry = null;
		this._lastMouseOverIndex = undefined;
		this._hitResizeArea = false;
		this._overHeaderArea = false;

		this._selectionBackgroundGradient = [ '#3465A4', '#729FCF', '#004586' ];

		this._groups = null;

		// group control styles
		this._groupHeadSize = 12;
		this._levelSpacing = 1;

		this._map.on('updatepermission', this._onUpdatePermission, this);
		this._map.on('move zoomchanged sheetgeometrychanged splitposchanged', this._updateCanvas, this);
		this._map.on('viewrowcolumnheaders', this.viewRowColumnHeaders, this);
		this._map.on('updateselectionheader', this._onUpdateSelection, this);
		this._map.on('clearselectionheader', this._onClearSelection, this);
		this._map.on('updatecurrentheader', this._onUpdateCurrentRow, this);
		this._map.on('updatecornerheader', this.drawCornerHeader, this);
		this._map.on('cornerheaderclicked', this._onCornerHeaderClick, this);

		this._menuItem = {
			'.uno:InsertRowsBefore': {
				name: _UNO('.uno:InsertRowsBefore', 'spreadsheet', true),
				callback: (this._insertRowAbove).bind(this)
			},
			'.uno:InsertRowsAfter': {
				name: _UNO('.uno:InsertRowsAfter', 'spreadsheet', true),
				callback: (this._insertRowBelow).bind(this)
			},
			'.uno:DeleteRows': {
				name: _UNO('.uno:DeleteRows', 'spreadsheet', true),
				callback: (this._deleteSelectedRow).bind(this)
			},
			'.uno:SetOptimalRowHeight': {
				name: _UNO('.uno:SetOptimalRowHeight', 'spreadsheet', true),
				callback: (this._optimalHeight).bind(this)
			},
			'.uno:HideRow': {
				name: _UNO('.uno:HideRow', 'spreadsheet', true),
				callback: (this._hideRow).bind(this)
			},
			'.uno:ShowRow': {
				name: _UNO('.uno:ShowRow', 'spreadsheet', true),
				callback: (this._showRow).bind(this)
			}
		};

		this._menuData = L.Control.JSDialogBuilder.getMenuStructureForMobileWizard(this._menuItem, true, '');

		this._initHeaderEntryStyles('spreadsheet-header-row');
		this._initHeaderEntryHoverStyles('spreadsheet-header-row-hover');
		this._initHeaderEntrySelectedStyles('spreadsheet-header-row-selected');
		this._initHeaderEntryResizeStyles('spreadsheet-header-row-resize');

		L.DomUtil.setStyle(this.containerObject.canvas, 'cursor', this._cursor);
		this._headerInfo = new L.Control.Header.HeaderInfo(this._map, false /* isCol */);
	},

	onLongPress: function () {
		if (this._map.isPermissionEdit()) {
			window.contextMenuWizard = true;
			this._map.fire('mobilewizard', this._menuData);
		}
	},

	_updateCanvas: function () {
		if (this._headerInfo) {
			this._headerInfo.update();
			this.containerObject.requestReDraw();
		}
	},

	_onClearSelection: function () {
		this.clearSelection();
	},

	_onUpdateSelection: function (e) {
		var start = e.start.y;
		var end = e.end.y;
		if (start !== -1) {
			start = this._twipsToPixels(start);
		}
		if (end !== -1) {
			end = this._twipsToPixels(end);
		}
		this.updateSelection(start, end);
	},

	drawHeaderEntry: function (entry, isOver, isHighlighted, isCurrent) {
		if (!entry)
			return;

		var content = entry.index + 1;
		var startX = this.size[0] - this._headerWidth;
		var startY = entry.pos - entry.size;
		var endY = entry.pos;
		var height = endY - startY;
		var width = this._headerWidth;

		if (isHighlighted !== true && isHighlighted !== false) {
			isHighlighted = this.isHighlighted(entry.index);
		}

		if (height <= 0)
			return;

		// background gradient
		var selectionBackgroundGradient = null;
		if (isHighlighted) {
			selectionBackgroundGradient = this.context.createLinearGradient(0, startY, 0, startY + height);
			selectionBackgroundGradient.addColorStop(0, this._selectionBackgroundGradient[0]);
			selectionBackgroundGradient.addColorStop(0.5, this._selectionBackgroundGradient[1]);
			selectionBackgroundGradient.addColorStop(1, this._selectionBackgroundGradient[2]);
		}

		// draw background
		this.context.beginPath();
		this.context.fillStyle = isHighlighted ? selectionBackgroundGradient : isOver ? this._hoverColor : this._backgroundColor;
		this.context.fillRect(startX, startY, width, height);

		// draw header/outline border separator
		if (this._headerWidth !== this._canvasWidth) {
			this.context.beginPath();
			this.context.fillStyle = this._borderColor;
			this.context.fillRect(startX - this._borderWidth, startY, this._borderWidth, height);
		}

		// draw resize handle
		var handleSize = this._resizeHandleSize;
		if (isCurrent && height > 2 * handleSize) {
			var center = startY + height - handleSize / 2;
			var x = startX + 2 * this.dpiScale;
			var w = width - 4 * this.dpiScale;
			var size = 2 * this.dpiScale;
			var offset = 1 *this.dpiScale;

			this.context.fillStyle = '#BBBBBB';
			this.context.beginPath();
			this.context.fillRect(x + 2 * this.dpiScale, center - size - offset, w - 4 * this.dpiScale, size);
			this.context.beginPath();
			this.context.fillRect(x + 2 * this.dpiScale, center + offset, w - 4 * this.dpiScale, size);
		}

		// draw text content
		this.context.fillStyle = isHighlighted ? this._selectionTextColor : this._textColor;
		this.context.font = this._font.getFont();
		this.context.textAlign = 'center';
		this.context.textBaseline = 'middle';
		this.context.fillText(content, startX + (width / 2), endY - (height / 2));

		// draw row separator
		this.context.beginPath();
		this.context.fillStyle = this._borderColor;
		this.context.fillRect(startX, endY - 1, width , this._borderWidth);
	},

	drawGroupControl: function (group) {
		if (!group)
			return;

		var ctx = this.context;
		var headSize = this._groupHeadSize;
		var spacing = this._levelSpacing;
		var level = group.level;

		var startOrt = spacing + (headSize + spacing) * level;
		var startPar = this._headerInfo.docToHeaderPos(group.startPos);
		var height = group.endPos - group.startPos;

		ctx.save();
		ctx.scale(this.dpiScale, this.dpiScale);

		// clip mask
		ctx.beginPath();
		ctx.rect(startOrt, startPar, headSize, height);
		ctx.clip();
		if (!group.hidden) {
			//draw tail
			ctx.strokeStyle = 'black';
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.moveTo(startOrt + 2, startPar + headSize);
			ctx.lineTo(startOrt + 2, startPar + height - 1);
			ctx.lineTo(startOrt + 2 + headSize / 2, startPar + height - 1);
			ctx.stroke();
			// draw head
			ctx.fillStyle = this._hoverColor;
			ctx.fillRect(startOrt, startPar, headSize, headSize);
			ctx.strokeStyle = 'black';
			ctx.lineWidth = 0.5;
			ctx.strokeRect(startOrt, startPar, headSize, headSize);
			// draw '-'
			ctx.lineWidth = 1;
			ctx.strokeRect(startOrt + headSize / 4, startPar + headSize / 2, headSize / 2, 1);
		}
		else {
			// draw head
			ctx.fillStyle = this._hoverColor;
			ctx.fillRect(startOrt, startPar, headSize, headSize);
			ctx.strokeStyle = 'black';
			ctx.lineWidth = 0.5;
			ctx.strokeRect(startOrt, startPar, headSize, headSize);
			// draw '+'
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(startOrt + headSize / 4, startPar + headSize / 2);
			ctx.lineTo(startOrt + 3 * headSize / 4, startPar + headSize / 2);
			ctx.moveTo(startOrt + headSize / 2, startPar + headSize / 4);
			ctx.lineTo(startOrt + headSize / 2, startPar + 3 * headSize / 4);
			ctx.stroke();
		}
		ctx.restore();
	},

	drawLevelHeader: function(level) {
		var ctx = this._cornerCanvasContext;
		var ctrlHeadSize = this._groupHeadSize;
		var levelSpacing = this._levelSpacing;

		var startOrt = levelSpacing + (ctrlHeadSize + levelSpacing) * level;
		var startPar = this._cornerCanvas.height / this.dpiScale - (ctrlHeadSize + (L.Control.Header.colHeaderHeight - ctrlHeadSize) / 2);

		ctx.save();
		ctx.scale(this.dpiScale, this.dpiScale);
		ctx.fillStyle = this._hoverColor;
		ctx.fillRect(startOrt, startPar, ctrlHeadSize, ctrlHeadSize);
		ctx.strokeStyle = 'black';
		ctx.lineWidth = 0.5;
		ctx.strokeRect(startOrt, startPar, ctrlHeadSize, ctrlHeadSize);
		// draw level number
		ctx.fillStyle = this._textColor;
		ctx.font = this._font.getFont();
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(level + 1, startOrt + (ctrlHeadSize / 2), startPar + (ctrlHeadSize / 2));
		ctx.restore();
	},

	getHeaderEntryBoundingClientRect: function (index) {
		var entry = this._mouseOverEntry;

		if (index)
			entry = this._headerInfo.getRowData(index);

		if (!entry)
			return;

		var rect = this._canvas.getBoundingClientRect();

		var rowStart = (entry.pos - entry.size) / this.dpiScale;
		var rowEnd = entry.pos / this.dpiScale;

		var left = rect.left;
		var right = rect.right;
		var top = rect.top + rowStart;
		var bottom = rect.top + rowEnd;
		return {left: left, right: right, top: top, bottom: bottom};
	},

	viewRowColumnHeaders: function (e) {
		var dataInEvent = (e.data && e.data.rows && e.data.rows.length);
		if (dataInEvent || e.updaterows) {
			dataInEvent ? this.fillRows(e.data.rows, e.data.rowGroups, e.converter, e.context) :
				this.fillRows(undefined, undefined, e.converter, e.context);
			this._onUpdateCurrentRow(e.cursor);
			if (e.selection && e.selection.hasSelection) {
				this._onUpdateSelection(e.selection);
			}
			else {
				this._onClearSelection();
			}
		}
	},

	onDraw: function () {
		this._headerInfo.forEachElement(function(elemData) {
			this.drawHeaderEntry(elemData, false);
		}.bind(this));

		// draw group controls
		this.drawOutline();
	},

	onClick: function (point, e) {
		if (this._onOutlineMouseEvent(point, this._onGroupControlClick, e))
			return;

		if (!this._mouseOverEntry)
			return;

		var row = this._mouseOverEntry.index;

		var modifier = 0;
		if (e.shiftKey) {
			modifier += this._map.keyboard.keyModifier.shift;
		}
		if (e.ctrlKey) {
			modifier += this._map.keyboard.keyModifier.ctrl;
		}

		this._selectRow(row, modifier);
	},

	_onCornerHeaderClick: function(e) {
		var pos = this._mouseEventToCanvasPos(this._cornerCanvas, e);

		if (pos.x > this.getOutlineWidth()) {
			// empty rectangle on the right select all
			this._map.sendUnoCommand('.uno:SelectAll');
			return;
		}

		var level = this._getGroupLevel(pos.x);
		this._updateOutlineState(/*is column: */ false, {column: false, level: level, index: -1});
	},

	_onDialogResult: function (e) {
		if (e.type === 'submit' && !isNaN(e.value)) {
			var extra = {
				aExtraHeight: {
					type: 'unsigned short',
					value: e.value
				}
			};

			this._map.sendUnoCommand('.uno:SetOptimalRowHeight', extra);
		}

		this._map.enable(true);
	},

	onDragEnd: function (dragDistance) {
		if (dragDistance[1] === 0) {
			return;
		}
		else {
			var height = this._dragEntry.size;
			var row = this._dragEntry.index;

			var nextRow = this._headerInfo.getNextIndex(this._dragEntry.index);
			if (this._headerInfo.isZeroSize(nextRow)) {
				row = nextRow;
				height = 0;
			}

			height += dragDistance[1];
			height /= this.dpiScale;
			height = this._map._docLayer._pixelsToTwips({x: 0, y: height}).y;

			var command = {
				RowHeight: {
					type: 'unsigned short',
					value: this._map._docLayer.twipsToHMM(Math.max(height, 0))
				},
				Row: {
					type: 'long',
					value: row + 1 // core expects 1-based index.
				}
			};

			this._map.sendUnoCommand('.uno:RowHeight', command);
		}
	},

	setOptimalHeightAuto: function () {
		if (this._mouseOverEntry) {
			var row = this._mouseOverEntry.index;
			var command = {
				Row: {
					type: 'long',
					value: row
				},
				Modifier: {
					type: 'unsigned short',
					value: 0
				}
			};

			var extra = {
				aExtraHeight: {
					type: 'unsigned short',
					value: 0
				}
			};

			this._map.sendUnoCommand('.uno:SelectRow', command);
			this._map.sendUnoCommand('.uno:SetOptimalRowHeight', extra);
		}
	},

	_onUpdatePermission: function (e) {
		if (this._map.getDocType() !== 'spreadsheet') {
			return;
		}

		// Enable context menu on row headers only if permission is 'edit'
		if ($('.spreadsheet-header-rows').length > 0) {
			$('.spreadsheet-header-rows').contextMenu(e.perm === 'edit');
		}
	},

	_getParallelPos: function (point) {
		return point.y;
	},

	_getOrthogonalPos: function (point) {
		return point.x;
	},

	resize: function (width) {
		this.size[0] = width;
		this._map.fire('updatecornerheader');
		var offset = Math.round(this.size[0] / this.dpiScale);
		this._map.options.documentContainer.style.left = String(offset) + 'px';
		document.getElementsByClassName('leaflet-canvas-container')[0].style.left = String(offset * -1) + 'px';
		this.containerObject.reNewAllSections();
	},

	onResize: function () {

	},
});

L.control.rowHeader = function (options) {
	return new L.Control.RowHeader(options);
};
