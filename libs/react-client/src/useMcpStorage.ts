import { useContext, useEffect, useRef, useCallback } from 'react';
import { useRecoilState } from 'recoil';

import { ChainlitContext } from './context';
import { IMcp } from './types';
import { mcpState } from './state';
import { useConfig } from './useConfig';

export const useMcpStorage = () => {
  const apiClient = useContext(ChainlitContext);
  const [mcpData, setMcpData] = useRecoilState(mcpState);
  const { config } = useConfig();
  
  // Track initialization state
  const hasInitialized = useRef(false);
  const isDbAvailable = useRef(false);
  const isLoading = useRef(false);

  console.log('[debug MCP] useMcpStorage hook called:', { 
    dataPersistence: config?.dataPersistence, 
    hasInitialized: hasInitialized.current,
    mcpDataLength: mcpData.length 
  });

  // Initialize data on first mount
  useEffect(() => {
    const initializeData = async () => {
      if (hasInitialized.current || isLoading.current || !apiClient) {
        console.log('[debug MCP] Skipping initialization:', { 
          hasInitialized: hasInitialized.current, 
          isLoading: isLoading.current, 
          hasApiClient: !!apiClient 
        });
        return;
      }
      
      console.log('[debug MCP] Starting MCP storage initialization...');
      isLoading.current = true;
      
      try {
        // Check if dataPersistence is enabled
        if (config?.dataPersistence) {
          console.log('[debug MCP] DataPersistence enabled, trying database...');
          // Try to load from database
          try {
            const response = await apiClient.getMcpStorage();
            console.log('[debug MCP] Database response:', response);

            if (Array.isArray(response)) {
              // Database is available and working
              console.log('[debug MCP] Database available, setting data and marking DB as available');
              isDbAvailable.current = true;
              setMcpData(response);
              return;
            }
          } catch (error: any) {
            console.log('[debug MCP] Database error:', error);
            // Check if it's a "Data persistence is not enabled" error
            if (error?.message?.includes('Data persistence is not enabled') || 
                error?.response?.data?.detail?.includes('Data persistence is not enabled')) {
              // Database is not configured, fall back to localStorage
              console.log('[debug MCP] Database not configured, falling back to localStorage');
              isDbAvailable.current = false;
            } else {
              // Other database error, fall back to localStorage
              console.log('[debug MCP] Other database error, falling back to localStorage');
              isDbAvailable.current = false;
            }
          }
        } else {
          console.log('[debug MCP] DataPersistence disabled, localStorage will be handled by atom effect');
        }
        
        // If dataPersistence is false, don't load from localStorage here
        // The atom effect will handle localStorage automatically
        // Only load from localStorage if database failed and we need fallback data
        if (config?.dataPersistence && !isDbAvailable.current) {
          console.log('[debug MCP] Database failed, loading fallback from localStorage...');
          try {
            const savedValue = localStorage.getItem('mcp_storage_key');
            console.log('[debug MCP] localStorage value:', savedValue);
            if (savedValue) {
              const parsedValue = JSON.parse(savedValue);
              if (Array.isArray(parsedValue)) {
                console.log('[debug MCP] Setting fallback data from localStorage:', parsedValue);
                setMcpData(parsedValue);
              }
            }
          } catch (localError) {
            console.log('[debug MCP] localStorage error:', localError);
          }
        } else if (!config?.dataPersistence) {
          console.log('[debug MCP] DataPersistence disabled - atom effect will handle localStorage loading');
        }
      } finally {
        hasInitialized.current = true;
        isLoading.current = false;
        console.log('[debug MCP] MCP storage initialization complete');
      }
    };

    initializeData();
  }, [apiClient, setMcpData, config?.dataPersistence]);

  // Update function that handles database updates
  // localStorage syncing is handled automatically by the atom effect
  const updateMcpStorage = useCallback(async (newDataOrUpdater: IMcp[] | ((prev: IMcp[]) => IMcp[])) => {
    if (!hasInitialized.current) {
      console.log('[debug MCP] Cannot update MCP storage before initialization');
      return;
    }

    // Calculate new data
    const newData = typeof newDataOrUpdater === 'function' 
      ? newDataOrUpdater(mcpData) 
      : newDataOrUpdater;

    console.log('[debug MCP] Updating MCP storage:', { newData, isDbAvailable: isDbAvailable.current, dataPersistence: config?.dataPersistence });

    // Update the atom immediately for UI responsiveness
    // The atom effect will automatically handle localStorage syncing if dataPersistence is false
    setMcpData(newData);

    // Only try to save to database if available and dataPersistence is enabled
    if (isDbAvailable.current && apiClient && config?.dataPersistence) {
      console.log('[debug MCP] Saving to database...');
      try {
        await apiClient.updateMcpStorage(newData);
        console.log('[debug MCP] Successfully saved to database');
      } catch (error: any) {
        // Database error, mark as unavailable
        // The atom effect will automatically fall back to localStorage syncing
        console.log('[debug MCP] Database save failed:', error);
        isDbAvailable.current = false;
      }
    } else {
      console.log('[debug MCP] Skipping database save - relying on atom effect for localStorage');
    }
    // Note: localStorage syncing is handled automatically by the atom effect
  }, [mcpData, setMcpData, apiClient, config?.dataPersistence]);

  return {
    mcpData,
    updateMcpStorage,
    hasLoadedFromDatabase: isDbAvailable.current,
    isLoading: isLoading.current
  };
}; 