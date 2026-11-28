# Proposal: identity in WDK

**Status:** a proposal, with a working implementation on forks of `@tetherto/wdk` and `@tetherto/wdk-wallet`, and a
first chain implementation (Concordium) tested end to end on testnet. Nothing here is part of WDK unless the WDK team
accepts it; names and shapes are open to change.

## Summary

Some chains tie accounts to a verified identity. On Concordium, for example, an account can only be created once an
identity provider has verified the user, and a wallet can then prove facts about the user to websites (such as "over
18" or "resident in the EEA") without revealing the details themselves.

WDK has no place for this today. This proposal adds one, alongside what exists, without changing it:

- **`wdk.registerIdentity(blockchain, IdentityManager, config)`** and **`wdk.getIdentity(blockchain)`**: an
  identity manager next to the chain's wallet, built by WDK with WDK's seed.
- **`wdk.registerIdentityProtocol(blockchain, label, IdentityProtocol, ...config)`** and
  **`account.getIdentityProtocol(label)`**: proving facts to websites from an account.
- Two abstract base classes in `@tetherto/wdk-wallet`, **`IdentityManager`** and **`IdentityProtocol`**, plus
  **`IdentityError`** with chain-neutral reasons.

All changes are additive: `registerWallet`, `registerProtocol`, the six protocol kinds and their types are unchanged.

## The problem

**1. `registerProtocol` cannot hold identity.** It accepts six kinds of protocol (swap, bridge, lending, fiat,
swidge, SDA), recognised by their base class; any other class is accepted without an error and then ignored. Making
identity a protocol would need a change to WDK either way.

**2. Protocols act on an existing account; an identity comes before any account.** WDK builds a protocol as
`new Protocol(account, ...config)`: fiat buys into an account, swap swaps from one. On an identity-based chain the
order is different:

```
seed ──► verify an identity with a provider ──► identity ──► create accounts 0, 1, 2 … from it
                                                                │
                                                     "prove a fact from this account"
```

Verifying, creating the first account and recovering on a new device all happen before (or regardless of) any account,
so they cannot be account protocols. Only proving from a given account is account-level, and it needs the identity
behind that account as well as the account itself.

**3. Without a place in WDK, identity becomes a separate library, and the app hands over the seed twice:** once to
WDK, once to the identity library, outside WDK's lifecycle and disposal.

## The proposal, as an app developer sees it

```js
import WDK from '@tetherto/wdk'

const wdk = new WDK(seedPhrase)
  .registerWallet('concordium', WalletManagerConcordium, walletConfig)
  .registerIdentity('concordium', IdentityManagerConcordium, identityConfig)            // built with WDK's seed
  .registerIdentityProtocol('concordium', 'concordium-id', IdentityProtocolConcordium)

// Wallet level: no account needed
const identities = wdk.getIdentity('concordium')
const providers = await identities.getProviders()
const { url, identity } = await identities.startVerification({ provider: providers[0].id, returnUrl })
// … the user verifies on the provider's page; the app catches the return address …
await identities.completeVerification(identity, returnedUrl)
const { path } = await identities.createAccount(identity)

// Account level: like any protocol
const account = await wdk.getAccountByPath('concordium', path)
const request = await account.getIdentityProtocol('concordium-id').describeRequest(question)  // for the consent screen
const proof = await account.getIdentityProtocol('concordium-id').prove(question)

// A new device: everything back from the seed
const recovered = await wdk.getIdentity('concordium').recover()

wdk.dispose()   // disposes the identity managers too
```

## Changes in `@tetherto/wdk-wallet`

A new entry, `@tetherto/wdk-wallet/identity` (an entry of its own, as `./protocols` and `./multisig` are), and one
new protocol base class. Both follow the existing pattern: an
interface (`IIdentityManager`, `IIdentityProtocol`) and an abstract base class, documented with JSDoc; in the type
declarations the classes are `abstract` and the interfaces are `interface`, as for the existing protocols.

**`IdentityManager`** (wallet level; `src/identity/identity-manager.js`)

| Member | Returns | Meaning |
|---|---|---|
| `constructor(seed, config)` | | as `WalletManager`: a seed phrase or seed; the manager keeps its own copy of the seed |
| `getProviders()` | `IdentityProvider[]` | who can issue an identity: `{ id, name, description?, url? }` |
| `startVerification({ provider, returnUrl })` | `{ url, identity }` | the provider's page for the user to open, and a reference to the identity being issued |
| `completeVerification(identity, reply)` | `IdentitySummary` | collects the identity from the provider's reply |
| `recover()` | `IdentitySummary[]` | every identity of the seed, with its accounts |
| `createAccount(identity, options?)` | `{ path, address }` | an account from the identity; `path` is what `wdk.getAccountByPath` takes |
| `exportIdentity(identity)` / `importIdentity(exported)` | text / `IdentitySummary` | for the wallet's own secure storage (the export is sensitive, like the seed) |
| `prove(identity, request)` | presentation | proves from the identity itself, naming no account (where the chain allows it) |
| `dispose()`, `disposed`, `seed` | | implemented in the base class: `dispose()` erases the manager's copy of the seed |

`identity` is an opaque reference the manager gives out and takes back (for Concordium: a provider number and an
identity number). `IdentitySummary` carries no personal data: `{ identity, provider?, createdAt?, validTo?, accounts? }`.

**`IdentityProtocol`** (account level; `src/protocols/identity-protocol.js`, next to the six)

| Member | Returns | Meaning |
|---|---|---|
| `constructor(account, identityManager)` | | WDK passes the chain's identity manager as well as the account; a subclass may take the protocol's config after them |
| `describeRequest(request)` | `{ requester?, purpose?, asks[] }` | what a website asks, in words for the consent screen; each ask is `{ kind: 'reveal' \| 'prove', attribute, text }` |
| `prove(request)` | presentation | proves from this account (the answer names it) |

**`IdentityError`**, with a `reason` from `IdentityErrorReason`: `PROVIDER_ERROR`, `VERIFICATION_REJECTED`,
`IDENTITY_NOT_FOUND`, `IDENTITY_EXPIRED`, `ACCOUNT_LIMIT_REACHED`, `INVALID_REQUEST`, `CANNOT_PROVE`, `CHAIN_ERROR`
(the chain refused or did not confirm an operation, or could not be reached). A chain's own error is kept as the
`cause`. As for wallets, a disposed manager throws `DisposalError`, and invalid options `ValueError`.

## Changes in `@tetherto/wdk`

| Member | What it does |
|---|---|
| `registerIdentity(blockchain, IdentityManager, config)` | builds the identity manager with WDK's seed, one per blockchain (as `registerWallet`); a blockchain does not need a wallet registered for it |
| `getIdentity(blockchain)` | returns the registered identity manager; throws if there is none |
| `registerIdentityProtocol(blockchain, label, Protocol, ...config)` | registers an identity protocol class; throws if the class does not extend `IdentityProtocol` |
| `account.getIdentityProtocol(label)` | builds the protocol for the account with the blockchain's identity manager: `new Protocol(account, identityManager, ...config)` (`undefined` if none is registered: the protocol can then describe requests, not prove) |
| `dispose(blockchains?)` | also disposes and unregisters the identity managers of those blockchains |

Types: `IdentityProtocolConstructor<A>` next to `ProtocolConstructor<A>`, and `getIdentityProtocol` on
`IWalletAccountWithProtocols`.

## Design decisions

- **Identity at the wallet level, proving at the account level.** It follows the order on identity-based chains
  (problem 2). The identity manager is built like a wallet, with WDK's seed, so the app gives the seed once.
- **The identity protocol receives the identity manager.** Proving from an account needs the identity behind it,
  which the manager holds; the protocol cannot reach it otherwise.
- **A separate `registerIdentityProtocol`, not a seventh kind in `registerProtocol`.** Identity protocols take an
  extra constructor argument (the manager). Adding them to `registerProtocol` would change how `registerProtocol` is
  typed for the six existing kinds; a separate method leaves `registerProtocol` exactly as it is and makes the
  difference visible. Identity protocols are registered per blockchain, not per account, because they need the
  blockchain's identity manager.
- **The manager keeps its own copy of the seed.** WDK may hand the same `Uint8Array` to several modules; erasing the
  manager's copy on dispose does not affect the others.
- **Chain-neutral names and reasons.** Nothing in the base classes or in WDK refers to Concordium; another chain's
  identity system (for example, verifiable credentials) would implement the same two classes.
- **What stays outside WDK:** the website's side (building questions and checking answers runs on servers, not in
  wallets), and storage (the manager exports; the wallet keeps the export in its secure storage).

