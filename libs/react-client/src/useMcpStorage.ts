import { useCallback, useContext, useEffect, useState } from 'react';

import { ChainlitContext } from './context';
import { IMcp } from './types';
import { useConfig } from './useConfig';

// Singleton MCP Storage Manager with built-in state management
class McpStorageManager {
  private static instance: McpStorageManager;
  private isInitializing = false;
  private hasInitialized = false;
  private isDbAvailable = false;
  private initPromise: Promise<void> | null = null;
  private apiClient: any = null;
  private config: any = null;
  private data: IMcp[] = [];
  private subscribers: Set<(data: IMcp[]) => void> = new Set();

  static getInstance(): McpStorageManager {
    if (!McpStorageManager.instance) {
      McpStorageManager.instance = new McpStorageManager();
    }
    return McpStorageManager.instance;
  }

  subscribe(callback: (data: IMcp[]) => void): () => void {
    this.subscribers.add(callback);
    // Immediately call with current data
    callback(this.data);

    // Return unsubscribe function
    return () => {
      this.subscribers.delete(callback);
    };
  }

  private notifySubscribers(): void {
    this.subscribers.forEach((callback) => callback(this.data));
  }

  private setData(newData: IMcp[]): void {
    this.data = newData;
    this.notifySubscribers();
  }

  setDependencies(apiClient: any, config: any) {
    this.apiClient = apiClient;
    this.config = config;
  }

  private loadFromLocalStorage(): IMcp[] {
    try {
      const savedValue = localStorage.getItem('mcp_storage_key');
      if (savedValue) {
        const parsedValue = JSON.parse(savedValue);
        if (Array.isArray(parsedValue)) {
          console.log(
            '[debug MCP] Loading data from localStorage:',
            parsedValue
          );
          return parsedValue;
        }
      }
    } catch (error) {
      console.log('[debug MCP] Error loading from localStorage:', error);
    }
    return [];
  }

  private saveToLocalStorage(data: IMcp[]): void {
    try {
      console.log('[debug MCP] Saving to localStorage:', data);
      localStorage.setItem('mcp_storage_key', JSON.stringify(data));
    } catch (error) {
      console.log('[debug MCP] Error saving to localStorage:', error);
    }
  }

  async initialize(): Promise<void> {
    // If already initialized, return immediately
    if (this.hasInitialized) {
      return;
    }

    // If currently initializing, wait for existing initialization
    if (this.isInitializing && this.initPromise) {
      console.log('[debug MCP] Waiting for existing initialization...');
      return this.initPromise;
    }

    // If dependencies not ready, skip
    if (!this.apiClient || this.config === undefined) {
      console.log(
        '[debug MCP] Skipping initialization - dependencies not ready'
      );
      return;
    }

    console.log('[debug MCP] Starting MCP storage initialization...');
    this.isInitializing = true;

    this.initPromise = (async () => {
      try {
        console.log(
          '[debug MCP] Config check: {dataPersistence:',
          this.config?.dataPersistence,
          '}'
        );

        // Check if dataPersistence is enabled
        if (this.config?.dataPersistence) {
          console.log(
            '[debug MCP] DataPersistence enabled, trying database...'
          );
          try {
            const response = await this.apiClient.getMcpStorage();
            console.log('[debug MCP] Database response:', response);

            if (Array.isArray(response)) {
              console.log('[debug MCP] Database available, setting data');
              this.isDbAvailable = true;
              this.setData(response);
              console.log('[debug MCP] Database initialization complete');
              return;
            }
          } catch (error: any) {
            console.log('[debug MCP] Database error:', error);
            this.isDbAvailable = false;
          }
        } else {
          console.log(
            '[debug MCP] DataPersistence disabled, using localStorage only'
          );
          this.isDbAvailable = false;
        }

        // If database is not available or disabled, load from localStorage
        console.log('[debug MCP] Loading from localStorage...');
        const localData = this.loadFromLocalStorage();
        this.setData(localData);
        console.log('[debug MCP] MCP storage initialization complete');
      } finally {
        this.hasInitialized = true;
        this.isInitializing = false;
      }
    })();

    return this.initPromise;
  }

  async updateStorage(newData: IMcp[]): Promise<void> {
    if (!this.hasInitialized) {
      console.log(
        '[debug MCP] Cannot update MCP storage before initialization'
      );
      return;
    }

    console.log('[debug MCP] Updating MCP storage:', {
      newDataLength: newData.length,
      isDbAvailable: this.isDbAvailable,
      dataPersistence: this.config?.dataPersistence
    });

    // Update the data immediately for UI responsiveness
    this.setData(newData);

    // Save based on persistence mode
    if (this.isDbAvailable && this.apiClient && this.config?.dataPersistence) {
      // Database mode - save to database only
      console.log('[debug MCP] Saving to database...');
      try {
        await this.apiClient.updateMcpStorage(newData);
        console.log('[debug MCP] Successfully saved to database');
      } catch (error: any) {
        console.log(
          '[debug MCP] Database save failed, falling back to localStorage:',
          error
        );
        this.isDbAvailable = false;
        this.saveToLocalStorage(newData);
      }
    } else {
      // localStorage mode - save to localStorage only
      console.log('[debug MCP] Saving to localStorage (localStorage mode)');
      this.saveToLocalStorage(newData);
    }
  }

  getStatus() {
    return {
      hasInitialized: this.hasInitialized,
      isInitializing: this.isInitializing,
      isDbAvailable: this.isDbAvailable
    };
  }

  getCurrentData(): IMcp[] {
    return this.data;
  }
}

export const useMcpStorage = () => {
  const apiClient = useContext(ChainlitContext);
  const { config } = useConfig();
  const manager = McpStorageManager.getInstance();
  const [mcpData, setMcpData] = useState<IMcp[]>([]);

  // Subscribe to manager updates
  useEffect(() => {
    const unsubscribe = manager.subscribe(setMcpData);
    return unsubscribe;
  }, [manager]);

  // Set dependencies and initialize once
  useEffect(() => {
    manager.setDependencies(apiClient, config);
    manager.initialize();
  }, [apiClient, config, manager]);

  // Update function
  const updateMcpStorage = useCallback(
    async (newDataOrUpdater: IMcp[] | ((prev: IMcp[]) => IMcp[])) => {
      const currentData = manager.getCurrentData();
      const newData =
        typeof newDataOrUpdater === 'function'
          ? newDataOrUpdater(currentData)
          : newDataOrUpdater;

      await manager.updateStorage(newData);
    },
    [manager]
  );

  const status = manager.getStatus();

  return {
    mcpData,
    updateMcpStorage,
    hasLoadedFromDatabase: status.isDbAvailable,
    isLoading: status.isInitializing
  };
};
