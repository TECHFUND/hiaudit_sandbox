// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.17;

// [openzeppelin] upgradeable:"UUPS Pattern"
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

// [openzeppelin] security:access control (requires ^0.8.0)
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

// [openzeppelin] security:emergency pause
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";

/**
 * @title AbstractUpgradeable
 * @notice OpenzeppelinのUpgradeable対応向け汎用コントラクト
 */
abstract contract AbstractUpgradeable is
    UUPSUpgradeable,
    PausableUpgradeable,
    OwnableUpgradeable
{
    //// 【初期化関連】
    /**
     * @notice 初期化処理（継承コントラクト）
     * @dev 初期化時のみ呼出可能
     */
    // solhint-disable-next-line func-name-mixedcase
    function __AbstractUpgradeable_init() internal onlyInitializing {
        __Context_init();
        __UUPSUpgradeable_init();
        __Pausable_init();
        __Ownable_init();

        __AbstractUpgradeable_init_unchained();
    }

    /**
     * @notice 初期化処理（unchained）
     * @dev 初期化時のみ呼出可能
     */
    // solhint-disable-next-line func-name-mixedcase, no-empty-blocks
    function __AbstractUpgradeable_init_unchained() internal onlyInitializing {
        // NOP
    }

    // 【一時停止関連】
    /**
    * @notice 当コントラクトの一時停止
    * @dev 要Owner権限
    */
    function pause() public virtual onlyOwner {
        _pause();
    }

    /**
    * @notice 当コントラクトの一時停止解除
    * @dev 要Owner権限
    */
    function unpause() public virtual onlyOwner {
        _unpause();
    }

    /**
    * @notice 当コントラクトの更新権限判定
    * @dev 要Owner権限
    */
    // solhint-disable-next-line no-empty-blocks
    function _authorizeUpgrade(address) internal override virtual onlyOwner {
        // NOP:UUPS向け onlyOwner 指定用
    }
}
