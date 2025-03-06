// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import { TokenHolder } from "./TokenHolder.sol";
import { ITokenHolderFactory } from "./ITokenHolderFactory.sol";
import { AbstractUpgradeable } from "../common/AbstractUpgradeable.sol";

contract TokenHolderFactory is ITokenHolderFactory, AbstractUpgradeable {

    /**
     * @notice 初期化処理
     * @dev Openzeppelin準拠のUpgradeable用function
     */
    function initialize() external initializer {
        __AbstractUpgradeable_init();
    }

    /**
     * @notice トークンホルダを生成する
     * @param spcAddress トークンホルダの初期管理キー
     * @param tokenHolderOwner トークンホルダを制御するownerコントラクト（STOを想定）
     * @return トークンホルダのコントラクトアドレス
     */
    function create(address spcAddress, address tokenHolderOwner) external virtual returns (address) {
        TokenHolder holder = new TokenHolder();
        holder.initialize(spcAddress);
        holder.transferOwnership(tokenHolderOwner);
        return address(holder);
    }
}
