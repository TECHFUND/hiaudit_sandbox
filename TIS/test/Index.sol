// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import { ClaimIssuer } from "@onchain-id/solidity/contracts/ClaimIssuer.sol";
import { DefaultCompliance } from "@tokenysolutions/t-rex/contracts/compliance/legacy/DefaultCompliance.sol";
import { ModularCompliance } from "@tokenysolutions/t-rex/contracts/compliance/modular/ModularCompliance.sol";
import { CountryAllowModule } from "@tokenysolutions/t-rex/contracts/compliance/modular/modules/CountryAllowModule.sol";
import { TREXFactory } from "@tokenysolutions/t-rex/contracts/factory/TREXFactory.sol";
import { TREXGateway } from "@tokenysolutions/t-rex/contracts/factory/TREXGateway.sol";
import { ClaimTopicsRegistryProxy } from "@tokenysolutions/t-rex/contracts/proxy/ClaimTopicsRegistryProxy.sol";
import { IdentityRegistryStorageProxy } from "@tokenysolutions/t-rex/contracts/proxy/IdentityRegistryStorageProxy.sol";
import { ModularComplianceProxy } from "@tokenysolutions/t-rex/contracts/proxy/ModularComplianceProxy.sol";
import { TrustedIssuersRegistryProxy } from "@tokenysolutions/t-rex/contracts/proxy/TrustedIssuersRegistryProxy.sol";
import { ClaimTopicsRegistry } from "@tokenysolutions/t-rex/contracts/registry/implementation/ClaimTopicsRegistry.sol";
import { IdentityRegistry } from "@tokenysolutions/t-rex/contracts/registry/implementation/IdentityRegistry.sol";
import { IdentityRegistryStorage } from "@tokenysolutions/t-rex/contracts/registry/implementation/IdentityRegistryStorage.sol";
import { TrustedIssuersRegistry } from "@tokenysolutions/t-rex/contracts/registry/implementation/TrustedIssuersRegistry.sol";
import { AgentManager } from "@tokenysolutions/t-rex/contracts/roles/permissioning/agent/AgentManager.sol";
import { IToken } from "@tokenysolutions/t-rex/contracts/token/IToken.sol";
import { Token } from "@tokenysolutions/t-rex/contracts/token/Token.sol";
import { IdentityRegistryProxy } from "@tokenysolutions/t-rex/contracts/proxy/IdentityRegistryProxy.sol";
import { TokenProxy } from "@tokenysolutions/t-rex/contracts/proxy/TokenProxy.sol";
import { TREXImplementationAuthority } from "@tokenysolutions/t-rex/contracts/proxy/authority/TREXImplementationAuthority.sol";

/*
 * 単体テストTypeChain用ダミーコントラクト
 */
// solhint-disable-next-line no-empty-blocks
interface Index {
}
