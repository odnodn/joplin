import * as React from 'react';
import { useRef, useState, useEffect } from 'react';
import produce from 'immer';
import useWindowResizeEvent from './utils/useWindowResizeEvent';
import useLayoutItemSizes, { LayoutItemSizes, itemSize } from './utils/useLayoutItemSizes';
import validateLayout from './utils/validateLayout';
import { Size, LayoutItem } from './utils/types';
import { canMove, MoveDirection } from './utils/movements';
import MoveButtons, { MoveButtonClickEvent } from './MoveButtons';
import { StyledWrapperRoot, StyledMoveOverlay, MoveModeRootWrapper, MoveModeRootMessage } from './utils/style';
import { Resizable } from 're-resizable';
const EventEmitter = require('events');

const itemMinWidth = 20;
const itemMinHeight = 20;

interface onResizeEvent {
	layout: LayoutItem
}

interface Props {
	layout: LayoutItem,
	onResize(event:onResizeEvent):void;
	width?: number,
	height?: number,
	renderItem: Function,
	onMoveButtonClick(event:MoveButtonClickEvent):void;
	moveMode: boolean,
	moveModeMessage: string,
}

export function allDynamicSizes(layout:LayoutItem):any {
	const output:any = {};

	function recurseProcess(item:LayoutItem) {
		if (item.resizableBottom || item.resizableRight) {
			if ('width' in item || 'height' in item) {
				const size:any = {};
				if ('width' in item) size.width = item.width;
				if ('height' in item) size.height = item.height;
				output[item.key] = size;
			}
		}

		if (item.children) {
			for (const child of item.children) {
				recurseProcess(child);
			}
		}
	}

	recurseProcess(layout);

	return output;
}

export function findItemByKey(layout:LayoutItem, key:string):LayoutItem {
	function recurseFind(item:LayoutItem):LayoutItem {
		if (item.key === key) return item;

		if (item.children) {
			for (const child of item.children) {
				const found = recurseFind(child);
				if (found) return found;
			}
		}
		return null;
	}

	const output = recurseFind(layout);
	if (!output) throw new Error(`Invalid item key: ${key}`);
	return output;
}

function updateLayoutItem(layout:LayoutItem, key:string, props:any) {
	return produce(layout, (draftState:LayoutItem) => {
		function recurseFind(item:LayoutItem) {
			if (item.key === key) {
				for (const n in props) {
					(item as any)[n] = props[n];
				}
			} else {
				if (item.children) {
					for (const child of item.children) {
						recurseFind(child);
					}
				}
			}
		}

		recurseFind(draftState);
	});
}

function itemVisible(item:LayoutItem) {
	if (item.children && !item.children.length) return false;
	return item.visible !== false;
}

function renderContainer(item:LayoutItem, parent:LayoutItem | null, sizes:LayoutItemSizes, onResizeStart:Function, onResize:Function, onResizeStop:Function, children:any[], isLastChild:boolean):any {
	const style:any = {
		display: itemVisible(item) ? 'flex' : 'none',
		flexDirection: item.direction,
	};

	const size:Size = itemSize(item, parent, sizes, true);

	const className = `resizableLayoutItem rli-${item.key}`;
	if (item.resizableRight || item.resizableBottom) {
		const enable = {
			top: false,
			right: !!item.resizableRight && !isLastChild,
			bottom: !!item.resizableBottom && !isLastChild,
			left: false,
			topRight: false,
			bottomRight: false,
			bottomLeft: false,
			topLeft: false,
		};

		return (
			<Resizable
				key={item.key}
				className={className}
				style={style}
				size={size}
				onResizeStart={onResizeStart as any}
				onResize={onResize as any}
				onResizeStop={onResizeStop as any}
				enable={enable}
				minWidth={'minWidth' in item ? item.minWidth : itemMinWidth}
				minHeight={'minHeight' in item ? item.minHeight : itemMinHeight}
			>
				{children}
			</Resizable>
		);
	} else {
		return (
			<div key={item.key} className={className} style={{ ...style, ...size }}>
				{children}
			</div>
		);
	}
}

