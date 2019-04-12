import { action, observable } from 'mobx';
import fs from 'fs-extra';

import Backend from '../../backend/Backend';
import { ClientFile, IFile } from '../../entities/File';
import RootStore from './RootStore';
import { ID } from '../../entities/ID';

class FileStore {
  backend: Backend;
  rootStore: RootStore;

  readonly fileList = observable<ClientFile>([]);

  constructor(backend: Backend, rootStore: RootStore) {
    this.backend = backend;
    this.rootStore = rootStore;
  }

  async init() {
    await this.loadFiles();
  }

  @action
  async addFile(filePath: string) {
    // The function caller is responsible for handling errors.
    const file = new ClientFile(this, filePath);
    await this.backend.createFile(file.id, file.path);
    this.fileList.push(file);
    return file;
  }

  @action
  async removeFilesById(ids: ID[]) {
    const filesToRemove = ids.map((id) => this.fileList.find((f) => f.id === id));
    // Intentionally done in sequence instead of parallel to avoid removing the wrong files
    // Probably could be done in parallel, but the current removeFile removes the wrong files when called with Promise.all
    for (const file of filesToRemove) {
      if (file) {
        await this.removeFile(file);
      } else {
        console.log('Could not find file to remove', file);
      }
    }
  }

  @action
  async fetchAllFiles() {
    try {
      const fetchedFiles = await this.backend.fetchFiles();
      this.updateFromBackend(fetchedFiles);
    } catch (err) {
      console.error('Could not load all files', err);
    }
  }

  @action
  async fetchFilesByTagIDs(tags: ID[]) {
    // Query the backend to send back only files with these tags
    if (tags.length === 0) {
      await this.fetchAllFiles();
    } else {
      try {
        const fetchedFiles = await this.backend.searchFiles(tags);
        this.updateFromBackend(fetchedFiles);
      } catch (e) {
        console.log('Could not find files based on tag search', e);
      }
    }
  }

  private async loadFiles() {
    const fetchedFiles = await this.backend.fetchFiles();

    // Removes files with invalid file path. Otherwise adds files to fileList.
    // In the future the user should have the option to input the new path if the file was only moved or renamed.
    await Promise.all(
      fetchedFiles.map(async (backendFile: IFile) => {
        try {
          await fs.access(backendFile.path, fs.constants.F_OK);
          this.fileList.push(
            new ClientFile(this).updateFromBackend(backendFile),
          );
        } catch (e) {
          console.log(`${backendFile.path} 'does not exist'`);
          this.backend.removeFile(backendFile);
        }
      }),
    );
  }

  private async removeFile(file: ClientFile): Promise<void> {
    // Deselect in case it was selected
    this.rootStore.uiStore.deselectFile(file);
    file.dispose();
    this.fileList.remove(file);
    return this.backend.removeFile(file);
  }

  private async updateFromBackend(backendFiles: IFile[]) {
    // removing manually invalid files
    // watching files would be better to remove invalid files
    // files could also have moved, removing them may be undesired then
    const existenceChecker = await Promise.all(
      backendFiles.map(async (backendFile) => {
        try {
          await fs.access(backendFile.path, fs.constants.F_OK);
          return true;
        } catch (err) {
          this.backend.removeFile(backendFile);
          const clientFile = this.fileList.find((f) => backendFile.id === f.id);
          if (clientFile) {
            await this.removeFile(clientFile);
          }
          return false;
        }
      }),
    );

    const existingBackendFiles = backendFiles.filter(
      (_, i) => existenceChecker[i],
    );

    if (this.fileList.length === 0) {
      this.fileList.push(...this.filesFromBackend(existingBackendFiles));
      return;
    }

    if (existingBackendFiles.length === 0) {
      return this.clearFileList();
    }

    return this.replaceFileList(this.filesFromBackend(existingBackendFiles));
  }

  private filesFromBackend(backendFiles: IFile[]): ClientFile[] {
    return backendFiles.map((file) =>
      new ClientFile(this).updateFromBackend(file),
    );
  }

  // Removes all items from fileList
  private clearFileList() {
    // Clean up observers of ClientFiles before removing them
    this.fileList.forEach((f) => f.dispose());
    this.fileList.clear();
  }

  private replaceFileList(backendFiles: ClientFile[]) {
    this.fileList.forEach((f) => f.dispose());
    this.fileList.replace(backendFiles);
  }
}

export default FileStore;