## Compatibility

Additive only. Existing apps, wallet modules and protocols are unaffected: no existing method, class or type changes.
WDK's existing tests pass unchanged.

## A first implementation: Concordium

The Concordium identity module (`@concordium/wdk-identity-concordium`) is built as a WDK module for these classes, the
way Tether's modules are built for theirs: `IdentityManagerConcordium` (extends `IdentityManager`) and
`IdentityProtocolConcordium` (extends `IdentityProtocol`) are its main exports and do the work themselves, and its
errors extend `IdentityError`.

- **Tests:** `@tetherto/wdk-wallet` 25 new tests (66 in all); `@tetherto/wdk` 18 new tests (74 in all); the
  Concordium implementation 18 tests through this WDK, including a proof checked with Concordium's own verifier and
  recovery on a new device. TypeScript apps using the new API compile, and TypeScript catches a missing method or a
  wrong setting.
- **Live demo on testnet:** one script does the whole journey through WDK: register, verify with Concordium's test
  provider, create an account, get it with `getAccountByPath`, describe a shop's "over 18?" question, prove it from the
  account, and the shop's check accepts it.

## Try it

The forks and branches:

- `@tetherto/wdk-wallet`: [gitrbtest/wdk-wallet, `feature/identity`](https://github.com/gitrbtest/wdk-wallet/tree/feature/identity)
- `@tetherto/wdk`: [gitrbtest/wdk, `feature/identity`](https://github.com/gitrbtest/wdk/tree/feature/identity) (its
  `package.json` points at the `wdk-wallet` branch above, for this proposal only)
- The Concordium implementation and demo: [gitrbtest/tether-wdk-concordium, `p2/22-wdk-first`](https://github.com/gitrbtest/tether-wdk-concordium/tree/p2/22-wdk-first),
  in `identity/`

To run the demo on testnet (Node.js 22; the repository's root holds the Concordium wallet module, which the demo uses
too, so both folders need installing):

```bash
git clone https://github.com/gitrbtest/tether-wdk-concordium.git
cd tether-wdk-concordium
git checkout p2/22-wdk-first
npm install                      # the Concordium wallet module (repository root)
cd identity
npm install                      # the identity package, with these WDK forks
npm run example:wdk-identity     # OPEN_BROWSER=1 opens the provider's page for you
```

Concordium's test provider shows a form that starts empty: press **Fill random test values** (made-up details; check
the date of birth is over 18, press again if not), then **Create test identity**. The demo writes to testnet:
an identity and an account (free), and the shop's question (a small testnet fee, paid by a sponsor account).

## Open questions for the WDK team

1. A separate `registerIdentity`, or should identity managers be a kind of wallet (registered with `registerWallet`)?
2. How chain-neutral should the interface be? Are the method names and the summary's fields general enough for other
   identity systems?
3. Passing the identity manager to identity protocols: acceptable, or would you prefer another way to reach it?
4. Should `describeRequest` (the consent wording) live in the protocol, or is consent the wallet app's job alone?
5. Should identity protocols also be registrable per account, like the other protocols?
6. Signers: `WalletManager` can be built from a signer instead of a seed. An identity manager needs the seed itself
   (on Concordium, the identity's secret values are worked out from it, not signed with it), so the proposal takes a
   seed only. Should an identity manager refuse a signer explicitly, or is there a signer-based design you prefer?
7. Transaction policies (`@tetherto/wdk-policies`) govern the accounts WDK hands out, through the middleware hook.
   The identity manager is not an account, so creating accounts and proving from the identity are not governed, and
   `getIdentityProtocol` is new to the policy engine. Should identity operations be governable by policies?
