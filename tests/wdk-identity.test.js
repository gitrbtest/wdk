'use strict'

import { beforeEach, describe, expect, jest, test } from '@jest/globals'

import WalletManager from '@tetherto/wdk-wallet'

import IdentityManager from '@tetherto/wdk-wallet/identity'

import { IdentityProtocol } from '@tetherto/wdk-wallet/protocols'

import WDK from '../index.js'

const SEED_PHRASE = 'cook voyage document eight skate token alien guide drink uncle term abuse'

const CONFIG = { network: 'testnet' }

class DummyWalletManager extends WalletManager {
  async getAccountByPath (path) {
    return { path, getAddress: async () => `address-${path}` }
  }

  async getAccount (index = 0) {
    return this.getAccountByPath(`0/0/${index}`)
  }
}

class DummyIdentityManager extends IdentityManager {
  async createAccount (identity) {
    return { path: '0/0/1', address: 'address-0/0/1' }
  }

  async prove (identity, request, account) {
    return { provedFrom: account ?? 'the identity', request }
  }
}

class DummyIdentityProtocol extends IdentityProtocol {
  constructor (account, identityManager, config) {
    super(account, identityManager)

    this.config = config
  }

  async prove (request) {
    return this._identityManager.prove({}, request, this._account.path)
  }
}

