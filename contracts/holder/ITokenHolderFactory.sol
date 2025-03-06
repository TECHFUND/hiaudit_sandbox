// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

interface ITokenHolderFactory {
    
    /**
     * @notice トークンホルダを生成する
     * @param spcAddress トークンホルダの初期管理キー
     * @param tokenHolderOwner トークンホルダを制御するownerコントラクト（STOを想定）
     * @return トークンホルダのコントラクトアドレス
     */
    function create(address spcAddress, address tokenHolderOwner) external returns (address);
}
