export default class WDK {
    /**
     * Returns a random BIP-39 seed phrase.
     *
     * @param {12 | 24} [wordCount] - The number of words to include in the seed phrase (default: 12).
     * @returns {string} The seed phrase.
     */
    static getRandomSeedPhrase(wordCount?: 12 | 24): string;
    /**
     * Checks if a seed is valid.
     *
     * @param {string | Uint8Array} seed - The seed.
     * @returns {boolean} True if the seed is valid.
     */
    static isValidSeed(seed: string | Uint8Array): boolean;
    /**
     * Creates a new WDK.
     *
     * @param {string | Uint8Array} seed - A BIP-39 mnemonic seed phrase, or a raw BIP-32 master seed (16-64 bytes).
     * @throws {Error} If the seed is not valid.
     */
    constructor(seed: string | Uint8Array);
    /** @private */
    private _seed;
    /** @private */
    private _wallets;
    /** @private */
    private _identities;
    /** @private */
    private _protocols;
    /** @private */
    private _middlewares;
    /** @private */
    private _decoratedAccounts;
    /** @private */
    private _accountPaths;
    /**
     * Registers a new wallet to the WDK.
     *
     * @template {typeof WalletManager} W
     * @param {string} blockchain - The name of the blockchain the wallet must be bound to. Can be any string (e.g., "ethereum").
     * @param {W} WalletManager - The wallet manager class.
     * @param {ConstructorParameters<W>[1]} config - The configuration object.
     * @returns {WDK} The WDK.
     * @throws {Error} If a wallet is already registered for the given blockchain.
     */
    registerWallet<W extends typeof WalletManager>(blockchain: string, WalletManager: W, config: ConstructorParameters<W>[1]): WDK;
    /**
     * Registers a new identity manager to the WDK.
     *
     * An identity manager sits next to the blockchain's wallet and receives the same seed: it verifies the user's
     * identity with an identity provider, creates accounts from it, and finds both again from the seed. The blockchain's
     * identity protocols (see {@link registerIdentityProtocol}) receive it, to prove facts from an account.
     *
     * @template {typeof IdentityManager} I
     * @param {string} blockchain - The name of the blockchain the identity manager must be bound to. Can be any string (e.g., "concordium").
     * @param {I} IdentityManager - The identity manager class.
     * @param {ConstructorParameters<I>[1]} config - The configuration object.
     * @returns {WDK} The WDK.
     * @throws {Error} If an identity manager is already registered for the given blockchain.
     */
    registerIdentity<I extends typeof IdentityManager>(blockchain: string, IdentityManager: I, config: ConstructorParameters<I>[1]): WDK;
    /**
     * Returns the identity manager registered for a specific blockchain.
     *
     * @param {string} blockchain - The name of the blockchain (e.g., "concordium").
     * @returns {IIdentityManager} The identity manager.
     * @throws {Error} If no identity manager has been registered for the given blockchain.
     */
    getIdentity(blockchain: string): IIdentityManager;
    /**
     * Registers a new protocol to the WDK.
     *
     * The label must be unique in the scope of the blockchain and the type of protocol (i.e., there can't be two protocols of the
     * same type bound to the same blockchain with the same label).
     *
     * @see {@link IWalletAccountWithProtocols#registerProtocol} to register protocols only for specific accounts.
     * @template {any[]} A
     * @param {string} blockchain - The name of the blockchain the protocol must be bound to. Can be any string (e.g., "ethereum").
     * @param {string} label - The label.
     * @param {ProtocolConstructor<A>} Protocol - The protocol class.
     * @param {NoInfer<A>} config - The protocol configuration.
     * @returns {WDK} The WDK.
     */
    registerProtocol<A extends any[]>(blockchain: string, label: string, Protocol: ProtocolConstructor<A>, ...config: NoInfer<A>): WDK;
    /**
     * Registers a new identity protocol to the WDK: proving facts to websites from an account. Each identity protocol the
     * WDK builds for an account also receives the blockchain's identity manager (see {@link registerIdentity}), which
     * holds the account's identity.
     *
     * The label must be unique in the scope of the blockchain.
     *
     * @template {any[]} A
     * @param {string} blockchain - The name of the blockchain the protocol must be bound to. Can be any string (e.g., "concordium").
     * @param {string} label - The label.
     * @param {IdentityProtocolConstructor<A>} Protocol - The identity protocol class.
     * @param {NoInfer<A>} config - The protocol configuration.
     * @returns {WDK} The WDK.
     * @throws {Error} If the class is not an identity protocol.
     */
    registerIdentityProtocol<A extends any[]>(blockchain: string, label: string, Protocol: IdentityProtocolConstructor<A>, ...config: NoInfer<A>): WDK;
    /**
     * Registers a new middleware to the WDK.
     *
     * It's possible to register multiple middlewares for the same blockchain, which will be called sequentially, after
     * the account's protocol getters are attached. A middleware may return a replacement account: the next middleware,
     * and finally the caller of `getAccount` or `getAccountByPath`, receive the replacement instead of the original.
     *
     * @param {string} blockchain - The name of the blockchain the middleware must be bound to. Can be any string (e.g., "ethereum").
     * @param {MiddlewareFunction} middleware - A callback function that is called each time the user derives a new account.
     * @returns {WDK} The WDK.
     */
    registerMiddleware(blockchain: string, middleware: MiddlewareFunction): WDK;
    /**
     * Returns the wallet account for a specific blockchain and index (see BIP-44).
     *
     * @param {string} blockchain - The name of the blockchain (e.g., "ethereum").
     * @param {number} [index] - The index of the account to get (default: 0).
     * @returns {Promise<WdkAccount>} The account, or the replacement the last middleware that returned one produced.
     * @throws {Error} If no wallet has been registered for the given blockchain.
     */
    getAccount(blockchain: string, index?: number): Promise<WdkAccount>;
    /**
     * Returns the wallet account for a specific blockchain and BIP-44 derivation path.
     *
     * @param {string} blockchain - The name of the blockchain (e.g., "ethereum").
     * @param {string} path - The derivation path (e.g., "0'/0/0").
     * @returns {Promise<WdkAccount>} The account, or the replacement the last middleware that returned one produced.
     * @throws {Error} If no wallet has been registered for the given blockchain.
     */
    getAccountByPath(blockchain: string, path: string): Promise<WdkAccount>;
    /**
     * Returns the current fee rates for a specific blockchain.
     *
     * @param {string} blockchain - The name of the blockchain (e.g., "ethereum").
     * @returns {Promise<FeeRates>} The fee rates (in base unit).
     * @throws {Error} If no wallet has been registered for the given blockchain.
     */
    getFeeRates(blockchain: string): Promise<FeeRates>;
    /**
     * Disposes and unregisters wallets and identity managers, calling each one's `dispose` method (the module documents
     * what it clears). The WDK keeps its seed, so they can be registered again after disposal. A seed phrase passed as a
     * string cannot be wiped: it stays in memory until it is garbage collected.
     * If no blockchains are specified, all registered wallets and identity managers are disposed.
     * @param {string[]} [blockchains] - The blockchains to dispose. If omitted, all wallets and identity managers are disposed.
     */
    dispose(blockchains?: string[]): void;
    /** @private */
    private _getAccountPath;
    /** @private */
    private _runMiddlewares;
    /** @private */
    private _registerProtocols;
}
export type IWalletAccount = import("@tetherto/wdk-wallet").IWalletAccount;
export type FeeRates = import("@tetherto/wdk-wallet").FeeRates;
export type IIdentityManager = import("@tetherto/wdk-wallet/identity").IIdentityManager;
export type IdentityProtocolConstructor<A extends any[]> = import("./wallet-account-with-protocols.js").IdentityProtocolConstructor<A>;
export type IWalletAccountWithProtocols = import("./wallet-account-with-protocols.js").IWalletAccountWithProtocols;
export type ProtocolConstructor<A extends any[]> = import("./wallet-account-with-protocols.js").ProtocolConstructor<A>;
/**
 * The shape returned by `getAccount` / `getAccountByPath`: the underlying
 * IWalletAccount (sendTransaction, signTransaction, transfer, approve,
 * sign, …) plus the protocol-getter surface added by the WDK at account
 * retrieval time. Concrete wallet packages may further extend this shape.
 */
