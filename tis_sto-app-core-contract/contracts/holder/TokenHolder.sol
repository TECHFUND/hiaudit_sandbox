// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import { Identity } from "@onchain-id/solidity/contracts/Identity.sol";
import { IIdentity } from "@onchain-id/solidity/contracts/interface/IIdentity.sol";

import { AbstractUpgradeable } from "../common/AbstractUpgradeable.sol";
import { ITokenHolder } from "./ITokenHolder.sol";

error NonAuthorizedSender(address senderAddress);
error InvalidSpcAddress(address spcAddress);

/**
 * @notice 前身のPolymathとの互換機能。ERC3643のIdentityとは別枠でST-LINK独自の属性を管理する。
 * @dev ERC3643化に伴い不要化したパラメータも、互換確認のためコメントとして残す。
 */
contract TokenHolder is ITokenHolder, AbstractUpgradeable {
    // ホールド対象のトークンシンボル
    string public symbol;
    // 権限管理用アドレス（SPCアドレス）
    address public spcAddress;
    // トークンホルダのウォレットアドレス
    address public walletAddress;
    // トークンを受け取ることができるようになる日時（UNIXタイムスタンプ）
    uint64 public timeCanReceiveAfter;
    // トークンを移転できるようになる日時（UNIXタイムスタンプ）
    uint64 public timeCanSendAfter;
    // KYCの有効期限（UNIXタイムスタンプ）
    uint64 public kycExpiry;
    // STOからの購入可否
    bool public canBuyFromSto;
    // Identity管理用ONCHAINID
    IIdentity public onchainId;

    modifier onlyController() {
        if(_msgSender() != owner() && _msgSender() == spcAddress) {
            revert NonAuthorizedSender(_msgSender());
        }
        _;
    }

    /**
     * @notice 初期化
     * @param spcAddress_ トークンホルダの初期管理キー
     */
    function initialize(address spcAddress_) external initializer {
        if(spcAddress_ == address(0)) {
            revert InvalidSpcAddress(spcAddress_);
        }
        __AbstractUpgradeable_init();

        spcAddress = spcAddress_;
        onchainId = new Identity(spcAddress_, false);
    }

    /**
     * @notice パラメータ更新
     * @param params TokenHolderParams
     *  ・symbol ホールド対象のトークンシンボル
     *  ・spcAddress 権限管理用アドレス（SPCアドレス）
     *  ・walletAddress トークンホルダのウォレットアドレス
     *  ・timeCanReceiveAfter トークンを受け取ることができるようになる日時（UNIXタイムスタンプ）
     *  ・timeCanSendAfter トークンを移転できるようになる日時（UNIXタイムスタンプ）
     *  ・kycExpiry KYCの有効期限（UNIXタイムスタンプ）
     *  ・canBuyFromSto STOからの購入可否
     */
    function update(TokenHolderParams calldata params) external virtual onlyController {
        symbol = params.symbol;
        spcAddress = params.spcAddress;
        walletAddress = params.walletAddress;
        timeCanReceiveAfter = params.timeCanReceiveAfter;
        timeCanSendAfter = params.timeCanSendAfter;
        kycExpiry = params.kycExpiry;
        canBuyFromSto = params.canBuyFromSto;

        emit TokenHolderUpdated(
            params.symbol,
            params.spcAddress,
            params.walletAddress,
            params.timeCanReceiveAfter,
            params.timeCanSendAfter,
            params.kycExpiry,
            params.canBuyFromSto,
            address(this)
        );
    }

    /**
     * @notice KYCが手動で取り消されているか否か
     * @return bool KYC取り消し有無
     */
    function isRevoked() external virtual view returns (bool) {
        return (timeCanReceiveAfter | timeCanSendAfter | kycExpiry) == 0;
    }
}
