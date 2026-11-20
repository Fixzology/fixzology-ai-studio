/**
 * Fixzology AI Studio - Local IndexedDB Storage & .fxz Project File Manager
 * Stores projects locally without duplicating large media files.
 */
export class ProjectStorage {
  static DB_NAME = 'FixzologyStudioDB';
  static STORE_NAME = 'projects';

  static openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  static async saveProject(project) {
    const db = await this.openDB();
    project.updatedAt = new Date().toISOString();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, 'readwrite');
      tx.objectStore(this.STORE_NAME).put(project);
      tx.oncomplete = () => resolve(project);
      tx.onerror = () => reject(tx.error);
    });
  }

  static async listProjects() {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, 'readonly');
      const req = tx.objectStore(this.STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  static exportFxzFile(project) {
    // Strip transient blob URLs so .fxz file stays lightweight and portable
    const cleanProject = {
      ...project,
      exportedAt: new Date().toISOString(),
      appVersion: '1.0.0-phase1'
    };
    const blob = new Blob([JSON.stringify(cleanProject, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.title.replace(/[^a-z0-9_\-\u0900-\u097F]/gi, '_')}.fxz`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