export type WdkAccount = IWalletAccount & IWalletAccountWithProtocols;
/**
 * Where an account came from, passed to every middleware alongside the account.
 */
export type MiddlewareContext = {
    /**
     * - The wallet identifier the account was retrieved from, as passed to `registerWallet`.
     */
    blockchain: string;
    /**
     * - The account index, when the account was retrieved with `getAccount`.
     */
    index?: number;
    /**
     * - The account's full derivation path, or null if the account is not bound to a BIP-44 position.
     */
    path: string | null;
};
/**
 * A function called each time an account is retrieved. It may return a replacement account (for example a wrapper that
 * governs the account's methods), which subsequent middlewares and the caller then receive; returning nothing keeps the
 * account as it is.
 */
export type MiddlewareFunction = <A extends IWalletAccount>(account: A, context: MiddlewareContext) => Promise<IWalletAccount | void>;
import WalletManager from '@tetherto/wdk-wallet';
import IdentityManager from '@tetherto/wdk-wallet/identity';
import { SwapProtocol } from '@tetherto/wdk-wallet/protocols';
import { BridgeProtocol } from '@tetherto/wdk-wallet/protocols';
import { LendingProtocol } from '@tetherto/wdk-wallet/protocols';
import { FiatProtocol } from '@tetherto/wdk-wallet/protocols';
import { SwidgeProtocol } from '@tetherto/wdk-wallet/protocols';
import { SdaProtocol } from '@tetherto/wdk-wallet/protocols';
