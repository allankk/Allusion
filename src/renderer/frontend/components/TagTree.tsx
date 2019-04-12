import { observer } from 'mobx-react-lite';
import React, { useState } from 'react';

import TagListItem, { DEFAULT_TAG_NAME } from './TagListItem';

import { withRootstore, IRootStoreProp } from '../contexts/StoreContext';
import { Tree, ITreeNode } from '@blueprintjs/core';
import TagCollectionListItem from './TagCollectionListItem';
import { ClientTagCollection, ROOT_TAG_COLLECTION_ID } from '../../entities/TagCollection';
import TagCollectionStore from '../stores/TagCollectionStore';
import { ClientTag } from '../../entities/Tag';
import { ID } from '../../entities/ID';

interface IExpandState {
  [key: string]: boolean;
}

const SYSTEM_TAGS_ID = 'system-tags';
const ALL_TAGS_ID = 'all-tags';

/** Recursive function that sets the 'expand' state for each (sub) collection */
const setExpandStateRecursively = (col: ClientTagCollection, val: boolean, expandState: IExpandState): IExpandState => {
  col.clientSubCollections.forEach((subCol) => {
    setExpandStateRecursively(subCol, val, expandState);
  });
  expandState[col.id] = val;
  return expandState;
};

/** Recursive function that generates a tree of ITreeNodes from TagCollections */
const createTagCollectionTreeNode = (
  col: ClientTagCollection,
  expandState: Readonly<IExpandState>,
  store: TagCollectionStore,
  setExpandState: (state: IExpandState) => void,
): ITreeNode => ({
  id: col.id,
  icon: expandState[col.id] ? 'folder-open' : 'folder-close',
  isSelected: col.isSelected,
  label: (
    <TagCollectionListItem
      tagCollection={col}
      // Disable deleting the root hierarchy
      onRemove={col.id === ROOT_TAG_COLLECTION_ID ? undefined : () => store.removeTagCollection(col)}
      onAddTag={() => {
        store.rootStore.tagStore.addTag(DEFAULT_TAG_NAME)
          .then((tag) => col.tags.push(tag.id))
          .catch((err) => console.log('Could not create tag', err));
      }}
      onAddCollection={() => {
        const newCol = store.addTagCollection('New collection', col);
        setExpandState({ ...expandState, [newCol.id]: true }); // immediately expand after adding
      }}
      onExpand={() => setExpandState({ ...expandState, [col.id]: true })}
      // Destructure objects to make them into a new object, else the render won't trigger
      onExpandAll={() => setExpandState({ ...setExpandStateRecursively(col, true, expandState) })}
      onCollapseAll={() => setExpandState({ ...setExpandStateRecursively(col, false, expandState) })}
      onMoveCollection={(id) => {
        const movedCollectionParent = store.tagCollectionList.find((c) => c.subCollections.includes(id));
        if (movedCollectionParent) {
          movedCollectionParent.subCollections.remove(id);
          col.subCollections.push(id);
        }
      }}
      onMoveTag={(id) => {
        const movedCollectionParent = store.tagCollectionList.find((c) => c.tags.includes(id));
        if (movedCollectionParent) {
          movedCollectionParent.tags.remove(id);
          col.tags.push(id);
        }
      }}
    />
  ),
  hasCaret: true,
  isExpanded: expandState[col.id],
  childNodes: [
    ...col.clientSubCollections.map(
      (subCol) => createTagCollectionTreeNode(subCol, expandState, store, setExpandState)),
    ...col.clientTags.map((tag): ITreeNode => ({
      id: tag.id,
      icon: 'tag',
      isSelected: store.rootStore.uiStore.tagSelection.includes(tag.id),
      label: (
        <TagListItem
          name={tag.name}
          id={tag.id}
          dateAdded={tag.dateAdded}
          onRemove={() => store.rootStore.tagStore.removeTag(tag)}
          onRename={(name) => { tag.name = name; }}
          onMoveTag={(movedTagId) => {
            // Find original collection
            const origCol = store.tagCollectionList.find((c) => c.tags.includes(movedTagId));
            if (!origCol) { return console.error('Could not find original collection when moving tag', movedTagId); }
            // Find where to insert the moved tag
            const insertionIndex = col.tags.indexOf(tag.id);
            // Remove from orig collection
            origCol.tags.remove(movedTagId);
            // Insert the moved tag to the position of the current tag where it was dropped
            col.tags.splice(insertionIndex, 0, movedTagId);
          }}
        />
      ),
    })),
  ],
});

