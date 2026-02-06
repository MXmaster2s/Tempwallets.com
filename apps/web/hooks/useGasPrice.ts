import { useState, useEffect } from 'react';
import { walletApi } from '../lib/api';

export function useGasPrice(chain: string, refreshInterval = 30000) {
    const [gasPrice, setGasPrice] = useState<string>('--');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // If selecting all networks, or invalid chain, don't fetch
        if (!chain || chain === 'all') {
            setGasPrice('--');
            return;
        }

        let mounted = true;

        const fetchGas = async () => {
            try {
                if (mounted) setLoading(true);
                const { price } = await walletApi.getGasPrice(chain);
                if (mounted) setGasPrice(price);
            } catch (e) {
                console.error('Failed to fetch gas price', e);
                if (mounted) setGasPrice('--');
            } finally {
                if (mounted) setLoading(false);
            }
        };

        fetchGas();
        const interval = setInterval(fetchGas, refreshInterval);

        return () => {
            mounted = false;
            clearInterval(interval);
        };
    }, [chain, refreshInterval]);

    return { gasPrice, loading };
}
