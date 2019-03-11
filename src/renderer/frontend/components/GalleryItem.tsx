import React from 'react';

import { shell } from 'electron';

import { observer } from 'mobx-react-lite';
import { DropTarget, ConnectDropTarget, DropTargetMonitor } from 'react-dnd';

import { ClientFile } from '../../entities/File';
import {
  Tag,
  Icon,
  ContextMenuTarget,
  Menu,
  MenuItem,
} from '@blueprintjs/core';
import { ClientTag } from '../../entities/Tag';

interface IGalleryItemTagProps {
  name: string;
  onRemove: () => void;
}

const GalleryItemTag = ({ name, onRemove }: IGalleryItemTagProps) => (
  <Tag onRemove={onRemove} interactive intent="primary">
    {name}
  </Tag>
);

interface IGalleryItemProps {
  file: ClientFile;
  isSelected: boolean;
  onRemoveTag: (tag: ClientTag) => void;
  onSelect: (file: ClientFile) => void;
  onOpen: (file: ClientFile) => void;
  onDeselect: (file: ClientFile) => void;
  onDrop: (item: any) => void;
}

interface IGalleryItemCollectedProps {
  canDrop: boolean;
  isOver: boolean;
  connectDropTarget: ConnectDropTarget;
}

const GalleryItem = ({
  file,
  isSelected,
  onRemoveTag,
  onSelect,
  onOpen,
  onDeselect,
  canDrop,
  isOver,
  connectDropTarget,
}: IGalleryItemProps & IGalleryItemCollectedProps) => {
  const selectedStyle = isSelected ? 'selected' : '';
  const dropStyle = canDrop ? ' droppable' : ' undroppable';

  const className = `thumbnail ${selectedStyle} ${isOver ? dropStyle : ''}`;

  return connectDropTarget(
    <div className={className}>
      <img
        key={`file-${file.id}`}
        src={file.path}
        onClick={() => onOpen(file)}
      />
      <span className="thumbnailTags">
        {file.clientTags.map((tag) => (
          <GalleryItemTag
            key={`gal-tag-${tag.id}`}
            name={tag.name}
            onRemove={() => onRemoveTag(tag)}
          />
        ))}
      </span>
      <div
        className={`thumbnailSelector ${isSelected ? 'selected' : ''}`}
        onClick={() => (isSelected ? onDeselect(file) : onSelect(file))}>
        <Icon icon={isSelected ? 'selection' : 'circle'} />
      </div>
    </div>,
  );
};

const galleryItemTarget = {
  drop(props: IGalleryItemProps, monitor: DropTargetMonitor) {
    props.onDrop(monitor.getItem());
  },
};

/** Make gallery item available to drop a tag onto */
const DroppableGalleryItem = DropTarget<
  IGalleryItemProps,
  IGalleryItemCollectedProps
>('tag', galleryItemTarget, (connect, monitor) => ({
  connectDropTarget: connect.dropTarget(),
  isOver: monitor.isOver(),
  canDrop: monitor.canDrop(),
}))(observer(GalleryItem));

const GalleryItemContextMenu = (filePath: string) => {
  const handleOpen = () => {
    shell.openItem(filePath);
  };

  // Doesn't seem like "open with" is possible in electron :(
  // https://github.com/electron/electron/issues/4815
  const handleOpenWith = () => {
    shell.openExternal(filePath);
  };

  const handleOpenFileExplorer = () => {
    shell.showItemInFolder(filePath);
  };

  const handleInspect = () => {
    console.log('Inspect');
    shell.beep();
  };

  return (
    <Menu>
      <MenuItem onClick={handleOpen} text="Open" />
      <MenuItem onClick={handleOpenWith} text="Open with" />
      <MenuItem
        onClick={handleOpenFileExplorer}
        text="Reveal in File Browser"
      />
      <MenuItem onClick={handleInspect} text="Inspect" />
    </Menu>
  );
};

/** Wrapper that adds a context menu (with right click) */
@ContextMenuTarget
class GalleryItemWithContextMenu extends React.PureComponent<
  IGalleryItemProps,
  { isContextMenuOpen: boolean }
> {
  state = {
    isContextMenuOpen: false,
    _isMounted: false,
  };

  componentDidMount() {
    this.state._isMounted = true;
  }

  componentWillUnmount() {
    this.state._isMounted = false;
  }

  render() {
    return (
      // Context menu/root element must supports the "contextmenu" event and the onContextMenu prop
      <span className={this.state.isContextMenuOpen ? 'contextMenuTarget' : ''}>
        <DroppableGalleryItem {...this.props} />
      </span>
    );
  }

  renderContextMenu() {
    this.updateState({ isContextMenuOpen: true });
    return GalleryItemContextMenu(this.props.file.path);
  }

  onContextMenuClose = () => {
    this.updateState({ isContextMenuOpen: false });
  }

  private updateState = (updatableProp: any) => {
    if (this.state._isMounted) {
      this.setState(updatableProp);
    }
  }
}

export default GalleryItemWithContextMenu;
