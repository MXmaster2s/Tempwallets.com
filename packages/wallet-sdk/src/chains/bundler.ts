/**
 * Bundler client for sending user operations to ERC-4337 bundlers
 */
export class BundlerClient {
  constructor(private url: string) {}

  /**
   * Send a user operation to the bundler
   * @param userOp - The user operation to send
   * @returns The result from the bundler
   */
  async sendUserOperation(userOp: unknown): Promise<any> {
    try {
      const response = await fetch(`${this.url}/eth_sendUserOperation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_sendUserOperation',
          params: [userOp],
          id: Date.now(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Bundler request failed: ${response.statusText}`);
      }

      const result = await response.json();
      if (result.error) {
        throw new Error(`Bundler error: ${result.error.message}`);
      }

      return result.result;
    } catch (error) {
      throw new Error(`Failed to send user operation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