function ResizableLayout(props:Props) {
	const eventEmitter = useRef(new EventEmitter());

	const [resizedItem, setResizedItem] = useState<any>(null);

	function renderItemWrapper(comp:any, item:LayoutItem, parent:LayoutItem | null, size:Size, moveMode:boolean) {
		const moveOverlay = moveMode ? (
			<StyledMoveOverlay>
				<MoveButtons
					itemKey={item.key}
					onClick={props.onMoveButtonClick}
					canMoveLeft={canMove(MoveDirection.Left, item, parent)}
					canMoveRight={canMove(MoveDirection.Right, item, parent)}
					canMoveUp={canMove(MoveDirection.Up, item, parent)}
					canMoveDown={canMove(MoveDirection.Down, item, parent)}
				/>
			</StyledMoveOverlay>
		) : null;

		return (
			<StyledWrapperRoot key={item.key} size={size}>
				{moveOverlay}
				{comp}
			</StyledWrapperRoot>
		);
	}

	function renderLayoutItem(item:LayoutItem, parent:LayoutItem | null, sizes:LayoutItemSizes, isVisible:boolean, isLastChild:boolean):any {
		function onResizeStart() {
			setResizedItem({
				key: item.key,
				initialWidth: sizes[item.key].width,
				initialHeight: sizes[item.key].height,
			});
		}

		function onResize(_event:any, direction:string, _refToElement: any, delta:any) {
			const newWidth = Math.max(itemMinWidth, resizedItem.initialWidth + delta.width);
			const newHeight = Math.max(itemMinHeight, resizedItem.initialHeight + delta.height);

			const newSize:any = {};

			if (item.width) newSize.width = item.width;
			if (item.height) newSize.height = item.height;

			if (direction === 'bottom') {
				newSize.height = newHeight;
			} else {
				newSize.width = newWidth;
			}

			const newLayout = updateLayoutItem(props.layout, item.key, newSize);

			props.onResize({ layout: newLayout });
			eventEmitter.current.emit('resize');
		}

		function onResizeStop(_event:any, _direction:any, _refToElement: any, delta:any) {
			onResize(_event, _direction, _refToElement, delta);
			setResizedItem(null);
		}

		if (!item.children) {
			const size = itemSize(item, parent, sizes, false);

			const comp = props.renderItem(item.key, {
				item: item,
				eventEmitter: eventEmitter.current,
				size: size,
				visible: isVisible,
			});

			const wrapper = renderItemWrapper(comp, item, parent, size, props.moveMode);

			return renderContainer(item, parent, sizes, onResizeStart, onResize, onResizeStop, [wrapper], isLastChild);
		} else {
			const childrenComponents = [];
			for (let i = 0; i < item.children.length; i++) {
				const child = item.children[i];
				childrenComponents.push(renderLayoutItem(child, item, sizes, isVisible && itemVisible(child), i === item.children.length - 1));
			}

			return renderContainer(item, parent, sizes, onResizeStart, onResize, onResizeStop, childrenComponents, isLastChild);
		}
	}

	useEffect(() => {
		validateLayout(props.layout);
	}, [props.layout]);

	useWindowResizeEvent(eventEmitter);
	const sizes = useLayoutItemSizes(props.layout);

	function renderMoveModeBox(rootComp:any) {
		return (
			<MoveModeRootWrapper>
				<MoveModeRootMessage>{props.moveModeMessage}</MoveModeRootMessage>
				{rootComp}
			</MoveModeRootWrapper>
		);
	}

	const rootComp = renderLayoutItem(props.layout, null, sizes, itemVisible(props.layout), true);

	if (props.moveMode) {
		return renderMoveModeBox(rootComp);
	} else {
		return rootComp;
	}
}

export default ResizableLayout;
