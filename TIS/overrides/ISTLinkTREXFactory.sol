// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import { ITREXFactory } from "@tokenysolutions/t-rex/contracts/factory/ITREXFactory.sol";

interface ISTLinkTREXFactory is ITREXFactory {

    /**
     * @notice セキュリティトークンのアドレスを指定されたキーに関連付けて追加する
     * @param key セキュリティトークンを関連付けるSPCアドレス
     * @param securityTokenAddress 追加するセキュリティトークンのアドレス
     */
    function addSecurityToken(address key, address securityTokenAddress) external;

    /**
     * @notice 指定されたキーに関連付けられたセキュリティトークンのアドレス配列を取得する
     * @param key セキュリティトークンを取得するためのキーとなるSPCアドレス
     * @return address[] セキュリティトークンのアドレス配列
     */
    function getSecurityTokens(address key) external view returns (address[] memory);

    /**
     * @notice デプロイ時の生成キーでセキュリティトークンのアドレスを取得する
     * @param owner セキュリティトークンのownerアドレス
     * @param symbol セキュリティトークンのシンボル
     */
    function getDeployedToken(address owner, string calldata symbol) external view returns (address);
}