describe('WDK identity', () => {
  let wdk

  beforeEach(() => {
    wdk = new WDK(SEED_PHRASE)
  })

  describe('registerIdentity', () => {
    test('should create the identity manager with the WDK seed and the configuration', () => {
      const IdentityManagerMock = jest.fn().mockImplementation(() => Object.create(IdentityManager.prototype))

      wdk.registerIdentity('concordium', IdentityManagerMock, CONFIG)

      expect(IdentityManagerMock).toHaveBeenCalledWith(SEED_PHRASE, CONFIG)
    })

    test('should return the WDK, so that calls can be chained', () => {
      expect(wdk.registerIdentity('concordium', DummyIdentityManager, CONFIG)).toBe(wdk)
    })

    test('should throw if an identity manager is already registered for the blockchain', () => {
      wdk.registerIdentity('concordium', DummyIdentityManager, CONFIG)

      expect(() => wdk.registerIdentity('concordium', DummyIdentityManager, CONFIG))
        .toThrow('An identity manager is already registered for blockchain: concordium. Call dispose(["concordium"]) before re-registering.')
    })

    test('should not need a wallet for the blockchain (an identity can come before any account)', () => {
      expect(() => wdk.registerIdentity('concordium', DummyIdentityManager, CONFIG)).not.toThrow()
    })
  })

  describe('registerIdentityProtocol', () => {
    test('should return the WDK, so that calls can be chained', () => {
      expect(wdk.registerIdentityProtocol('concordium', 'concordium-id', DummyIdentityProtocol)).toBe(wdk)
    })

    test('should throw if the class is not an identity protocol', () => {
      class NotAnIdentityProtocol { }

      expect(() => wdk.registerIdentityProtocol('concordium', 'concordium-id', NotAnIdentityProtocol))
        .toThrow('The protocol must extend IdentityProtocol.')
    })
  })

  describe('getIdentity', () => {
    test('should return the identity manager registered for the blockchain', () => {
      wdk.registerIdentity('concordium', DummyIdentityManager, CONFIG)

      const identityManager = wdk.getIdentity('concordium')

      expect(identityManager).toBeInstanceOf(DummyIdentityManager)
      expect(identityManager._config).toEqual(CONFIG)
    })

    test('should throw if no identity manager is registered for the blockchain', () => {
      expect(() => wdk.getIdentity('concordium'))
        .toThrow('No identity manager registered for blockchain: concordium.')
    })
  })

  describe('getIdentityProtocol', () => {
    beforeEach(() => {
      wdk.registerWallet('concordium', DummyWalletManager, {})
        .registerIdentity('concordium', DummyIdentityManager, CONFIG)
    })

    test('should give a protocol registered on the WDK the account and the identity manager', async () => {
      wdk.registerIdentityProtocol('concordium', 'concordium-id', DummyIdentityProtocol, { strict: true })

      const account = await wdk.getAccountByPath('concordium', '0/0/1')

      const protocol = account.getIdentityProtocol('concordium-id')

      expect(protocol).toBeInstanceOf(DummyIdentityProtocol)
      expect(protocol._account).toBe(account)
      expect(protocol._identityManager).toBe(wdk.getIdentity('concordium'))
      expect(protocol.config).toEqual({ strict: true })
    })

    test('should not take identity protocols through registerProtocol (it keeps its six kinds)', async () => {
      wdk.registerProtocol('concordium', 'concordium-id', DummyIdentityProtocol)

      const account = await wdk.getAccount('concordium', 2)

      account.registerProtocol('concordium-id', DummyIdentityProtocol)

      expect(() => account.getIdentityProtocol('concordium-id'))
        .toThrow('No identity protocol registered for label: concordium-id.')
    })

    test('should prove from the account, through the identity manager', async () => {
      wdk.registerIdentityProtocol('concordium', 'concordium-id', DummyIdentityProtocol)

      const account = await wdk.getAccountByPath('concordium', '0/0/1')

      await expect(account.getIdentityProtocol('concordium-id').prove({ ask: 'over 18' }))
        .resolves.toEqual({ provedFrom: '0/0/1', request: { ask: 'over 18' } })
    })

    test('should throw if no identity protocol is registered with the label', async () => {
      const account = await wdk.getAccountByPath('concordium', '0/0/1')

      expect(() => account.getIdentityProtocol('concordium-id'))
        .toThrow('No identity protocol registered for label: concordium-id.')
    })

    test('should keep identity protocols apart from the other kinds', async () => {
      wdk.registerIdentityProtocol('concordium', 'concordium-id', DummyIdentityProtocol)

      const account = await wdk.getAccountByPath('concordium', '0/0/1')

      expect(() => account.getSwapProtocol('concordium-id'))
        .toThrow('No swap protocol registered for label: concordium-id.')
    })

    test('should give the protocol no identity manager when none is registered for the blockchain', async () => {
      const other = new WDK(SEED_PHRASE).registerWallet('concordium', DummyWalletManager, {})
        .registerIdentityProtocol('concordium', 'concordium-id', DummyIdentityProtocol)

      const account = await other.getAccountByPath('concordium', '0/0/1')

      expect(account.getIdentityProtocol('concordium-id')._identityManager).toBeUndefined()
    })
  })

  describe('the whole journey', () => {
    test('should create an account from the identity, get it through the WDK, and prove from it', async () => {
      wdk.registerWallet('concordium', DummyWalletManager, {})
        .registerIdentity('concordium', DummyIdentityManager, CONFIG)
        .registerIdentityProtocol('concordium', 'concordium-id', DummyIdentityProtocol)

      const { path } = await wdk.getIdentity('concordium').createAccount({ id: 'identity-0' })

      const account = await wdk.getAccountByPath('concordium', path)

      await expect(account.getIdentityProtocol('concordium-id').prove({ ask: 'resident in the EEA' }))
        .resolves.toEqual({ provedFrom: path, request: { ask: 'resident in the EEA' } })
    })
  })

  describe('dispose', () => {
    test('should dispose and unregister the identity managers', () => {
      wdk.registerIdentity('concordium', DummyIdentityManager, CONFIG)

      const identityManager = wdk.getIdentity('concordium')

      wdk.dispose()

      expect(identityManager.disposed).toBe(true)
      expect(() => wdk.getIdentity('concordium')).toThrow('No identity manager registered for blockchain: concordium.')
    })

    test('should only dispose the identity managers of the given blockchains', () => {
      wdk.registerIdentity('concordium', DummyIdentityManager, CONFIG)
        .registerIdentity('other', DummyIdentityManager, CONFIG)

      const other = wdk.getIdentity('other')

      wdk.dispose(['concordium'])

      expect(other.disposed).toBe(false)
      expect(() => wdk.getIdentity('concordium')).toThrow()
    })

    test('should allow registering an identity manager again after disposal', () => {
      wdk.registerIdentity('concordium', DummyIdentityManager, CONFIG)

      wdk.dispose(['concordium'])

      expect(() => wdk.registerIdentity('concordium', DummyIdentityManager, CONFIG)).not.toThrow()
    })
  })
})
