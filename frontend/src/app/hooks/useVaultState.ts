'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { connection } from '../lib/rpc';
import {
  VaultState,
  WhitelistEntry,
  VaultEvent,
  MOCK_VAULT_STATE,
  MOCK_WHITELIST,
  MOCK_EVENTS,
} from '../lib/idl';

const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

export function useVaultState() {
  const { publicKey } = useWallet();
  const [vaultState, setVaultState] = useState<VaultState | null>(null);
  const [userBalance, setUserBalance] = useState<number>(0);
  const [accruedYield, setAccruedYield] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVaultState = useCallback(async () => {
    if (isDemoMode) {
      setVaultState(MOCK_VAULT_STATE);
      setUserBalance(1250000);
      setAccruedYield(4250.50);
      setIsLoading(false);
      return;
    }

    if (!publicKey) {
      setVaultState(null);
      setUserBalance(0);
      setAccruedYield(0);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const vaultStateAccount = await connection.getAccountInfo(
        publicKey
      );

      if (vaultStateAccount) {
        console.log('Vault state fetched from chain:', vaultStateAccount);
      }
    } catch (err) {
      console.error('Error fetching vault state:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch vault state');
    } finally {
      setIsLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    fetchVaultState();
  }, [fetchVaultState]);

  return {
    vaultState,
    userBalance,
    accruedYield,
    isLoading,
    error,
    refetch: fetchVaultState,
    isDemoMode,
  };
}

export function useWhitelist() {
  const { publicKey } = useWallet();
  const [isWhitelisted, setIsWhitelisted] = useState<boolean | null>(null);
  const [whitelistEntry, setWhitelistEntry] = useState<WhitelistEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkWhitelist = useCallback(async () => {
    if (isDemoMode) {
      const entry = MOCK_WHITELIST.find(
        (e) => e.wallet === publicKey?.toBase58()
      );
      setIsWhitelisted(!!entry);
      setWhitelistEntry(entry || null);
      setIsLoading(false);
      return;
    }

    if (!publicKey) {
      setIsWhitelisted(null);
      setWhitelistEntry(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      console.log('Checking whitelist for:', publicKey.toBase58());
    } catch (err) {
      console.error('Error checking whitelist:', err);
    } finally {
      setIsLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    checkWhitelist();
  }, [checkWhitelist]);

  return {
    isWhitelisted,
    whitelistEntry,
    isLoading,
    refetch: checkWhitelist,
    isDemoMode,
  };
}

export function useVaultEvents(userAddress?: string) {
  const [events, setEvents] = useState<VaultEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchEvents = useCallback(async () => {
    if (isDemoMode) {
      const filteredEvents = userAddress
        ? MOCK_EVENTS.filter((e) => e.user === userAddress)
        : MOCK_EVENTS;
      setEvents(filteredEvents);
      setIsLoading(false);
      return;
    }

    if (!userAddress) {
      setEvents([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      console.log('Fetching events for:', userAddress);
    } catch (err) {
      console.error('Error fetching events:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userAddress]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return {
    events,
    isLoading,
    refetch: fetchEvents,
    isDemoMode,
  };
}

export function useDeposit() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deposit = useCallback(async (amount: number) => {
    if (isDemoMode) {
      setIsSubmitting(true);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setIsSubmitting(false);
      console.log('Demo deposit:', amount);
      return { success: true, txHash: 'demo_tx_' + Date.now() };
    }

    setIsSubmitting(true);
    setError(null);

    try {
      console.log('Executing deposit:', amount);
      return { success: true, txHash: '' };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Deposit failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const withdraw = useCallback(async (amount: number) => {
    if (isDemoMode) {
      setIsSubmitting(true);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setIsSubmitting(false);
      console.log('Demo withdraw:', amount);
      return { success: true, txHash: 'demo_tx_' + Date.now() };
    }

    setIsSubmitting(true);
    setError(null);

    try {
      console.log('Executing withdraw:', amount);
      return { success: true, txHash: '' };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Withdraw failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  return {
    deposit,
    withdraw,
    isSubmitting,
    error,
    isDemoMode,
  };
}
