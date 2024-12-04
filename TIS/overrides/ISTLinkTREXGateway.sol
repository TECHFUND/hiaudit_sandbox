// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import { ITREXGateway } from "@tokenysolutions/t-rex/contracts/factory/ITREXGateway.sol";

interface ISTLinkTREXGateway is ITREXGateway {

    /**
     * @notice TREXにおけるセキュリティトークンのデプロイスイートの実行
     * @param symbol トークンシンボル
     * @param spcAddress セキュリティトークン発行体のウォレットアドレス
     * @param agentsArrayBase トークン実行のエージェント（配列）
     * @return newSecurityTokenAddress デプロイしたセキュリティトークンのコントラクトアドレス
     */
    function deploySTLinkTREXSuite(string calldata symbol, address spcAddress, address[] calldata agentsArrayBase
            ) external returns (address newSecurityTokenAddress);

    /**
     * @notice STOを登録するコントラクトのアドレスを設定する
     * @param stoRegistry STOを登録するコントラクトのアドレス
     */
    function setStoRegistry(address stoRegistry) external;

    /**
     * @notice STOを登録するコントラクトのアドレスを取得する
     * @return STOを登録するコントラクトのアドレス
     */
    function stoRegistry() external view returns (address);

    /**
     * @notice トークンホルダを生成するコントラクトのアドレスを設定する
     * @param tokenHolderFactory トークンホルダを生成するコントラクトのアドレス
     */
    function setTokenHolderFactory(address tokenHolderFactory) external;

    /**
     * @notice トークンホルダを生成するコントラクトのアドレスを取得する
     * @return トークンホルダを生成するコントラクトのアドレス
     */
    function tokenHolderFactory() external view returns (address);
}