export interface ITagListProps extends IRootStoreProp { }

const TagList = ({ rootStore: { tagStore, tagCollectionStore, uiStore, fileStore } }: ITagListProps) => {
  // Keep track of folders that have been expanded. The two main folders are expanded by default.
  const [expandState, setExpandState] = useState<IExpandState>({
    [ROOT_TAG_COLLECTION_ID]: true,
    [SYSTEM_TAGS_ID]: true,
  });

  const handleNodeCollapse = (node: ITreeNode) => {
    setExpandState({ ...expandState, [node.id]: false });
  };

  const handleNodeExpand = (node: ITreeNode) => {
    setExpandState({ ...expandState, [node.id]: true });
  };

  const handleSelection = (tag: ClientTag) => {
    if (uiStore.tagSelection.includes(tag.id)) {
      uiStore.deselectTag(tag);
    } else {
      uiStore.selectTag(tag);
    }
    fileStore.fetchFilesByTagIDs(uiStore.tagSelection.toJS());
  };

  const handleNodeClick = ({ id }: ITreeNode) => {
    if (id === ALL_TAGS_ID) {
      uiStore.tagSelection.clear();
      fileStore.fetchFilesByTagIDs(uiStore.tagSelection.toJS());
    } else {
      const clickedTag = tagStore.tagList.find((t) => t.id === id);
      if (clickedTag) {
        handleSelection(clickedTag);
      }

      const clickedCollection = tagCollectionStore.tagCollectionList.find((c) => c.id === id);
      if (clickedCollection) {
        // Get all tags recursively that are in this collection
        const getRecursiveTags = (col: ClientTagCollection): ID[] =>
          [...col.tags, ...col.clientSubCollections.flatMap(getRecursiveTags)];
        const selectedTags = getRecursiveTags(clickedCollection);

        // Add or remove all tags from the selection
        if (clickedCollection.isSelected) {
          selectedTags.forEach((tagId) => uiStore.tagSelection.remove(tagId));
        } else {
          selectedTags.forEach((tagId) => !uiStore.tagSelection.includes(tagId) && uiStore.tagSelection.push(tagId));
        }
        fileStore.fetchFilesByTagIDs(uiStore.tagSelection.toJS());
      }
    }
  };

  const root = tagCollectionStore.getRootCollection();
  // Todo: Not sure what the impact is of generating the hierarchy in each render on performance.
  // Usually the hierarchy is stored directly in the state, but we can't do that since it it managed by the TagCollectionStore.
  // Or maybe we can, but then the ClientTagCollection needs to extends ITreeNode, which messes up the responsibility of the Store and the state required by the view...
  const hierarchy: ITreeNode[] = root
    ? [createTagCollectionTreeNode(root, expandState, tagCollectionStore, setExpandState)]
    : [];

  const systemTags: ITreeNode[] = [
    // {
    //   id: 'untagged',
    //   label: 'Untagged',
    //   icon: 'tag',
    // },
    {
      id: ALL_TAGS_ID,
      label: 'All tags',
      icon: 'tag',
      isSelected: uiStore.tagSelection.length === 0,
    },
  ];

  const treeContents: ITreeNode[] = [
    ...hierarchy,
    {
      id: SYSTEM_TAGS_ID,
      icon: 'folder-close',
      label: 'System tags',
      hasCaret: true,
      isExpanded: expandState[SYSTEM_TAGS_ID],
      childNodes: systemTags,
    },
  ];

  return (
    // <>
    <Tree
      contents={treeContents}
      onNodeCollapse={handleNodeCollapse}
      onNodeExpand={handleNodeExpand}
      onNodeClick={handleNodeClick}
    // TODO: Context menu from here instead of in the TagCollectionListItem
    // Then you can right-click anywhere instead of only on the label
    // https://github.com/palantir/blueprint/issues/3187
    // onNodeContextMenu={}
    />

    // {/* New tag input field */}
    // <ModifiableTagListItem
    //   placeholder="New tag"
    //   icon="add"
    //   initialName={''}
    //   onRename={(name) => tagStore.addTag(name)}
    //   resetOnSubmit
    //   autoFocus={false}
    // />
    // </>
  );
};

export default withRootstore(observer(TagList));