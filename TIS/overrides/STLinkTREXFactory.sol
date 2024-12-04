// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import { TREXFactory } from "@tokenysolutions/t-rex/contracts/factory/TREXFactory.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";

import { ISTLinkTREXFactory } from "./ISTLinkTREXFactory.sol";

contract STLinkTREXFactory is ISTLinkTREXFactory, TREXFactory {

    // SPCアドレスに関連付けたセキュリティトークンのコントラクトアドレスのリスト
    mapping(address => address[]) internal securityTokens;

    /**
     * @notice コンストラクタ
     * @param implementationAuthority_ 実装オーソリティのアドレス
     * @param idFactory_ IDファクトリのアドレス
     */
    constructor(address implementationAuthority_, address idFactory_) 
        TREXFactory(implementationAuthority_, idFactory_) {
        // NOP:0アドレスチェック等は親コントラクトで実施
    }

    /**
     * @notice セキュリティトークンのアドレスを指定されたキーに関連付けて追加する
     * @param key セキュリティトークンを関連付けるSPCアドレス
     * @param securityTokenAddress 追加するセキュリティトークンのアドレス
     */
    function addSecurityToken(address key, address securityTokenAddress) external virtual {
        securityTokens[key].push(securityTokenAddress);
    }

    /**
     * @notice 指定されたキーに関連付けられたセキュリティトークンのアドレス配列を取得する
     * @param key セキュリティトークンを取得するためのキーとなるSPCアドレス
     * @return address[] セキュリティトークンのアドレス配列
     */
    function getSecurityTokens(address key) external virtual view returns (address[] memory) {
        return securityTokens[key];
    }

    /**
     * @notice セキュリティトークンデプロイ時の生成キーでセキュリティトークンのアドレスを取得する
     * @param owner セキュリティトークンのownerアドレス
     * @param symbol セキュリティトークンのシンボル
     */
    function getDeployedToken(address owner, string calldata symbol) external virtual view returns (address) {
        return tokenDeployed[string(abi.encodePacked(Strings.toHexString(owner), symbol))];
    }
}
