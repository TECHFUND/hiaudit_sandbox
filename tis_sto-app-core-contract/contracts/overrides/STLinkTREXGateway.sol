// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import { TREXGateway } from "@tokenysolutions/t-rex/contracts/factory/TREXGateway.sol";
import { ITREXFactory } from "@tokenysolutions/t-rex/contracts/factory/ITREXFactory.sol";

import { LibString } from "solady/src/utils/LibString.sol";
import { IStoRegistry } from "../sto/IStoRegistry.sol";
import { ISTLinkTREXGateway } from "./ISTLinkTREXGateway.sol";
import { ISTLinkTREXFactory } from "./ISTLinkTREXFactory.sol";

error InvalidTrexFactoryAddress(address trexFactory);
error InvalidStoRegistryAddress(address stoRegistry);
error InvalidTokenHolderFactoryAddress(address tokenHolderFactory);

contract STLinkTREXGateway is ISTLinkTREXGateway, TREXGateway {

    // STOを生成・登録するレジストリ
    address public stoRegistry;

    // トークンホルダを生成するファクトリ
    address public tokenHolderFactory;

    /**
     * @notice TREXGatewayでの管理対象にレジストリを追加したコンストラクタ
     * @param trexFactory_ TREXファクトリのコントラクトアドレス
     * @param stoRegistry_ STOレジストリのコントラクトアドレス
     * @param tokenHolderFactory_ トークンホルダファクトリのコントラクトアドレス
     * @param publicDeploymentStatus_ パブリックデプロイメントのステータス
     */
    constructor(address trexFactory_, address stoRegistry_, address tokenHolderFactory_, bool publicDeploymentStatus_)
            TREXGateway(trexFactory_, publicDeploymentStatus_) {
        if (trexFactory_ == address(0)) {
            revert InvalidTrexFactoryAddress(trexFactory_);
        }
        if (stoRegistry_ == address(0)) {
            revert InvalidStoRegistryAddress(stoRegistry_);
        }
        if (tokenHolderFactory_ == address(0)) {
            revert InvalidTokenHolderFactoryAddress(tokenHolderFactory_);
        }
        stoRegistry = stoRegistry_;
        tokenHolderFactory = tokenHolderFactory_;
    }

    /**
     * @notice TREXにおけるセキュリティトークンのデプロイスイートの実行
     * @param symbol トークンシンボル
     * @param spcAddress セキュリティトークン発行体のウォレットアドレス
     * @param agentsArrayBase トークン実行のエージェント（配列）
     */
    function deploySTLinkTREXSuite(string calldata symbol, address spcAddress, address[] calldata agentsArrayBase
            ) external virtual returns (address newSecurityTokenAddress) {
        string memory upperSymbol = LibString.upper(symbol);

        // レジストリで管理用STOを生成
        IStoRegistry stoRegistryContract = IStoRegistry(stoRegistry);
        address adminSto = stoRegistryContract.createSto(symbol, spcAddress);

        // 生成したSTOを、これから生成するセキュリティトークンのエージェントとして登録
        address[] memory agentsArray = new address[](agentsArrayBase.length + 1);
        for (uint256 i = 0; i < agentsArrayBase.length;) {
            agentsArray[i] = agentsArrayBase[i];
            unchecked { i++; }
        }
        agentsArray[agentsArrayBase.length] = adminSto;

        // セキュリティトークンのデプロイに必要な詳細項目
        ITREXFactory.TokenDetails memory tokenDetails = ITREXFactory.TokenDetails({
            owner: spcAddress,
            name: upperSymbol,
            symbol: upperSymbol,
            decimals: 18,
            irs: address(0),                        // TREXFactory内でトークン単位のIdentityRegistryStorageとして新規にデプロイ
            ONCHAINID: spcAddress,                  // ONCHAINID of the token
            irAgents: agentsArray,                  // list of agents of the identity registry (can be set to an AgentManager contract)
            tokenAgents: agentsArray,               // list of agents of the token
            complianceModules: new address[](0),    // modules to bind to the compliance, indexes are corresponding to the settings callData indexes
            complianceSettings: new bytes[](0)      // settings calls for compliance modules
        });

        // クレームとその発行体に関する詳細項目（不使用のため空設定）
        ITREXFactory.ClaimDetails memory claimDetails = ITREXFactory.ClaimDetails({
                claimTopics: new uint256[](0),
                issuers: new address[](0),
                issuerClaims: new uint256[][](0)
        });
        // セキュリティトークンのデプロイ
        deployTREXSuite(tokenDetails, claimDetails);

        // デプロイしたセキュリティトークンの取得
        ISTLinkTREXFactory trexFactory = ISTLinkTREXFactory(this.getFactory());
        newSecurityTokenAddress = trexFactory.getDeployedToken(spcAddress, upperSymbol);

        // セキュリティトークンをSPCに紐付け
        trexFactory.addSecurityToken(spcAddress, newSecurityTokenAddress);
    }

    /**
     * @notice STOを登録するコントラクトのアドレスを設定する
     * @param stoRegistry_ STOを登録するコントラクトのアドレス
     */
    function setStoRegistry(address stoRegistry_) external virtual onlyOwner {
        if (stoRegistry_ == address(0)) {
            revert InvalidStoRegistryAddress(stoRegistry_);
        }
        stoRegistry = stoRegistry_;
    }

    /**
     * @notice トークンホルダを生成するコントラクトのアドレスを設定する
     * @param tokenHolderFactory_ トークンホルダを生成するコントラクトのアドレス
     */
    function setTokenHolderFactory(address tokenHolderFactory_) external virtual onlyOwner {
        if (tokenHolderFactory_ == address(0)) {
            revert InvalidTokenHolderFactoryAddress(tokenHolderFactory_);
        }
        tokenHolderFactory = tokenHolderFactory_;
    }
}
