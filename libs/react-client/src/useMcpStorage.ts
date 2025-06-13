import { useContext, useEffect, useRef, useCallback } from 'react';
import { useRecoilState, useRecoilCallback } from 'recoil';

import { ChainlitContext } from './context';
import { IMcp } from './types';
import { mcpState, configState } from './state';

export const useMcpStorage = () => {
  const apiClient = useContext(ChainlitContext);
  const [mcpData, setMcpData] = useRecoilState(mcpState);
  
  // Track initialization state
  const hasInitialized = useRef(false);
  const isDbAvailable = useRef(false);
  const isLoading = useRef(false);

  console.log('[debug MCP] useMcpStorage hook called:', { 
    hasInitialized: hasInitialized.current,
    mcpDataLength: mcpData.length 
  });

  // Initialize data from database if dataPersistence is enabled
  const initializeFromDatabase = useRecoilCallback(({ snapshot }) => async () => {
    if (hasInitialized.current || isLoading.current || !apiClient) {
      console.log('[debug MCP] Skipping database initialization:', { 
        hasInitialized: hasInitialized.current, 
        isLoading: isLoading.current, 
        hasApiClient: !!apiClient 
      });
      return;
    }
    
    console.log('[debug MCP] Starting database initialization...');
    isLoading.current = true;
    
    try {
      // Get config to check dataPersistence
      const config = await snapshot.getPromise(configState);
      console.log('[debug MCP] Config check:', { dataPersistence: config?.dataPersistence });
      
      if (config?.dataPersistence) {
        console.log('[debug MCP] DataPersistence enabled, trying database...');
        try {
          const response = await apiClient.getMcpStorage();
          console.log('[debug MCP] Database response:', response);

          if (Array.isArray(response)) {
            console.log('[debug MCP] Database available, setting data');
            isDbAvailable.current = true;
            setMcpData(response);
            return;
          }
        } catch (error: any) {
          console.log('[debug MCP] Database error:', error);
          // Check if it's a "Data persistence is not enabled" error
          if (error?.message?.includes('Data persistence is not enabled') || 
              error?.response?.data?.detail?.includes('Data persistence is not enabled')) {
            console.log('[debug MCP] Database not configured, using localStorage');
          } else {
            console.log('[debug MCP] Other database error, using localStorage');
          }
          isDbAvailable.current = false;
        }
      } else {
        console.log('[debug MCP] DataPersistence disabled, using localStorage only');
        isDbAvailable.current = false;
      }
    } catch (error) {
      console.log('[debug MCP] Error during database initialization:', error);
      isDbAvailable.current = false;
    } finally {
      hasInitialized.current = true;
      isLoading.current = false;
      console.log('[debug MCP] Database initialization complete');
    }
  }, [apiClient, setMcpData]);

  // Initialize on mount
  useEffect(() => {
    initializeFromDatabase();
  }, [initializeFromDatabase]);

  // Update function that handles database updates
  const updateMcpStorage = useRecoilCallback(({ snapshot }) => async (newDataOrUpdater: IMcp[] | ((prev: IMcp[]) => IMcp[])) => {
    if (!hasInitialized.current) {
      console.log('[debug MCP] Cannot update MCP storage before initialization');
      return;
    }

    // Calculate new data
    const currentData = await snapshot.getPromise(mcpState);
    const newData = typeof newDataOrUpdater === 'function' 
      ? newDataOrUpdater(currentData) 
      : newDataOrUpdater;

    console.log('[debug MCP] Updating MCP storage:', { newData, isDbAvailable: isDbAvailable.current });

    // Update the atom immediately for UI responsiveness
    // localStorage syncing is handled automatically by the atom effect
    setMcpData(newData);

    // Try to save to database if available and dataPersistence is enabled
    if (isDbAvailable.current && apiClient) {
      console.log('[debug MCP] Saving to database...');
      try {
        const config = await snapshot.getPromise(configState);
        if (config?.dataPersistence) {
          await apiClient.updateMcpStorage(newData);
          console.log('[debug MCP] Successfully saved to database');
        }
      } catch (error: any) {
        console.log('[debug MCP] Database save failed:', error);
        isDbAvailable.current = false;
        // localStorage syncing continues automatically via atom effect
      }
    } else {
      console.log('[debug MCP] Skipping database save - using localStorage only');
    }
  }, [apiClient, setMcpData]);

  return {
    mcpData,
    updateMcpStorage,
    hasLoadedFromDatabase: isDbAvailable.current,
    isLoading: isLoading.current
  };
}; 